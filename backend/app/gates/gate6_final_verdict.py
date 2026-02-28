"""Gate 6: deterministic final verdict aggregation.

Hard rules:
- Gate 2 FAIL -> REJECT
- Impairment HIGH -> REJECT
- UNDETERMINED impairment cannot INVEST
- Market structure is signal-only and never vetoes
- Gate 5 is ignored when SKIPPED
"""

from __future__ import annotations

import logging
from typing import Any

from app.response_utils import error_response, missing_required_fields, ok_response, round_float, structured_log

logger = logging.getLogger(__name__)

GATE_NAME = "Gate 6 – Final Verdict"
_NON_BLOCKING_CLASSIFICATIONS = {"NO_SIGNAL", "NO_DATA", "NO_RELEVANT_DATA_FOUND"}


def _extract_gate_parts(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], str]:
    """Accept either full envelope or raw data payload."""
    if isinstance(payload.get("data"), dict):
        return payload.get("data", {}), payload.get("diagnostics", {}), str(payload.get("status", ""))
    return payload, {}, "OK"


def _deterministic_confidence(
    margin_of_safety: float | None,
    impairment_risk: str,
    market_structure: str,
    key_data_missing: bool,
) -> int:
    confidence = 50
    if margin_of_safety is not None and margin_of_safety < -1.0:
        confidence += 20
    if impairment_risk == "LOW":
        confidence += 10
    if market_structure == "HEADWIND":
        confidence -= 10
    if key_data_missing:
        confidence -= 10
    return max(0, min(100, confidence))


def _build_executive_summary(
    verdict: str,
    business_summary: str | None,
    valuation_pass: bool,
    valuation_band: str,
    margin_of_safety: float | None,
    impairment_risk: str,
    impairment_reason: str,
    market_classification: str,
) -> str:
    business_line = (
        f"Business context indicates {business_summary}."
        if business_summary
        else "Business context is limited in this run, so durability assessment is constrained."
    )

    if not valuation_pass:
        if valuation_band == "IMPAIRED":
            valuation_line = "Valuation fails discipline because intrinsic value is non-positive under the deterministic framework."
        elif margin_of_safety is not None and margin_of_safety < -1.0:
            valuation_line = "Valuation fails discipline with a deeply negative margin of safety versus the required threshold."
        else:
            valuation_line = "Valuation fails discipline because margin of safety is below the required threshold."
    else:
        valuation_line = "Valuation passes the required margin-of-safety discipline under the deterministic framework."

    if impairment_risk == "UNDETERMINED":
        impairment_line = (
            "Impairment risk is UNDETERMINED due to missing financing disclosures; this uncertainty prevents an INVEST outcome."
        )
    else:
        impairment_line = f"Impairment context is classified as {impairment_risk}, based on reported balance-sheet and refinancing inputs."

    if impairment_reason and "Interest expense not explicitly reported" in impairment_reason:
        impairment_line = (
            "Impairment context is UNDETERMINED because interest expense is not explicitly reported in SEC filings for this period."
        )

    if market_classification in _NON_BLOCKING_CLASSIFICATIONS:
        market_line = "Market-structure signals are not reliable for this period and do not alter the core valuation decision."
    else:
        market_line = f"Market-structure context is {market_classification} and is treated as a non-veto timing signal."

    decision_line = {
        "INVEST": "Decision: INVEST, as valuation discipline passes and impairment risk remains acceptable.",
        "WATCH": "Decision: WATCH, pending clearer risk confirmation under current data constraints.",
        "REJECT": "Decision: REJECT on valuation and risk discipline despite any underlying business strengths.",
    }[verdict]

    return " ".join([business_line, valuation_line, impairment_line, market_line, decision_line])


