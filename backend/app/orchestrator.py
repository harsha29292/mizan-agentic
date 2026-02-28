"""Orchestrator Agent — controls gate execution flow.

Responsibilities:
- Run gates in order (0 → 1 → data → 2 → 3 → 4 → 5 → 6)
- Decide retry vs abort on failures
- Track data sufficiency across the pipeline
- Suppress downstream gates when upstream has FAIL/REJECT signals
- Compute pipeline-level confidence
- NEVER touch numbers, NEVER modify gate outputs, ONLY decide flow and narration
"""

from __future__ import annotations

import logging
from typing import Any

from app.gates.gate0_identity import resolve_identity
from app.gates.gate1_business_context import analyze_business_context
from app.gates.gate2_valuation import calculate_valuation
from app.gates.gate3_market_structure import analyze_market_structure
from app.gates.gate4_impairment import assess_impairment_risk
from app.gates.gate5_position_sizing import calculate_position_size
from app.gates.gate6_final_verdict import aggregate_verdict
from app.data_fetchers.sec_fetcher import fetch_sec_data, fetch_sec_business_context
from app.data_fetchers.polygon_fetcher import fetch_polygon_data
from app.data_fetchers.fred_fetcher import fetch_fred_data
from app.response_utils import compute_pipeline_confidence, structured_log, utc_timestamp

logger = logging.getLogger(__name__)


def _is_fatal(result: dict[str, Any]) -> bool:
    """True if the gate result is a hard failure that should stop the pipeline."""
    return result.get("status") == "ERROR"


def _is_partial(result: dict[str, Any]) -> bool:
    """True if the gate result has partial data (degraded but usable)."""
    return result.get("status") == "PARTIAL"


def _gate_confidence(result: dict[str, Any]) -> int:
    """Extract confidence from a gate result (0-100)."""
    return int(result.get("confidence", 0))


def _should_suppress_sizing(gate2_result: dict[str, Any], gate4_result: dict[str, Any]) -> bool:
    """Determine whether Gate 5 position sizing should be suppressed.

    Suppress when:
    - Valuation FAIL (gate2 pass=False)
    """
    g2_data = gate2_result.get("data", {})
    valuation_fail = not bool(g2_data.get("pass") or g2_data.get("passes"))
    return valuation_fail


