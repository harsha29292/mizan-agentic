"""Gate 5: Deterministic conservative position sizing + agentic overlay.

Core sizing is 100% deterministic (factor-based). An optional LLM agent
explains the binding constraint and flags when the size is unusually
small or large — it NEVER modifies the calculated numbers.

If upstream verdict is REJECT, sizing is SKIPPED (not applicable).
"""

from __future__ import annotations

import logging
import os
from typing import Any

from app.response_utils import format_decimal_with_percent_label, missing_required_fields, ok_response, round_float, skipped_response, structured_log

logger = logging.getLogger(__name__)

GATE_NAME = "Gate 5 – Position Sizing"
VALID_CREDIT_STRESS = {"LOW", "MEDIUM", "HIGH"}


def _volatility_factor(volatility: float) -> float:
    if volatility <= 0.20:
        return 1.00
    if volatility <= 0.35:
        return 0.85
    if volatility <= 0.50:
        return 0.70
    return 0.55


def _drawdown_factor(max_drawdown: float) -> float:
    if max_drawdown <= 0.15:
        return 1.00
    if max_drawdown <= 0.30:
        return 0.85
    if max_drawdown <= 0.45:
        return 0.70
    return 0.55


def _correlation_factor(correlation_index: float) -> float:
    if correlation_index <= 0.30:
        return 1.00
    if correlation_index <= 0.60:
        return 0.85
    if correlation_index <= 0.80:
        return 0.70
    return 0.55


def _macro_factor(interest_rate: float, credit_stress: str) -> float:
    if interest_rate <= 0.03:
        rate_factor = 1.00
    elif interest_rate <= 0.05:
        rate_factor = 0.90
    elif interest_rate <= 0.07:
        rate_factor = 0.80
    else:
        rate_factor = 0.70

    credit_factor = {
        "LOW": 1.00,
        "MEDIUM": 0.85,
        "HIGH": 0.70,
    }[credit_stress]
    return min(rate_factor, credit_factor)


def _binding_constraint(factors: dict[str, float]) -> str:
    min_factor = min(factors.values())
    precedence = ["VOLATILITY", "DRAWDOWN", "CORRELATION", "MACRO"]
    for key in precedence:
        if factors[key] == min_factor:
            return key
    return "MACRO"


def _mechanical_explanation(binding_constraint: str) -> str:
    explanations = {
        "VOLATILITY": "Volatility band set the lowest sizing factor, which bound maximum position size.",
        "DRAWDOWN": "Drawdown band set the lowest sizing factor, which bound maximum position size.",
        "CORRELATION": "Correlation band set the lowest sizing factor, which bound maximum position size.",
        "MACRO": "Macro band from interest_rate and credit_stress set the lowest sizing factor, which bound maximum position size.",
    }
    return explanations[binding_constraint]


def _run_sizing_agent(
    position_size: float,
    binding_constraint: str,
    factors: dict[str, float],
    volatility: float,
    max_drawdown: float,
    interest_rate: float,
    credit_stress: str,
    correlation_index: float,
) -> dict[str, str] | None:
    """Agentic overlay: LLM explains WHY the position size is what it is.
    Returns a dict with 'narrative' and 'flag' (NORMAL | SMALL | LARGE).
    Never modifies numbers."""
    if not os.getenv("GOOGLE_API_KEY"):
        return None

    try:
        from app.gates.llm_output_parser import parse_json_object
        from app.llm_config import get_gemini_llm

        llm = get_gemini_llm(temperature=0)
        prompt = f"""You are an internal risk system sizing agent. Your ONLY job is to explain
the computed position size in 1-2 sentences and flag if the size is unusually small or large.

HARD RULES:
- Do NOT change any numbers. The position size is {position_size:.1f}% NAV — that is final.
- Do NOT recommend trades or provide investment advice.
- Use Bloomberg terminal tone: precise, neutral, professional.
- Reference the binding constraint and relevant factor values.

Computed outputs:
- position size: {position_size:.1f}% NAV
- binding constraint: {binding_constraint}
- factors: VOLATILITY={factors['VOLATILITY']:.2f}, DRAWDOWN={factors['DRAWDOWN']:.2f}, CORRELATION={factors['CORRELATION']:.2f}, MACRO={factors['MACRO']:.2f}

Inputs used:
- volatility: {volatility:.4f}
- max drawdown: {max_drawdown:.4f}
- interest rate: {interest_rate:.4f}
- credit stress: {credit_stress}
- correlation index: {correlation_index:.4f}

Return valid JSON only:
{{
  "narrative": "1-2 sentences explaining the binding constraint and overall size",
  "flag": "NORMAL" | "SMALL" | "LARGE"
}}
"""
        result = llm.invoke(prompt)
        payload = parse_json_object(getattr(result, "content", result))
        narrative = str(payload.get("narrative", "")).strip()
        flag = str(payload.get("flag", "NORMAL")).strip().upper()
        if flag not in {"NORMAL", "SMALL", "LARGE"}:
            flag = "NORMAL"
        return {"narrative": narrative, "flag": flag} if narrative else None
    except Exception as e:
        structured_log(logger, "warning", "sizing_agent_failed", gate=GATE_NAME, error=str(e))
        return None