def aggregate_verdict(
    gate2_output: dict[str, Any],
    gate3_output: dict[str, Any],
    gate4_output: dict[str, Any],
    gate5_output: dict[str, Any],
    gate1_output: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Aggregate prior gate outputs without introducing any new valuation math."""
    inputs_used = [
        "gate2_output.pass",
        "gate2_output.margin_of_safety",
        "gate3_output.classification",
        "gate4_output.risk_level",
        "gate5_output.maximum_position_size",
    ]

    gate2_data, gate2_diag, _ = _extract_gate_parts(gate2_output)
    gate3_data, gate3_diag, _ = _extract_gate_parts(gate3_output)
    gate4_data, gate4_diag, _ = _extract_gate_parts(gate4_output)
    gate5_data, gate5_diag, gate5_status = _extract_gate_parts(gate5_output)

    required_fields = {
        "gate3_output.classification": gate3_data.get("classification"),
        "gate4_output.risk_level": gate4_data.get("risk_level"),
    }
    if gate2_data.get("pass") is None and gate2_data.get("passes") is None:
        required_fields["gate2_output.pass"] = None

    missing = missing_required_fields(required_fields)
    if missing:
        return error_response(
            gate=GATE_NAME,
            code="FINAL_VERDICT_MISSING_INPUTS",
            message=f"Missing required inputs: {', '.join(missing)}",
            inputs_used=inputs_used,
            missing_inputs=missing,
        )

    try:
        valuation_pass = bool(gate2_data.get("pass") or gate2_data.get("passes"))
        valuation_band = str(gate2_data.get("valuation_band", "UNKNOWN")).upper()
        margin_of_safety = gate2_data.get("margin_of_safety")
        margin_of_safety = float(margin_of_safety) if margin_of_safety is not None else None

        market_classification = str(gate3_data.get("classification", "NO_RELEVANT_DATA_FOUND")).upper()
        impairment_risk = str(gate4_data.get("risk_level", "UNDETERMINED")).upper()
        impairment_reason = str(gate4_data.get("reason", gate4_data.get("reasoning", "")))

        gate5_skipped = gate5_status == "SKIPPED" or str(gate5_data.get("status", "")).upper() == "SKIPPED"
        max_position_size = gate5_data.get("maximum_position_size")

        if not valuation_pass:
            verdict = "REJECT"
            setup_label = "Valuation discipline breached"
        elif impairment_risk == "HIGH":
            verdict = "REJECT"
            setup_label = "Impairment risk elevated"
        elif impairment_risk == "UNDETERMINED":
            verdict = "WATCH"
            setup_label = "Impairment unresolved"
        elif impairment_risk == "LOW":
            verdict = "INVEST"
            setup_label = "Risk acceptable"
        else:
            verdict = "WATCH"
            setup_label = "Risk moderate"

        key_data_missing = any(
            bool(diag.get("missing_inputs", []))
            for diag in [gate2_diag, gate3_diag, gate4_diag, gate5_diag]
        )
        confidence = _deterministic_confidence(
            margin_of_safety=margin_of_safety,
            impairment_risk=impairment_risk,
            market_structure=market_classification,
            key_data_missing=key_data_missing,
        )

        business_summary = gate1_output.get("business_summary") if gate1_output else None
        business_complexity = gate1_output.get("business_complexity") if gate1_output else None

        summary = _build_executive_summary(
            verdict=verdict,
            business_summary=business_summary,
            valuation_pass=valuation_pass,
            valuation_band=valuation_band,
            margin_of_safety=margin_of_safety,
            impairment_risk=impairment_risk,
            impairment_reason=impairment_reason,
            market_classification=market_classification,
        )

        gate5_line = (
            "SKIPPED — Valuation gate failed — position sizing not applicable."
            if gate5_skipped
            else (
                f"{round_float(float(max_position_size), 1)}% NAV"
                if isinstance(max_position_size, (int, float))
                else "N/A"
            )
        )

        result: dict[str, Any] = {
            "verdict": verdict,
            "confidence": confidence,
            "summary": summary,
            "key_drivers": ["Valuation", "Impairment risk", "Market structure"],
            "confidence_score": round_float(confidence / 100.0, 2),
            "investment_stance": {
                "INVEST": "Valuation discipline met with acceptable impairment risk",
                "WATCH": "Valuation/risk signals are incomplete or mixed",
                "REJECT": "Valuation or impairment discipline not met",
            }[verdict],
            "setup_label": setup_label,
            "risk_notes": " | ".join([
                f"Valuation band: {valuation_band}",
                f"Impairment risk: {impairment_risk}",
                f"Market structure: {market_classification}",
            ]),
            "margin_of_safety": round_float(margin_of_safety, 4) if margin_of_safety is not None else None,
            "valuation_band": valuation_band,
            "market_classification": market_classification,
            "impairment_risk": impairment_risk,
            "gate_summary": {
                "gate2_valuation": str(gate2_data.get("one_liner", valuation_band)),
                "gate3_market_structure": str(gate3_data.get("classification", "NO_RELEVANT_DATA_FOUND")),
                "gate4_impairment": str(gate4_data.get("risk_level", "UNDETERMINED")),
                "gate5_position_sizing": gate5_line,
            },
            "business_summary": business_summary,
            "business_complexity": business_complexity,
            "decision_summary": summary,
        }

        if verdict == "INVEST" and not gate5_skipped and isinstance(max_position_size, (int, float)):
            result["max_position_size"] = round_float(float(max_position_size), 1)

        structured_log(logger, "info", "final_verdict_computed", gate=GATE_NAME, verdict=verdict, confidence=confidence)
        return ok_response(
            gate=GATE_NAME,
            data=result,
            inputs_used=inputs_used,
            confidence=confidence,
            one_liner=f"{verdict} — {setup_label}",
        )

    except Exception as error:
        structured_log(logger, "error", "final_verdict_unexpected_error", gate=GATE_NAME, error=str(error))
        return error_response(
            gate=GATE_NAME,
            code="FINAL_VERDICT_INTERNAL_ERROR",
            message=f"Final verdict aggregation failed: {error}",
            inputs_used=inputs_used,
        )
