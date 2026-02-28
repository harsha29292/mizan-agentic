"""Gate 1: LLM-based business context classification (AGENTIC).

WHY: Establish qualitative context about the business without influencing
     valuation or decisions.  Gate 1 answers:
     "What kind of business is this, and what are the structural risks
     I should be aware of?"

     It does NOT pass/fail anything.
     It feeds language + framing to later gates and to the UI.

     OUTPUT: business_summary, key_risk_categories, geographic_exposure,
             business_complexity.  NO opinions, NO investment language.
     If filings missing → status=PARTIAL
"""

from __future__ import annotations

import logging
import os
from typing import Any

from app.gates.llm_output_parser import parse_json_object
from app.llm_config import get_gemini_llm
from app.response_utils import error_response, ok_response, partial_response, structured_log

logger = logging.getLogger(__name__)

GATE_NAME = "Gate 1 – Business Context"
VALID_COMPLEXITY = {"LOW", "MEDIUM", "HIGH"}


def analyze_business_context(
    company_name: str,
    sic_description: str,
    business_description: str | None = None,
    risk_factors: str | None = None,
    entity_type: str | None = None,
    sic: str | None = None,
) -> dict[str, Any]:
    """Classify business context without judging attractiveness.

    This gate is CONTEXT ONLY — no math, no scoring, no verdict, no thresholds.
    It feeds language + framing to later gates and to the UI.

    If filings are missing, returns PARTIAL status with metadata-only context.
    """
    inputs_used = [
        "company_name",
        "sic_description",
        "business_description",
        "risk_factors",
        "entity_type",
    ]

    if not company_name:
        return error_response(
            gate=GATE_NAME,
            code="BUSINESS_CONTEXT_MISSING_COMPANY_NAME",
            message="company_name is required",
            inputs_used=inputs_used,
            missing_inputs=["company_name"],
        )

    # Check if filings are missing — produce PARTIAL if so
    has_filings = bool(business_description) or bool(risk_factors)
    missing_inputs: list[str] = []
    if not business_description:
        missing_inputs.append("business_description")
    if not risk_factors:
        missing_inputs.append("risk_factors")

    if not os.getenv("GOOGLE_API_KEY"):
        return error_response(
            gate=GATE_NAME,
            code="BUSINESS_CONTEXT_LLM_KEY_MISSING",
            message="GOOGLE_API_KEY is not set",
            inputs_used=inputs_used,
        )

    try:
        llm = get_gemini_llm(temperature=0)

        # Build context block from available data
        context_parts = [f"Company: {company_name}"]
        if sic and sic_description:
            context_parts.append(f"Industry (SIC {sic}): {sic_description}")
        elif sic_description:
            context_parts.append(f"Industry: {sic_description}")
        if entity_type:
            context_parts.append(f"Entity type: {entity_type}")
        if business_description:
            context_parts.append(
                f"Business description (from 10-K):\n{business_description[:8000]}"
            )
        if risk_factors:
            context_parts.append(
                f"Risk factors (from 10-K):\n{risk_factors[:8000]}"
            )

        context_block = "\n\n".join(context_parts)

        prompt = f"""You are a strict business context classifier for an internal risk system.

Your ONLY job is to summarize what the business does, identify structural risks,
and classify geographic exposure.

HARD RULES:
- Do NOT judge investment attractiveness.
- Do NOT predict outcomes or assign probabilities.
- Do NOT reference stock price, valuation, or market sentiment.
- Do NOT say "good investment", "bad investment", "opportunity", or "upside".
- Do NOT recommend buying, selling, or holding.
- Summarize and classify ONLY.
- Be factual, neutral, and concise.
- All output must be grounded in the provided context.
- If information is not provided, say "Not provided" — do not infer.

Context:
{context_block}

Return valid JSON only:
{{
  "business_summary": "1-2 sentence neutral description of what the company does and its main markets",
  "key_risk_categories": ["list of 2-5 structural risk category labels like Cyclicality, Customer concentration, Regulatory risk, Geopolitical exposure, etc."],
  "geographic_exposure": "DOMESTIC | INTERNATIONAL | GLOBAL",
  "business_complexity": "LOW | MEDIUM | HIGH"
}}

Rules for geographic_exposure:
- DOMESTIC: Revenue primarily from one country
- INTERNATIONAL: Material revenue from multiple countries
- GLOBAL: Significant operations across many regions/continents

Rules for business_complexity:
- LOW: Simple business model, single product/segment, domestic focus
- MEDIUM: Multiple segments or geographies, moderate regulatory exposure
- HIGH: Complex multi-segment, global operations, heavy regulation, or conglomerate structure
"""

        result = llm.invoke(prompt)
        payload = parse_json_object(getattr(result, "content", result))

        business_summary = str(payload.get("business_summary", "")).strip()
        key_risk_categories = payload.get("key_risk_categories", [])
        geographic_exposure = str(payload.get("geographic_exposure", "")).strip().upper()
        business_complexity = str(payload.get("business_complexity", "")).strip().upper()

        if not business_summary:
            return error_response(
                gate=GATE_NAME,
                code="BUSINESS_CONTEXT_EMPTY_SUMMARY",
                message="LLM returned empty business_summary",
                inputs_used=inputs_used,
            )

        # Safe defaults for context-only gate — never block pipeline
        if business_complexity not in VALID_COMPLEXITY:
            business_complexity = "MEDIUM"
        if geographic_exposure not in {"DOMESTIC", "INTERNATIONAL", "GLOBAL"}:
            geographic_exposure = "INTERNATIONAL"

        if not isinstance(key_risk_categories, list):
            key_risk_categories = []
        key_risk_categories = [str(r).strip() for r in key_risk_categories if str(r).strip()]

        data = {
            "business_summary": business_summary,
            "key_risk_categories": key_risk_categories,
            "geographic_exposure": geographic_exposure,
            "business_complexity": business_complexity,
        }

        structured_log(
            logger, "info", "business_context_classified",
            gate=GATE_NAME, business_complexity=business_complexity,
            geographic_exposure=geographic_exposure,
            risk_count=len(key_risk_categories),
        )

        one_liner = (
            f"{company_name}: {business_complexity} complexity, "
            f"{geographic_exposure} exposure, {len(key_risk_categories)} risk categories"
        )

        if not has_filings:
            return partial_response(
                gate=GATE_NAME, data=data, inputs_used=inputs_used,
                missing_inputs=missing_inputs,
                confidence=40,
                one_liner=f"PARTIAL — {one_liner} (filings not available)",
            )

        confidence = 85 if has_filings else 40
        return ok_response(
            gate=GATE_NAME, data=data, inputs_used=inputs_used,
            confidence=confidence, one_liner=one_liner,
            missing_inputs=missing_inputs if missing_inputs else None,
        )

    except Exception as error:
        structured_log(
            logger, "error", "business_context_unexpected_error",
            gate=GATE_NAME, error=str(error),
        )
        return error_response(
            gate=GATE_NAME,
            code="BUSINESS_CONTEXT_INTERNAL_ERROR",
            message=f"Business context classification failed: {error}",
            inputs_used=inputs_used,
        )