def run_pipeline(company_input: str) -> dict[str, Any]:
    """Execute the full Mizan analysis pipeline.

    Returns the complete response envelope with all gate outputs,
    pipeline metadata, and computed confidence.
    """
    structured_log(logger, "info", "pipeline_started", company_input=company_input)

    outputs: dict[str, Any] = {}
    gate_results: list[dict[str, Any]] = []  # full result dicts for compute_pipeline_confidence
    pipeline_notes: list[str] = []

    # ---------------------------------------------------------------
    # Gate 0: Identity Resolution (deterministic, must pass)
    # ---------------------------------------------------------------
    identity_result = resolve_identity(company_input)
    outputs["identity"] = identity_result
    gate_results.append(identity_result)

    if _is_fatal(identity_result):
        return _pipeline_error("identity", identity_result, outputs, gate_results)

    identity_data = identity_result["data"]
    ticker = identity_data["ticker"]
    cik = identity_data["cik"]
    structured_log(logger, "info", "identity_resolved", ticker=ticker, cik=cik)

    # ---------------------------------------------------------------
    # Data fetching phase (SEC, Polygon, FRED — all must succeed)
    # ---------------------------------------------------------------
    sec_result = fetch_sec_data(cik)
    outputs["sec"] = sec_result
    if _is_fatal(sec_result):
        return _pipeline_error("sec", sec_result, outputs, gate_results)

    # Gate 1 — business context (non-blocking: failure does not halt pipeline)
    gate1_data: dict[str, Any] | None = None
    try:
        biz_ctx_result = fetch_sec_business_context(cik)
        outputs["sec_business_context"] = biz_ctx_result
        if biz_ctx_result["status"] in ("OK", "PARTIAL"):
            biz = biz_ctx_result["data"]
            gate1_result = analyze_business_context(
                company_name=biz.get("company_name", ""),
                sic_description=biz.get("sic_description", ""),
                business_description=biz.get("business_description"),
                risk_factors=biz.get("risk_factors"),
                entity_type=biz.get("entity_type"),
                sic=biz.get("sic"),
            )
            outputs["gate1"] = gate1_result
            gate_results.append(gate1_result)
            if gate1_result["status"] in ("OK", "PARTIAL"):
                gate1_data = gate1_result["data"]
        else:
            pipeline_notes.append("Gate 1 skipped — SEC business context unavailable")
    except Exception as gate1_err:
        structured_log(
            logger, "warning", "gate1_non_blocking_failure",
            error=str(gate1_err),
        )
        pipeline_notes.append(f"Gate 1 failed (non-blocking): {gate1_err}")

    polygon_result = fetch_polygon_data(ticker)
    outputs["polygon"] = polygon_result
    if _is_fatal(polygon_result):
        return _pipeline_error("polygon", polygon_result, outputs, gate_results)

    fred_result = fetch_fred_data()
    outputs["fred"] = fred_result
    if _is_fatal(fred_result):
        return _pipeline_error("fred", fred_result, outputs, gate_results)

    # ---------------------------------------------------------------
    # Gate 2: Valuation (deterministic + supervisor agent)
    # ---------------------------------------------------------------
    gate2_result = calculate_valuation(
        market_price=polygon_result["data"]["market_price"],
        net_income=sec_result["data"]["net_income"],
        free_cashflow=sec_result["data"]["free_cashflow"],
        total_debt=sec_result["data"]["total_debt"],
        cash=sec_result["data"]["cash"],
        shares_outstanding=sec_result["data"]["shares_outstanding"],
    )
    outputs["gate2"] = gate2_result
    gate_results.append(gate2_result)
    if _is_fatal(gate2_result):
        return _pipeline_error("gate2", gate2_result, outputs, gate_results)

    # ---------------------------------------------------------------
    # Gate 3: Market Structure (agentic LLM classification)
    # ---------------------------------------------------------------
    gate3_result = analyze_market_structure(
        last_price=polygon_result["data"]["last_price"],
        last_volume=polygon_result["data"]["last_volume"],
        avg_volume=polygon_result["data"]["avg_volume"],
        volume_spike=polygon_result["data"]["volume_spike"],
        price_direction=polygon_result["data"]["price_direction"],
        flow_signal=polygon_result["data"]["flow_signal"],
        yes_price=polygon_result["data"].get("yes_price"),
        no_price=polygon_result["data"].get("no_price"),
        macro_signal=polygon_result["data"].get("macro_signal", fred_result["data"]["macro_signal"]),
    )
    outputs["gate3"] = gate3_result
    gate_results.append(gate3_result)
    if _is_fatal(gate3_result):
        return _pipeline_error("gate3", gate3_result, outputs, gate_results)

    # ---------------------------------------------------------------
    # Gate 4: Impairment Risk (agentic LLM classification)
    # ---------------------------------------------------------------
    gate4_business_context = None
    if gate1_data:
        gate4_business_context = gate1_data.get("business_summary", "")

    gate4_result = assess_impairment_risk(
        net_income=sec_result["data"]["net_income"],
        free_cashflow=sec_result["data"]["free_cashflow"],
        cash=sec_result["data"]["cash"],
        total_debt=sec_result["data"]["total_debt"],
        net_debt=gate2_result["data"].get("net_debt"),
        interest_expense=sec_result["data"]["interest_expense"],
        interest_coverage=sec_result["data"]["interest_coverage"],
        shares_outstanding=sec_result["data"]["shares_outstanding"],
        interest_rate=fred_result["data"]["interest_rate"],
        credit_stress=fred_result["data"]["credit_stress"],
        credit_stress_index=fred_result["data"]["credit_stress_index"],
        business_context=gate4_business_context,
    )
    outputs["gate4"] = gate4_result
    gate_results.append(gate4_result)
    if _is_fatal(gate4_result):
        return _pipeline_error("gate4", gate4_result, outputs, gate_results)

    # ---------------------------------------------------------------
    # Gate 5: Position Sizing (deterministic + agentic overlay)
    # Suppress if upstream REJECT signals detected
    # ---------------------------------------------------------------
    upstream_reject = _should_suppress_sizing(gate2_result, gate4_result)
    if upstream_reject:
        pipeline_notes.append("Gate 5 sizing suppressed — upstream REJECT detected")

    gate5_result = calculate_position_size(
        volatility=polygon_result["data"]["volatility"],
        max_drawdown=polygon_result["data"]["max_drawdown"],
        interest_rate=fred_result["data"]["interest_rate"],
        credit_stress=fred_result["data"]["credit_stress"],
        correlation_index=polygon_result["data"]["correlation_index"],
        upstream_reject=upstream_reject,
    )
    outputs["gate5"] = gate5_result
    gate_results.append(gate5_result)
    if _is_fatal(gate5_result):
        return _pipeline_error("gate5", gate5_result, outputs, gate_results)

    # ---------------------------------------------------------------
    # Gate 6: Final Verdict (deterministic rules + agentic rationale)
    # ---------------------------------------------------------------
    final_result = aggregate_verdict(
        gate2_output=gate2_result,
        gate3_output=gate3_result,
        gate4_output=gate4_result,
        gate5_output=gate5_result,
        gate1_output=gate1_data,
    )
    outputs["final"] = final_result
    gate_results.append(final_result)
    if _is_fatal(final_result):
        return _pipeline_error("final", final_result, outputs, gate_results)

    # ---------------------------------------------------------------
    # Pipeline metadata
    # ---------------------------------------------------------------
    pipeline_confidence = compute_pipeline_confidence(gate_results)
    verdict = final_result.get("data", {}).get("verdict", "UNKNOWN")

    # Collect one-liners from all gates for summary
    gate_one_liners = {}
    for key in ["identity", "gate1", "gate2", "gate3", "gate4", "gate5", "final"]:
        result = outputs.get(key)
        if result and result.get("one_liner"):
            gate_one_liners[key] = result["one_liner"]

    response = {
        "status": "OK",
        **outputs,
        "pipeline": {
            "confidence": pipeline_confidence,
            "gate_confidences": {
                k: _gate_confidence(v)
                for k, v in outputs.items()
                if isinstance(v, dict) and "confidence" in v
            },
            "gate_one_liners": gate_one_liners,
            "notes": pipeline_notes if pipeline_notes else None,
        },
        "metadata": {
            "timestamp": utc_timestamp(),
            "inputs_used": ["company_input"],
            "verdict": verdict,
        },
    }

    structured_log(
        logger,
        "info",
        "pipeline_completed",
        company_input=company_input,
        verdict=verdict,
        pipeline_confidence=pipeline_confidence,
    )
    return response


def _pipeline_error(
    failed_stage: str,
    failed_result: dict[str, Any],
    outputs: dict[str, Any],
    gate_results: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build error response when a gate fails fatally."""
    pipeline_confidence = compute_pipeline_confidence(gate_results) if gate_results else 0

    return {
        "status": "ERROR",
        "failed_stage": failed_stage,
        "error": failed_result.get("error"),
        **outputs,
        "pipeline": {
            "confidence": pipeline_confidence,
            "gate_confidences": {
                k: _gate_confidence(v)
                for k, v in outputs.items()
                if isinstance(v, dict) and "confidence" in v
            },
            "notes": [f"Pipeline halted at {failed_stage}"],
        },
        "metadata": {
            "timestamp": utc_timestamp(),
            "inputs_used": ["company_input"],
        },
    }
