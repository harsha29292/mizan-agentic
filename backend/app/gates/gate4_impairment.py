"""Gate 4: LLM-based permanent impairment risk classification (AGENTIC).

Allowed outputs: LOW | MEDIUM | HIGH | UNDETERMINED

Rules:
- Must cite cash, debt, interest_coverage, rates, credit_stress in reasoning.
- If key financial inputs are missing → UNDETERMINED (never ERROR for data gaps).
- LLM classifies only; never computes or invents thresholds.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from app.gates.llm_output_parser import parse_json_object
from app.llm_config import get_gemini_llm
from app.response_utils import missing_required_fields, ok_response, structured_log

logger = logging.getLogger(__name__)

GATE_NAME = "Gate 4 – Impairment Risk"
VALID_RISK_LEVELS = {"LOW", "MEDIUM", "HIGH", "UNDETERMINED"}
VALID_RISK_DRIVERS = {"LEVERAGE", "REFINANCING", "CASH_FLOW", "NONE"}
VALID_CREDIT_STRESS = {"LOW", "MEDIUM", "HIGH"}

# Core impairment inputs — if ANY of these are missing, gate returns UNDETERMINED
CORE_IMPAIRMENT_FIELDS = ["cash", "total_debt", "interest_rate", "credit_stress"]


def _undetermined_response(
    inputs_used: list[str],
    reason: str,
    missing_inputs: list[str] | None = None,
) -> dict[str, Any]:
    data = {
        "risk_level": "UNDETERMINED",
        "risk_driver": "NONE",
        "confidence": 0,
        "reason": reason,
        "reasoning": reason,
        "reasoning_valid": True,
        "units": {
            "interest_rate": "decimal",
            "credit_stress_index": "NFCI_raw_index",
        },
    }
    return ok_response(
        gate=GATE_NAME,
        data=data,
        inputs_used=inputs_used,
        confidence=0,
        one_liner=f"UNDETERMINED — {reason}",
        missing_inputs=missing_inputs,
        binding_constraint="DATA_AVAILABILITY",
    )


def _reasoning_meets_constraints(reasoning: str) -> tuple[bool, str]:
    text = reasoning.lower()
    has_cash_vs_debt = "cash" in text and "debt" in text
    has_coverage = "coverage" in text
    has_refinancing = any(token in text for token in ["refinanc", "interest rate", "credit stress", "credit", "rate"])

    if not has_cash_vs_debt:
        return False, "Reasoning must explicitly cite cash vs debt"
    if not has_coverage:
        return False, "Reasoning must explicitly cite coverage"
    if not has_refinancing:
        return False, "Reasoning must explicitly cite refinancing environment"
    return True, ""


def assess_impairment_risk(
    net_income: float | None,
    free_cashflow: float | None,
    cash: float | None,
    total_debt: float | None,
    net_debt: float | None,
    interest_expense: float | None,
    interest_coverage: float | None,
    shares_outstanding: float | None,
    interest_rate: float | None,
    credit_stress: str | None,
    credit_stress_index: float | None,
    business_context: str | None = None,
) -> dict[str, Any]:
    """Assess permanent impairment risk as LOW, MEDIUM, HIGH, or UNDETERMINED."""
    inputs_used = [
        "net_income",
        "free_cashflow",
        "cash",
        "total_debt",
        "net_debt",
        "interest_expense",
        "interest_coverage",
        "shares_outstanding",
        "interest_rate",
        "credit_stress",
        "credit_stress_index",
    ]

    # Check for core impairment fields first — if missing, return UNDETERMINED
    core_check = {
        "cash": cash,
        "total_debt": total_debt,
        "interest_rate": interest_rate,
        "credit_stress": credit_stress,
    }
    core_missing = [k for k, v in core_check.items() if v is None]
    if core_missing:
        structured_log(
            logger, "warning", "impairment_undetermined_missing_inputs",
            gate=GATE_NAME, missing=core_missing,
        )
        return _undetermined_response(
            inputs_used=inputs_used,
            reason=f"Cannot assess impairment — missing core inputs: {', '.join(core_missing)}.",
            missing_inputs=core_missing,
        )

    if interest_expense is None and interest_coverage is None:
        return _undetermined_response(
            inputs_used=inputs_used,
            reason="Interest expense not explicitly reported in SEC filings for this period.",
            missing_inputs=["interest_expense", "interest_coverage"],
        )

    # Check remaining non-core fields
    all_inputs = {
        "net_income": net_income,
        "cash": cash,
        "total_debt": total_debt,
        "net_debt": net_debt,
        "interest_expense": interest_expense,
        "interest_coverage": interest_coverage,
        "shares_outstanding": shares_outstanding,
        "interest_rate": interest_rate,
        "credit_stress": credit_stress,
        "credit_stress_index": credit_stress_index,
    }
    all_missing = missing_required_fields(all_inputs)
    has_partial_inputs = len(all_missing) > 0

    normalized_credit_stress = str(credit_stress).upper()
    if normalized_credit_stress not in VALID_CREDIT_STRESS:
        return _undetermined_response(
            inputs_used=inputs_used,
            reason=f"Cannot assess impairment — invalid credit_stress value: {credit_stress}",
            missing_inputs=["credit_stress"],
        )

    if float(interest_rate) > 1.0:
        return _undetermined_response(
            inputs_used=inputs_used,
            reason="Cannot assess impairment — interest_rate must be decimal (e.g., 0.0364 for 3.64%).",
            missing_inputs=["interest_rate"],
        )

    if not os.getenv("GOOGLE_API_KEY"):
        return _undetermined_response(
            inputs_used=inputs_used,
            reason="Impairment model unavailable for this run.",
        )

    try:
        llm = get_gemini_llm(temperature=0)
        # Gate 1 business context (language reference only — does NOT influence risk level)
        business_context_block = ""
        if business_context:
            business_context_block = (
                f"\nBusiness context (for language reference only — "
                f"do NOT let this influence risk_level or risk_driver):\n"
                f"{business_context[:2000]}\n"
            )

        prompt = f"""You are a strict impairment risk classifier in an internal risk system.

