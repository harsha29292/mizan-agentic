"""Gate 3: LLM-based market structure classification (AGENTIC WITH ABSTAIN).

Allowed outputs: TAILWIND | NEUTRAL | HEADWIND | NO_RELEVANT_DATA_FOUND

Rules:
- If volume / flow / prediction data missing → NO_RELEVANT_DATA_FOUND
- No forced classification
- LLM must reference ONLY provided values
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

from app.gates.llm_output_parser import parse_json_object
from app.llm_config import get_gemini_llm
from app.response_utils import missing_required_fields, ok_response, structured_log

logger = logging.getLogger(__name__)

GATE_NAME = "Gate 3 – Market Structure"
VALID_CLASSIFICATIONS = {"TAILWIND", "NEUTRAL", "HEADWIND", "NO_RELEVANT_DATA_FOUND"}
VARIABLE_REFERENCES = {
    "last_price": ["last price", "last_price"],
    "last_volume": ["last volume", "last_volume"],
    "avg_volume": ["average volume", "avg_volume"],
    "volume_spike": ["volume spike", "volume_spike"],
    "price_direction": ["price direction", "price_direction"],
    "flow_signal": ["flow signal", "flow_signal"],
    "yes_price": ["yes price", "yes_price"],
    "no_price": ["no price", "no_price"],
    "macro_signal": ["macro signal", "macro_signal"],
}


def _count_sentences(text: str) -> int:
    chunks = [part.strip() for part in re.split(r"[.!?]+", text) if part.strip()]
    return len(chunks)


def _first_n_sentences(text: str, n: int) -> str:
    chunks = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    if len(chunks) <= n:
        return text.strip()
    return " ".join(chunks[:n]).strip()


def _sentence_chunks(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", text.strip()) if part.strip()]


def _sentence_has_variable_reference(sentence: str) -> bool:
    lower = sentence.lower()
    return any(alias in lower for aliases in VARIABLE_REFERENCES.values() for alias in aliases)


def _reasoning_has_sentence_level_references(reasoning: str) -> bool:
    sentences = _sentence_chunks(reasoning)
    if not sentences:
        return False
    return all(_sentence_has_variable_reference(sentence) for sentence in sentences)


def _is_no_data(
    avg_volume: int | None,
    last_volume: int | None,
    price_direction: str | None,
    flow_signal: str | None,
    yes_price: float | None,
    no_price: float | None,
) -> bool:
    """Deterministic pre-check: return True when there is insufficient market
    structure data to justify an LLM classification call."""
    if avg_volume is not None and avg_volume == 0:
        return True
    if last_volume is not None and last_volume == 0:
        return True
    if (
        str(price_direction or "").upper() == "FLAT"
        and str(flow_signal or "").upper() == "NEUTRAL"
    ):
        return True
    if yes_price is None and no_price is None:
        return True
    return False


def _no_relevant_data_response(
    inputs_used: list[str],
    reason: str,
    missing_inputs: list[str] | None = None,
) -> dict[str, Any]:
    data = {
        "classification": "NO_RELEVANT_DATA_FOUND",
        "confidence": 0,
        "analysis": "No reliable market-structure signals available for this period.",
        "setup_label": "No relevant market structure data",
        "reasoning": reason,
    }
    return ok_response(
        gate=GATE_NAME,
        data=data,
        inputs_used=inputs_used,
        confidence=0,
        one_liner="NO_RELEVANT_DATA_FOUND — No reliable market-structure signals available for this period.",
        missing_inputs=missing_inputs,
    )


def analyze_market_structure(
    last_price: float | None,
    last_volume: int | None,
    avg_volume: int | None,
    volume_spike: float | None,
    price_direction: str | None,
    flow_signal: str | None,
    yes_price: float | None,
    no_price: float | None,
    macro_signal: str | None,
) -> dict[str, Any]:
    """Classify market setup as TAILWIND, NEUTRAL, HEADWIND, or NO_RELEVANT_DATA_FOUND."""
    inputs_used = [
        "last_price",
        "last_volume",
        "avg_volume",
        "volume_spike",
        "price_direction",
        "flow_signal",
        "yes_price",
        "no_price",
        "macro_signal",
    ]

    # yes_price and no_price are OPTIONAL (Dome/Polymarket auxiliary signals)
    required_inputs = {
        "last_price": last_price,
        "last_volume": last_volume,
        "avg_volume": avg_volume,
        "volume_spike": volume_spike,
        "price_direction": price_direction,
        "flow_signal": flow_signal,
        "macro_signal": macro_signal,
    }
    missing = missing_required_fields(required_inputs)
    if missing:
        return _no_relevant_data_response(
            inputs_used=inputs_used,
            reason=f"Missing required inputs: {', '.join(missing)}.",
            missing_inputs=missing,
        )

    # WHY: If all signal channels are dead we return NO_RELEVANT_DATA_FOUND
    # deterministically instead of asking the LLM to classify noise.
    if _is_no_data(avg_volume, last_volume, price_direction, flow_signal, yes_price, no_price):
        structured_log(logger, "info", "market_structure_no_data", gate=GATE_NAME)
        return _no_relevant_data_response(
            inputs_used=inputs_used,
            reason="Signal channels are inactive or conflicting for this period.",
        )

    if not os.getenv("GOOGLE_API_KEY"):
        return _no_relevant_data_response(
            inputs_used=inputs_used,
            reason="LLM key unavailable; returning non-classification fallback.",
        )

    try:
        llm = get_gemini_llm(temperature=0)
        prompt = f"""You are a strict classifier for market structure in an internal risk system.

