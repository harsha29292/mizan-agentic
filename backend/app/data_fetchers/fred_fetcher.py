"""FRED data fetcher with explicit stress regimes and raw index values.

WHY: FRED provides the macro regime context (interest rates, credit conditions).
     Banding is DETERMINISTIC — no inference beyond the defined rules.
     The stress_regime label is explicitly attached so downstream consumers
     never have to guess what the bands mean.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.response_utils import error_response, ok_response, round_float, structured_log

logger = logging.getLogger(__name__)

GATE_NAME = "Data Fetcher – FRED"


def _latest_observation(series_json: dict[str, Any]) -> dict[str, Any] | None:
    observations = series_json.get("observations", [])
    if not observations:
        return None
    return observations[0]


def _to_value(observation: dict[str, Any] | None) -> float | None:
    if not observation:
        return None
    value = observation.get("value")
    if value in (None, "."):
        return None
    return float(value)


def _credit_stress_band(nfci_value: float) -> str:
    if nfci_value >= 0.75:
        return "HIGH"
    if nfci_value >= 0.0:
        return "MEDIUM"
    return "LOW"


def _credit_stress_regime(nfci_value: float) -> str:
    if nfci_value >= 0.75:
        return "TIGHT"
    if nfci_value >= 0.0:
        return "NEUTRAL"
    return "EASY"


def fetch_fred_data() -> dict[str, Any]:
    """Fetch interest-rate and financial-condition data from FRED."""
    inputs_used = ["DFF", "NFCI", "FRED_API_KEY"]

    try:
        api_key = os.getenv("FRED_API_KEY")
        if not api_key:
            return error_response(
                gate=GATE_NAME,
                code="FRED_API_KEY_MISSING",
                message="FRED_API_KEY is not set",
                inputs_used=inputs_used,
            )

        base_url = "https://api.stlouisfed.org/fred/series/observations"
        common_params = {
            "api_key": api_key,
            "file_type": "json",
            "limit": 1,
            "sort_order": "desc",
        }

        dff_response = httpx.get(base_url, params={**common_params, "series_id": "DFF"}, timeout=10.0)
        dff_response.raise_for_status()
        dff_obs = _latest_observation(dff_response.json())
        dff_value = _to_value(dff_obs)

        nfci_response = httpx.get(base_url, params={**common_params, "series_id": "NFCI"}, timeout=10.0)
        nfci_response.raise_for_status()
        nfci_obs = _latest_observation(nfci_response.json())
        nfci_value = _to_value(nfci_obs)

        if dff_value is None:
            return error_response(
                gate=GATE_NAME,
                code="FRED_MISSING_DFF",
                message="Missing latest DFF observation from FRED",
                inputs_used=inputs_used,
            )
        if nfci_value is None:
            return error_response(
                gate=GATE_NAME,
                code="FRED_MISSING_NFCI",
                message="Missing latest NFCI observation from FRED",
                inputs_used=inputs_used,
            )

        interest_rate = dff_value / 100.0
        credit_stress = _credit_stress_band(nfci_value)
        credit_stress_regime = _credit_stress_regime(nfci_value)

        data = {
            "interest_rate": round_float(interest_rate, 6),
            "interest_rate_source_series": "DFF",
            "interest_rate_observation_date": dff_obs.get("date") if dff_obs else None,
            "credit_stress": credit_stress,
            "credit_stress_regime": credit_stress_regime,
            "credit_stress_index": round_float(nfci_value, 6),
            "credit_stress_source_series": "NFCI",
            "credit_stress_observation_date": nfci_obs.get("date") if nfci_obs else None,
            "macro_signal": "NEUTRAL",
            "data_source": "FRED_API",
            "stress_regime_label": (
                f"Rates {interest_rate*100:.2f}% (DFF), "
                f"NFCI {nfci_value:+.3f} → {credit_stress_regime}"
            ),
            "units": {
                "interest_rate": "decimal",
                "credit_stress_index": "NFCI_raw_index",
            },
        }

        structured_log(
            logger,
            "info",
            "fred_data_fetched",
            gate=GATE_NAME,
            interest_rate=data["interest_rate"],
            credit_stress=data["credit_stress"],
            credit_stress_regime=data["credit_stress_regime"],
        )

        fred_one_liner = (
            f"Macro regime: DFF {interest_rate*100:.2f}%, "
            f"NFCI {nfci_value:+.3f} ({credit_stress_regime})"
        )
        return ok_response(
            gate=GATE_NAME, data=data, inputs_used=inputs_used,
            confidence=95, one_liner=fred_one_liner,
        )

    except httpx.HTTPError as error:
        structured_log(logger, "error", "fred_http_error", gate=GATE_NAME, error=str(error))
        return error_response(
            gate=GATE_NAME,
            code="FRED_FETCH_HTTP_ERROR",
            message=f"Failed to fetch FRED data: {error}",
            inputs_used=inputs_used,
        )
    except Exception as error:
        structured_log(logger, "error", "fred_unexpected_error", gate=GATE_NAME, error=str(error))
        return error_response(
            gate=GATE_NAME,
            code="FRED_INTERNAL_ERROR",
            message=f"FRED data fetch failed: {error}",
            inputs_used=inputs_used,
        )