def calculate_position_size(
    volatility: float | None,
    max_drawdown: float | None,
    interest_rate: float | None,
    credit_stress: str | None,
    correlation_index: float | None,
    upstream_reject: bool = False,
) -> dict[str, Any]:
    """Calculate max position size as % NAV using fixed conservative factors.
    
    If upstream_reject is True (valuation FAIL or HIGH impairment), sizing
    is SKIPPED and returns null max size with an explanation.
    """
    inputs_used = [
        "volatility",
        "max_drawdown",
        "interest_rate",
        "credit_stress",
        "correlation_index",
    ]

    # Suppress sizing if upstream gates have already rejected
    if upstream_reject:
        skipped_data = {
            "status": "SKIPPED",
            "maximum_position_size": None,
            "confidence": 0,
            "reason": "Valuation gate failed — position sizing not applicable.",
        }
        structured_log(logger, "info", "position_sizing_skipped", gate=GATE_NAME)
        return skipped_response(
            gate=GATE_NAME,
            data=skipped_data,
            inputs_used=inputs_used,
            reason="Valuation gate failed — position sizing not applicable.",
            binding_constraint="NOT_APPLICABLE",
        )

    required_inputs = {
        "volatility": volatility,
        "max_drawdown": max_drawdown,
        "interest_rate": interest_rate,
        "credit_stress": credit_stress,
        "correlation_index": correlation_index,
    }
    missing = missing_required_fields(required_inputs)
    if missing:
        return skipped_response(
            gate=GATE_NAME,
            data={
                "status": "SKIPPED",
                "maximum_position_size": None,
                "confidence": 0,
                "reason": f"Position sizing skipped — missing required inputs: {', '.join(missing)}.",
            },
            inputs_used=inputs_used,
            missing_inputs=missing,
            reason=f"Position sizing skipped — missing required inputs: {', '.join(missing)}.",
            binding_constraint="DATA_AVAILABILITY",
        )

    try:
        base_size = 10.0
        normalized_credit_stress = str(credit_stress).upper()
        if normalized_credit_stress not in VALID_CREDIT_STRESS:
            return skipped_response(
                gate=GATE_NAME,
                data={
                    "status": "SKIPPED",
                    "maximum_position_size": None,
                    "confidence": 0,
                    "reason": f"Position sizing skipped — invalid credit_stress: {credit_stress}",
                },
                inputs_used=inputs_used,
                reason=f"Position sizing skipped — invalid credit_stress: {credit_stress}",
                binding_constraint="DATA_AVAILABILITY",
            )

        if float(interest_rate) > 1.0:
            return skipped_response(
                gate=GATE_NAME,
                data={
                    "status": "SKIPPED",
                    "maximum_position_size": None,
                    "confidence": 0,
                    "reason": "Position sizing skipped — interest_rate must be decimal (e.g., 0.0364 for 3.64%).",
                },
                inputs_used=inputs_used,
                reason="Position sizing skipped — interest_rate must be decimal (e.g., 0.0364 for 3.64%).",
                binding_constraint="DATA_AVAILABILITY",
            )

        factors = {
            "VOLATILITY": _volatility_factor(float(volatility)),
            "DRAWDOWN": _drawdown_factor(float(max_drawdown)),
            "CORRELATION": _correlation_factor(float(correlation_index)),
            "MACRO": _macro_factor(float(interest_rate), normalized_credit_stress),
        }

        position_size = base_size
        for factor in factors.values():
            position_size *= factor

        position_size = max(1.0, min(position_size, 10.0))
        binding_constraint = _binding_constraint(factors)

        # Agentic overlay: LLM explains the binding constraint
        agent_output = _run_sizing_agent(
            position_size=position_size,
            binding_constraint=binding_constraint,
            factors=factors,
            volatility=float(volatility),
            max_drawdown=float(max_drawdown),
            interest_rate=float(interest_rate),
            credit_stress=normalized_credit_stress,
            correlation_index=float(correlation_index),
        )

        # Confidence: deterministic core is always high confidence
        gate_confidence = 75

        one_liner = f"{round_float(position_size, 1):.1f}% NAV — bound by {binding_constraint}"

        data = {
            "maximum_position_size": round_float(position_size, 1),
            "binding_constraint": binding_constraint,
            "explanation": _mechanical_explanation(binding_constraint),
            "volatility": round_float(float(volatility), 6),
            "max_drawdown": round_float(float(max_drawdown), 6),
            "interest_rate": round_float(float(interest_rate), 6),
            "credit_stress": normalized_credit_stress,
            "correlation_index": round_float(float(correlation_index), 6),
            "factors": factors,
            "units": {
                "maximum_position_size": "percent_of_nav",
                "volatility": "annualized_decimal",
                "max_drawdown": "decimal_peak_to_trough",
                "interest_rate": "decimal",
                "correlation_index": "absolute_correlation_decimal",
            },
            "display": {
                "maximum_position_size": f"{round_float(position_size, 1):.1f}%",
                "volatility": format_decimal_with_percent_label(float(volatility)),
                "max_drawdown": format_decimal_with_percent_label(float(max_drawdown)),
                "interest_rate": format_decimal_with_percent_label(float(interest_rate)),
                "correlation_index": str(round_float(float(correlation_index), 4)),
            },
            "macro_components": {
                "interest_rate": round_float(float(interest_rate), 6),
                "credit_stress": normalized_credit_stress,
            },
            "idiosyncratic_components": {
                "volatility": round_float(float(volatility), 6),
                "max_drawdown": round_float(float(max_drawdown), 6),
                "correlation_index": round_float(float(correlation_index), 6),
            },
            "systematic_risk_components": {
                "interest_rate": round_float(float(interest_rate), 6),
                "credit_stress": normalized_credit_stress,
                "correlation_index": round_float(float(correlation_index), 6),
            },
        }

        # Attach agent overlay if available
        if agent_output:
            data["agent_overlay"] = agent_output

        structured_log(
            logger,
            "info",
            "position_sized",
            gate=GATE_NAME,
            maximum_position_size=data["maximum_position_size"],
            binding_constraint=data["binding_constraint"],
        )
        return ok_response(
            gate=GATE_NAME,
            data=data,
            inputs_used=inputs_used,
            confidence=gate_confidence,
            one_liner=one_liner,
        )

    except Exception as error:
        structured_log(logger, "error", "position_sizing_unexpected_error", gate=GATE_NAME, error=str(error))
        return skipped_response(
            gate=GATE_NAME,
            data={
                "status": "SKIPPED",
                "maximum_position_size": None,
                "confidence": 0,
                "reason": f"Position sizing skipped due to internal error: {error}",
            },
            inputs_used=inputs_used,
            reason=f"Position sizing skipped due to internal error: {error}",
            binding_constraint="NOT_APPLICABLE",
        )