Allowed classifications: TAILWIND, NEUTRAL, HEADWIND, NO_RELEVANT_DATA_FOUND

Hard constraints:
- Do NOT compute new metrics.
- Do NOT invent thresholds.
- Do NOT add macro opinions or predictions.
- Every sentence in reasoning must reference at least one provided variable name.
- Reasoning must be at most 3 sentences.
- Use Bloomberg terminal tone: precise, neutral, professional.
- If the data is ambiguous or conflicting, prefer NEUTRAL or NO_RELEVANT_DATA_FOUND.
- Do NOT force a classification when data is insufficient.

Inputs:
- last price: {last_price}
- last volume: {last_volume}
- average volume: {avg_volume}
- volume spike: {volume_spike}
- price direction: {price_direction}
- flow signal: {flow_signal}
- yes price: {yes_price if yes_price is not None else "N/A"}
- no price: {no_price if no_price is not None else "N/A"}
- macro signal: {macro_signal}

Return valid JSON only:
{{
  "classification": "TAILWIND" | "NEUTRAL" | "HEADWIND" | "NO_RELEVANT_DATA_FOUND",
  "setup_label": "short non-numeric setup label",
  "reasoning": "max 3 sentences, each referencing provided variables"
}}
"""

        result = llm.invoke(prompt)
        payload = parse_json_object(getattr(result, "content", result))
        classification = str(payload.get("classification", "")).strip().upper()
        setup_label = str(payload.get("setup_label", "")).strip()
        reasoning = str(payload.get("reasoning", "")).strip()

        if classification not in VALID_CLASSIFICATIONS:
            return _no_relevant_data_response(
                inputs_used=inputs_used,
                reason=f"Model returned invalid classification: {classification}.",
            )

        if not reasoning:
            return _no_relevant_data_response(
                inputs_used=inputs_used,
                reason="Model returned empty market-structure analysis.",
            )

        if not setup_label:
            setup_label = classification.replace("_", " ").title()

        if _count_sentences(reasoning) > 3:
            reasoning = _first_n_sentences(reasoning, 3)

        # Confidence based on classification type
        if classification == "NO_RELEVANT_DATA_FOUND":
            gate_confidence = 0
        elif classification == "NEUTRAL":
            gate_confidence = 60
        else:
            # For TAILWIND/HEADWIND, verify reasoning references variables
            if _reasoning_has_sentence_level_references(reasoning):
                gate_confidence = 75
            else:
                # Downgrade to NEUTRAL if reasoning is unsupported
                structured_log(
                    logger, "warning", "market_structure_reasoning_downgrade",
                    gate=GATE_NAME, original=classification,
                )
                return _no_relevant_data_response(
                    inputs_used=inputs_used,
                    reason="Model output lacked variable-grounded reasoning for classification.",
                )

        one_liner = f"{classification} — {setup_label}"

        data = {
            "classification": classification,
            "confidence": gate_confidence,
            "analysis": reasoning,
            "setup_label": setup_label,
            "reasoning": reasoning,
            "units": {
                "volume_spike": "ratio",
                "yes_price": "raw_market_price",
                "no_price": "raw_market_price",
            },
        }
        structured_log(
            logger, "info", "market_structure_classified",
            gate=GATE_NAME, classification=classification,
        )
        return ok_response(
            gate=GATE_NAME, data=data, inputs_used=inputs_used,
            confidence=gate_confidence, one_liner=one_liner,
        )

    except Exception as error:
        structured_log(logger, "error", "market_structure_unexpected_error", gate=GATE_NAME, error=str(error))
        return _no_relevant_data_response(
            inputs_used=inputs_used,
            reason=f"Internal market-structure failure: {error}",
        )
