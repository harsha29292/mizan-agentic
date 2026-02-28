"""Gate 2: deterministic valuation + agent supervision.

DETERMINISTIC CORE — math is sacred, never overridden:
  owner_earnings = min(net_income, free_cashflow)
  intrinsic = earnings * multiple - effective_net_debt
  margin_of_safety logic

VALUATION SUPERVISOR AGENT — explains outcome, flags pathological cases,
  assigns confidence.  NEVER alters numbers.

valuation_band: DEEP_VALUE | FAIR | EXPENSIVE | IMPAIRED
"""

from __future__ import annotations

import logging
import os
from typing import Any

from dotenv import load_dotenv

from app.gates.llm_output_parser import parse_json_object
from app.llm_config import get_gemini_llm
from app.response_utils import (
    error_response,
    format_compact_number,
    format_decimal_with_percent_label,
    missing_required_fields,
    ok_response,
    round_float,
    structured_log,
)

load_dotenv()
logger = logging.getLogger(__name__)

GATE_NAME = "Gate 2 – Valuation"
REQUIRED_MARGIN = float(os.getenv("REQUIRED_MARGIN_OF_SAFETY", "0.30"))
VALUATION_MULTIPLE = float(os.getenv("VALUATION_MULTIPLE", "10"))


def _valuation_band(margin_of_safety: float) -> str:
    if margin_of_safety >= 0.50:
        return "DEEP_VALUE"
    if margin_of_safety >= 0.0:
        return "FAIR"
    return "EXPENSIVE"


def valuation_policy(net_debt: float) -> tuple[float, float]:
    """Deterministic, policy-based valuation parameters.

    Returns: (multiple, required_margin)
    Rules:
      - Base multiple from env (default 10).
      - Net-cash balance sheets get +2 multiple and -5pp required margin
        (floor 20%) to avoid over-penalizing cash-rich firms.
    """
    multiple = float(VALUATION_MULTIPLE)
    required_margin = float(REQUIRED_MARGIN)

    # Reward net-cash balance sheets conservatively.
    if net_debt <= 0:
        multiple += 2.0
        required_margin = max(0.20, required_margin - 0.05)

    return multiple, required_margin


def _display_margin_of_safety(margin_of_safety: float | None) -> str | None:
    """Render capped display value without altering valuation logic."""
    if margin_of_safety is None:
        return None
    display_mos = min(max(float(margin_of_safety), -5.0), 5.0)
    if display_mos <= -1.0:
        return "< -100% (Very expensive)"
    if display_mos >= 1.0:
        return "> 100%"
    return format_decimal_with_percent_label(display_mos)


# ---------------------------------------------------------------------------
# Valuation Supervisor Agent — explains, never computes
# ---------------------------------------------------------------------------

