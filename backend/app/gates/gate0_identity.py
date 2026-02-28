"""Gate 0: deterministic identity resolution with ambiguity handling.

NO LLM.  Purely deterministic.
Outputs explicit match_type: EXACT | FUZZY | AMBIGUOUS
"""

from __future__ import annotations

from difflib import SequenceMatcher
import logging
import os
from typing import Any

import httpx

from app.response_utils import error_response, ok_response, structured_log

logger = logging.getLogger(__name__)

GATE_NAME = "Gate 0 – Identity"
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"


def _normalized(value: str) -> str:
    """Normalize to upper-case, collapsed whitespace for matching."""
    return " ".join(value.strip().upper().split())


def _strip_suffixes(value: str) -> str:
    """Remove common corporate suffixes to improve fuzzy matching."""
    for suffix in (" INC", " CORP", " CO", " LTD", " PLC", " LLC", " LP", " NV", " SA", " AG", " SE"):
        if value.endswith(suffix):
            value = value[: -len(suffix)].strip()
    return value


def _similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, left, right).ratio()


def resolve_identity(company_input: str) -> dict[str, Any]:
    """Resolve ticker/name to a canonical SEC identity without LLM usage.

    match_type values:
      EXACT   — ticker or full company name matched exactly
      FUZZY   — best fuzzy match with clear separation from runner-up
      AMBIGUOUS — multiple close matches; escalates as ERROR
    """
    raw_input = company_input if isinstance(company_input, str) else ""
    search_term = _normalized(raw_input)
    search_stripped = _strip_suffixes(search_term)
    inputs_used = ["company_input"]

    if not search_term:
        return error_response(
            gate=GATE_NAME,
            code="IDENTITY_INVALID_INPUT",
            message="company_input must be a non-empty string",
            inputs_used=inputs_used,
            missing_inputs=["company_input"],
        )

    try:
        headers = {
            "User-Agent": os.getenv("SEC_USER_AGENT", "Mizan mizan@example.com")
        }
        response = httpx.get(SEC_TICKERS_URL, headers=headers, timeout=10.0)
        response.raise_for_status()
        companies = response.json()

        exact_matches: list[dict[str, Any]] = []
        fuzzy_matches: list[tuple[float, dict[str, Any]]] = []

        for entry in companies.values():
            ticker = _normalized(str(entry.get("ticker", "")))
            title = _normalized(str(entry.get("title", "")))
            cik = entry.get("cik_str")

            if not ticker or not title or cik is None:
                continue

            record = {
                "ticker": ticker,
                "company_name": str(entry.get("title", "")).strip(),
                "cik": str(cik).zfill(10),
            }

            # Exact ticker match
            if search_term == ticker:
                exact_matches.append({**record, "match_type": "EXACT"})
                continue

            # Exact title match
            if search_term == title:
                exact_matches.append({**record, "match_type": "EXACT"})
                continue

            # Substring match in title → treat as strong fuzzy
            title_stripped = _strip_suffixes(title)
            if search_stripped in title_stripped or search_term in title:
                score = max(_similarity(search_stripped, ticker), _similarity(search_stripped, title_stripped))
                fuzzy_matches.append((max(score, 0.75), {**record, "match_type": "FUZZY"}))
                continue

            # General fuzzy (with suffix-stripped comparison for robustness)
            score = max(
                _similarity(search_term, ticker),
                _similarity(search_term, title),
                _similarity(search_stripped, title_stripped),
            )
            if score >= 0.55:
                fuzzy_matches.append((score, {**record, "match_type": "FUZZY"}))

        # --- Resolution logic ---
        if len(exact_matches) == 1:
            selected = exact_matches[0]
            data = {**selected, "confidence_score": 1.0}
            one_liner = f"Resolved {raw_input} → {selected['ticker']} (CIK {selected['cik']}) via EXACT match"
            structured_log(
                logger, "info", "identity_resolved",
                gate=GATE_NAME, ticker=selected["ticker"], match_type="EXACT",
            )
            return ok_response(
                gate=GATE_NAME, data=data, inputs_used=inputs_used,
                confidence=100, one_liner=one_liner,
            )

        if len(exact_matches) > 1:
            candidates = [match["ticker"] for match in exact_matches[:5]]
            return error_response(
                gate=GATE_NAME,
                code="IDENTITY_AMBIGUOUS",
                message=f"Multiple exact matches for '{raw_input}': {', '.join(candidates)}. Specify ticker explicitly.",
                inputs_used=inputs_used,
                binding_constraint="DATA_AVAILABILITY",
            )

        if not fuzzy_matches:
            return error_response(
                gate=GATE_NAME,
                code="IDENTITY_NOT_FOUND",
                message=f"No company found matching '{raw_input}'",
                inputs_used=inputs_used,
                binding_constraint="DATA_AVAILABILITY",
            )

        fuzzy_matches.sort(key=lambda item: item[0], reverse=True)
        top_score, top_record = fuzzy_matches[0]
        second_score = fuzzy_matches[1][0] if len(fuzzy_matches) > 1 else 0.0

        if len(fuzzy_matches) > 1 and abs(top_score - second_score) <= 0.05:
            top_candidates = [f"{record['ticker']}({score:.2f})" for score, record in fuzzy_matches[:3]]
            return error_response(
                gate=GATE_NAME,
                code="IDENTITY_AMBIGUOUS",
                message=f"Ambiguous fuzzy match for '{raw_input}': {', '.join(top_candidates)}",
                inputs_used=inputs_used,
                binding_constraint="DATA_AVAILABILITY",
            )

        # Clear fuzzy winner
        data = {
            **top_record,
            "confidence_score": round(top_score, 4),
        }
        confidence_int = int(round(top_score * 100))
        one_liner = (
            f"Resolved {raw_input} → {top_record['ticker']} "
            f"(CIK {top_record['cik']}) via FUZZY match ({top_score:.0%} confidence)"
        )
        structured_log(
            logger, "info", "identity_resolved",
            gate=GATE_NAME, ticker=top_record["ticker"],
            match_type="FUZZY", confidence_score=round(top_score, 4),
        )
        return ok_response(
            gate=GATE_NAME, data=data, inputs_used=inputs_used,
            confidence=confidence_int, one_liner=one_liner,
        )

    except httpx.HTTPError as error:
        structured_log(logger, "error", "identity_http_error", gate=GATE_NAME, error=str(error))
        return error_response(
            gate=GATE_NAME,
            code="IDENTITY_FETCH_FAILED",
            message=f"Failed to fetch SEC company data: {error}",
            inputs_used=inputs_used,
        )
    except Exception as error:
        structured_log(logger, "error", "identity_unexpected_error", gate=GATE_NAME, error=str(error))
        return error_response(
            gate=GATE_NAME,
            code="IDENTITY_INTERNAL_ERROR",
            message=f"Identity resolution failed: {error}",
            inputs_used=inputs_used,
        )
