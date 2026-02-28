"""Shared response envelope, validation, rounding, and formatting utilities.

WHY: Every gate must emit a canonical, audit-safe schema with explicit diagnostics.
     The unified envelope guarantees: status, data, inputs_used, missing_inputs,
     confidence (0-100), one_liner — across every gate and fetcher.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
from typing import Any, Mapping


# ---------------------------------------------------------------------------
# Timestamp
# ---------------------------------------------------------------------------

def utc_timestamp() -> str:
    """Return current UTC time in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Diagnostics block
# ---------------------------------------------------------------------------

def build_diagnostics(
    inputs_used: list[str],
    missing_inputs: list[str] | None = None,
    binding_constraint: str | None = None,
) -> dict[str, Any]:
    """Build canonical diagnostics block for every gate and fetcher response."""
    return {
        "inputs_used": inputs_used,
        "missing_inputs": missing_inputs or [],
        "binding_constraint": binding_constraint,
    }


# ---------------------------------------------------------------------------
# Response envelopes
# ---------------------------------------------------------------------------

def ok_response(
    gate: str,
    data: dict[str, Any],
    inputs_used: list[str],
    confidence: int = 100,
    one_liner: str = "",
    binding_constraint: str | None = None,
    missing_inputs: list[str] | None = None,
) -> dict[str, Any]:
    """Build a successful canonical response envelope.

    Every gate MUST supply confidence (0-100) and a one_liner summary.
    """
    return {
        "status": "OK",
        "gate": gate,
        "data": data,
        "confidence": max(0, min(100, confidence)),
        "one_liner": one_liner or data.get("one_liner", ""),
        "diagnostics": build_diagnostics(
            inputs_used=inputs_used,
            missing_inputs=missing_inputs or [],
            binding_constraint=binding_constraint,
        ),
    }


def partial_response(
    gate: str,
    data: dict[str, Any],
    inputs_used: list[str],
    missing_inputs: list[str],
    confidence: int = 50,
    one_liner: str = "",
    binding_constraint: str | None = "DATA_AVAILABILITY",
) -> dict[str, Any]:
    """Build a PARTIAL response when some but not all data is available."""
    return {
        "status": "PARTIAL",
        "gate": gate,
        "data": data,
        "confidence": max(0, min(100, confidence)),
        "one_liner": one_liner,
        "diagnostics": build_diagnostics(
            inputs_used=inputs_used,
            missing_inputs=missing_inputs,
            binding_constraint=binding_constraint,
        ),
    }


def error_response(
    gate: str,
    code: str,
    message: str,
    inputs_used: list[str],
    missing_inputs: list[str] | None = None,
    binding_constraint: str | None = "DATA_AVAILABILITY",
) -> dict[str, Any]:
    """Build an error canonical response envelope."""
    return {
        "status": "ERROR",
        "gate": gate,
        "data": {},
        "confidence": 0,
        "one_liner": message,
        "error": {
            "code": code,
            "message": message,
        },
        "diagnostics": build_diagnostics(
            inputs_used=inputs_used,
            missing_inputs=missing_inputs or [],
            binding_constraint=binding_constraint,
        ),
    }


def skipped_response(
    gate: str,
    data: dict[str, Any],
    inputs_used: list[str],
    reason: str,
    missing_inputs: list[str] | None = None,
    binding_constraint: str | None = "NOT_APPLICABLE",
) -> dict[str, Any]:
    """Build a SKIPPED response for non-applicable gates."""
    return {
        "status": "SKIPPED",
        "gate": gate,
        "data": data,
        "confidence": 0,
        "one_liner": reason,
        "diagnostics": build_diagnostics(
            inputs_used=inputs_used,
            missing_inputs=missing_inputs or [],
            binding_constraint=binding_constraint,
        ),
    }


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def missing_required_fields(values: Mapping[str, Any]) -> list[str]:
    """Return missing keys where value is None."""
    return [key for key, value in values.items() if value is None]


# ---------------------------------------------------------------------------
# Numeric formatting
# ---------------------------------------------------------------------------

def round_float(value: float, digits: int = 6) -> float:
    """Round a float with a single shared convention."""
    return round(float(value), digits)


def format_compact_number(value: float | int | None) -> str | None:
    """Render large magnitudes compactly for UI while preserving numeric data separately."""
    if value is None:
        return None
    num = float(value)
    abs_num = abs(num)
    if abs_num >= 1_000_000_000:
        return f"{round_float(num / 1_000_000_000, 2)}B"
    if abs_num >= 1_000_000:
        return f"{round_float(num / 1_000_000, 2)}M"
    if abs_num >= 1_000:
        return f"{round_float(num / 1_000, 2)}k"
    return str(round_float(num, 2))


def format_decimal_with_percent_label(value: float | None, digits: int = 4) -> str | None:
    """Render decimals with explicit percent label to avoid unit ambiguity."""
    if value is None:
        return None
    decimal_value = round_float(float(value), digits)
    percent_value = round_float(float(value) * 100.0, 2)
    return f"{decimal_value} ({percent_value}%)"


# ---------------------------------------------------------------------------
# Confidence computation (purely mechanical)
# ---------------------------------------------------------------------------

def compute_pipeline_confidence(
    gate_results: list[dict[str, Any]],
) -> int:
    """Compute deterministic decision confidence from final gate signals.

    Rules (spec):
    - Base confidence = 50
    - +20 if margin_of_safety < -100%
    - +10 if impairment_risk == LOW
    - -10 if market_structure == HEADWIND
    - -10 if key data missing
    - Clamp [0, 100]
    """
    if not gate_results:
        return 0

    def _find_gate_data(prefix: str) -> dict[str, Any]:
        for result in gate_results:
            gate_name = str(result.get("gate", "")).lower()
            if gate_name.startswith(prefix):
                data = result.get("data")
                if isinstance(data, dict):
                    return data
        return {}

    gate2 = _find_gate_data("gate 2")
    gate3 = _find_gate_data("gate 3")
    gate4 = _find_gate_data("gate 4")

    confidence = 50

    margin_of_safety = gate2.get("margin_of_safety")
    if isinstance(margin_of_safety, (int, float)) and float(margin_of_safety) < -1.0:
        confidence += 20

    impairment_risk = str(gate4.get("risk_level", "")).upper()
    if impairment_risk == "LOW":
        confidence += 10

    market_structure = str(gate3.get("classification", "")).upper()
    if market_structure == "HEADWIND":
        confidence -= 10

    key_data_missing = any(
        bool(result.get("diagnostics", {}).get("missing_inputs", []))
        for result in gate_results
    )
    if key_data_missing:
        confidence -= 10

    return max(0, min(100, int(confidence)))


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def structured_log(
    logger: logging.Logger,
    level: str,
    event: str,
    **fields: Any,
) -> None:
    """Emit JSON-style structured log records."""
    payload = {
        "event": event,
        "timestamp": utc_timestamp(),
        **fields,
    }
    message = json.dumps(payload, default=str)
    level_method = getattr(logger, level.lower(), logger.info)
    level_method(message)