def _run_valuation_supervisor(data: dict[str, Any]) -> dict[str, Any]:
    """LLM supervisor that explains the valuation outcome.

    RULES:
    - NEVER alter any numeric value.
    - NEVER override pass/fail.
    - Explain outcome, flag pathological cases, assign confidence.
    """
    if not os.getenv("GOOGLE_API_KEY"):
        return {"supervisor_commentary": "Supervisor unavailable (no API key)", "pathological_flags": []}

    try:
        llm = get_gemini_llm(temperature=0)
        prompt = f"""You are a valuation supervisor for an internal risk system.

You are given the COMPLETED deterministic valuation output below.
Your job is to:
1. Explain the valuation outcome in 1-2 sentences (neutral, professional tone).
2. Flag any pathological cases (e.g., negative earnings, extreme MOS, impaired value).
3. Return a list of flags if any.

HARD RULES:
- Do NOT change any numbers.
- Do NOT override the pass/fail decision.
- Do NOT recommend buying or selling.
- Do NOT predict future performance.
- Do NOT add growth projections or forward EPS.
- Use Bloomberg terminal tone: precise, neutral, professional.

Valuation output:
- Owner earnings: {data.get('owner_earnings')} ({data.get('owner_earnings_source_used')})
- Net debt: {data.get('net_debt')}
- Effective net debt: {data.get('effective_net_debt')}
- Multiple used: {data.get('valuation_anchor', {}).get('multiple_used')}
- Intrinsic price: {data.get('intrinsic_price')}
- Market price: {data.get('market_price')}
- Margin of safety: {data.get('margin_of_safety')}
- Required margin: {data.get('required_margin')}
- Valuation band: {data.get('valuation_band')}
- Pass: {data.get('passes')}

Return valid JSON only:
{{
  "supervisor_commentary": "1-2 sentence explanation of the valuation outcome",
  "pathological_flags": ["list of flags if any, empty list if none"]
}}"""

        result = llm.invoke(prompt)
        payload = parse_json_object(getattr(result, "content", result))
        commentary = str(payload.get("supervisor_commentary", "")).strip()
        flags = payload.get("pathological_flags", [])
        if not isinstance(flags, list):
            flags = []
        flags = [str(f).strip() for f in flags if str(f).strip()]
        return {"supervisor_commentary": commentary, "pathological_flags": flags}
    except Exception as err:
        structured_log(logger, "warning", "valuation_supervisor_failed", error=str(err))
        return {"supervisor_commentary": f"Supervisor error: {err}", "pathological_flags": []}


# ---------------------------------------------------------------------------
# Main calculation
# ---------------------------------------------------------------------------