Allowed risk_level: LOW, MEDIUM, HIGH
(If data is insufficient for a confident assessment, choose the most conservative level you can support.)

Hard rules:
- Use ONLY the provided inputs below. Do NOT compute new ratios or invent thresholds.
- No forward-looking claims. No macro opinions. No fluff.
- Reasoning must be at most 3 sentences and MUST explicitly cite:
  1) cash vs debt position,
  2) interest coverage,
  3) refinancing environment (rates/credit stress).
- Use Bloomberg terminal tone: precise, neutral, professional.
{business_context_block}
Inputs:
- net income: {net_income if net_income is not None else "N/A"}
- free cash flow: {free_cashflow if free_cashflow is not None else "N/A"}
- cash: {cash}
- total debt: {total_debt}
- net debt: {net_debt if net_debt is not None else "N/A"}
- interest expense: {interest_expense if interest_expense is not None else "N/A"}
- interest coverage: {interest_coverage}
- shares outstanding: {shares_outstanding if shares_outstanding is not None else "N/A"}
- interest rate: {interest_rate}
- credit stress: {normalized_credit_stress}
- credit stress index: {credit_stress_index if credit_stress_index is not None else "N/A"}

Return valid JSON only:
{{
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "risk_driver": "LEVERAGE" | "REFINANCING" | "CASH_FLOW" | "NONE",
  "reasoning": "max 3 sentences citing cash/debt, coverage, and rates/credit"
}}
"""

        result = llm.invoke(prompt)
        payload = parse_json_object(getattr(result, "content", result))
        risk_level = str(payload.get("risk_level", "")).strip().upper()
        risk_driver = str(payload.get("risk_driver", "")).strip().upper()
        reasoning = str(payload.get("reasoning", "")).strip()

        if risk_level not in VALID_RISK_LEVELS:
            return _undetermined_response(
                inputs_used=inputs_used,
                reason=f"Impairment model returned invalid risk level: {risk_level}",
            )

        if risk_driver not in VALID_RISK_DRIVERS:
            risk_driver = "NONE"  # Graceful fallback instead of hard error

        if not reasoning:
            return _undetermined_response(
                inputs_used=inputs_used,
                reason="Impairment model returned empty reasoning.",
            )

        # Validate reasoning references key concepts
        valid_reasoning, reason_message = _reasoning_meets_constraints(reasoning)
        if not valid_reasoning:
            # Downgrade confidence but don't error — surface the issue
            structured_log(
                logger, "warning", "impairment_reasoning_weak",
                gate=GATE_NAME, issue=reason_message,
            )

        # Confidence scoring
        if risk_level == "UNDETERMINED":
            gate_confidence = 0
        elif risk_level == "HIGH":
            gate_confidence = 85 if valid_reasoning else 60
        elif risk_level == "LOW":
            gate_confidence = 80 if valid_reasoning else 55
        else:  # MEDIUM
            gate_confidence = 70 if valid_reasoning else 50

        # Deduct for partial inputs
        if has_partial_inputs:
            gate_confidence = max(20, gate_confidence - 10)

        one_liner = f"{risk_level} impairment risk — driver: {risk_driver}"

        data = {
            "risk_level": risk_level,
            "risk_driver": risk_driver,
            "credit_stress": normalized_credit_stress,
            "credit_stress_index": float(credit_stress_index) if credit_stress_index is not None else None,
            "reasoning": reasoning,
            "reasoning_valid": valid_reasoning,
            "units": {
                "interest_rate": "decimal",
                "credit_stress_index": "NFCI_raw_index",
            },
        }
        structured_log(logger, "info", "impairment_assessed", gate=GATE_NAME, risk_level=risk_level)

        if has_partial_inputs:
            return ok_response(
                gate=GATE_NAME,
                data=data,
                inputs_used=inputs_used,
                confidence=gate_confidence,
                one_liner=one_liner,
                missing_inputs=all_missing,
                binding_constraint="DATA_AVAILABILITY",
            )
        return ok_response(
            gate=GATE_NAME, data=data, inputs_used=inputs_used,
            confidence=gate_confidence, one_liner=one_liner,
        )

    except Exception as error:
        structured_log(logger, "error", "impairment_unexpected_error", gate=GATE_NAME, error=str(error))
        return _undetermined_response(
            inputs_used=inputs_used,
            reason=f"Impairment risk assessment failed: {error}",
        )