def calculate_valuation(
    market_price: float | None,
    net_income: float | None,
    free_cashflow: float | None,
    total_debt: float | None,
    cash: float | None,
    shares_outstanding: float | None,
) -> dict[str, Any]:
    """Compute valuation outputs with conservative owner-earnings math.

    Deterministic core — agent supervision appended but never overrides.
    """
    inputs_used = [
        "market_price",
        "net_income",
        "free_cashflow",
        "total_debt",
        "cash",
        "shares_outstanding",
        "REQUIRED_MARGIN_OF_SAFETY",
        "VALUATION_MULTIPLE",
        "valuation_policy(net_debt)",
    ]

    required_inputs = {
        "market_price": market_price,
        "net_income": net_income,
        "total_debt": total_debt,
        "cash": cash,
        "shares_outstanding": shares_outstanding,
    }
    missing = missing_required_fields(required_inputs)
    if missing:
        return error_response(
            gate=GATE_NAME,
            code="VALUATION_MISSING_INPUTS",
            message=f"Missing required inputs: {', '.join(missing)}",
            inputs_used=inputs_used,
            missing_inputs=missing,
        )

    if shares_outstanding is not None and shares_outstanding <= 0:
        return error_response(
            gate=GATE_NAME,
            code="VALUATION_INVALID_SHARES",
            message=f"shares_outstanding must be > 0, got {shares_outstanding}",
            inputs_used=inputs_used,
            binding_constraint="DATA_AVAILABILITY",
        )

    try:
        if free_cashflow is None:
            owner_earnings = float(net_income)
            owner_earnings_source = "NET_INCOME"
        else:
            owner_earnings = min(float(net_income), float(free_cashflow))
            owner_earnings_source = "NET_INCOME" if float(net_income) <= float(free_cashflow) else "FREE_CASH_FLOW"

        net_debt = float(total_debt) - float(cash)
        multiple_used, required_margin_used = valuation_policy(net_debt)

        # WHY: Net-cash firms should not be penalized by subtracting negative debt.
        # Keep raw net_debt for transparency, but use an effective floor at zero.
        effective_net_debt = max(0.0, net_debt)

        intrinsic_equity = (owner_earnings * multiple_used) - effective_net_debt
        intrinsic_price = intrinsic_equity / float(shares_outstanding)

        # WHY: A non-positive intrinsic value means valuation is economically impaired,
        # so the gate must fail deterministically instead of bubbling an opaque error.
        if intrinsic_price <= 0:
            margin_of_safety = None
            passes = False
            valuation_band = "IMPAIRED"
            one_liner = "FAIL — Intrinsic value is non-positive (IMPAIRED)"
            gate_confidence = 90  # high confidence in the FAIL
        else:
            margin_of_safety = (intrinsic_price - float(market_price)) / intrinsic_price
            passes = margin_of_safety >= required_margin_used
            valuation_band = _valuation_band(margin_of_safety)
            mos_pct = margin_of_safety * 100
            req_pct = required_margin_used * 100
            if passes:
                one_liner = f"PASS — {valuation_band} with MOS {mos_pct:.1f}% (required {req_pct:.0f}%)"
                gate_confidence = 85
            else:
                price_ratio = float(market_price) / intrinsic_price if intrinsic_price != 0 else 0
                one_liner = f"FAIL — Price is {price_ratio:.1f}x intrinsic value (MOS {mos_pct:+.1f}% vs required {req_pct:.0f}%)"
                gate_confidence = 85

        data = {
            "owner_earnings": round_float(owner_earnings, 2),
            "owner_earnings_source_used": owner_earnings_source,
            "net_debt": round_float(net_debt, 2),
            "effective_net_debt": round_float(effective_net_debt, 2),
            "intrinsic_equity": round_float(intrinsic_equity, 2),
            "intrinsic_price": round_float(intrinsic_price, 2),
            "market_price": round_float(float(market_price), 2),
            "margin_of_safety": round_float(margin_of_safety, 4) if margin_of_safety is not None else None,
            "required_margin": round_float(required_margin_used, 4),
            "valuation_anchor": {
                "multiple_used": round_float(multiple_used, 4),
                "required_margin_used": round_float(required_margin_used, 4),
                "policy": "NET_DEBT_ADJUSTED",
            },
            "valuation_band": valuation_band,
            "pass": passes,
            "passes": passes,
            "one_liner": one_liner,
            "owner_earnings_source": owner_earnings_source,
            "units": {
                "owner_earnings": "USD",
                "net_debt": "USD",
                "effective_net_debt": "USD",
                "intrinsic_equity": "USD",
                "intrinsic_price": "USD_per_share",
                "market_price": "USD_per_share",
                "margin_of_safety": "decimal",
                "required_margin": "decimal",
            },
            "display": {
                "owner_earnings": format_compact_number(owner_earnings),
                "net_debt": format_compact_number(net_debt),
                "intrinsic_equity": format_compact_number(intrinsic_equity),
                "intrinsic_price": f"{round_float(intrinsic_price, 2):.2f}",
                "market_price": f"{round_float(float(market_price), 2):.2f}",
                "margin_of_safety": _display_margin_of_safety(margin_of_safety),
                "required_margin": format_decimal_with_percent_label(required_margin_used),
            },
        }

        # --- Valuation Supervisor Agent (explains, never computes) ---
        supervisor = _run_valuation_supervisor(data)
        data["supervisor"] = supervisor

        structured_log(
            logger, "info", "valuation_calculated",
            gate=GATE_NAME,
            intrinsic_price=data["intrinsic_price"],
            market_price=data["market_price"],
            margin_of_safety=data["margin_of_safety"],
            valuation_band=data["valuation_band"],
            multiple_used=round_float(multiple_used, 4),
            required_margin_used=round_float(required_margin_used, 4),
            passes=passes,
        )
        return ok_response(
            gate=GATE_NAME,
            data=data,
            inputs_used=inputs_used,
            confidence=gate_confidence,
            one_liner=one_liner,
            binding_constraint="VALUATION" if valuation_band in {"IMPAIRED", "EXPENSIVE"} else None,
        )

    except Exception as error:
        structured_log(logger, "error", "valuation_unexpected_error", gate=GATE_NAME, error=str(error))
        return error_response(
            gate=GATE_NAME,
            code="VALUATION_INTERNAL_ERROR",
            message=f"Valuation calculation failed: {error}",
            inputs_used=inputs_used,
        )
