"""SEC EDGAR data fetcher with period-consistent fact selection.

WHY: SEC is the authoritative source for fundamental data.  Missing fields
     (especially shares_outstanding) are the single most common pipeline breaker.
     This module tries an expanded set of alternate XBRL tags before failing,
     and when it does fail it provides an explicit, actionable error message.
"""

from __future__ import annotations

from datetime import datetime
import logging
import os
import re
from typing import Any

import httpx

from app.response_utils import error_response, ok_response, round_float, structured_log

logger = logging.getLogger(__name__)

GATE_NAME = "Data Fetcher – SEC"
ANNUAL_FORMS = {"10-K", "20-F", "40-F"}
QUARTERLY_FORMS = {"10-Q"}

# Interest expense fallback order for impairment gate safety.
INTEREST_EXPENSE_CONCEPTS = [
    "InterestExpense",
    "InterestExpenseNet",
    "InterestAndDebtExpense",
]

# Expanded alternate tags for shares outstanding — ordered by reliability
SHARES_OUTSTANDING_DEI_CONCEPTS = [
    "EntityCommonStockSharesOutstanding",
]
SHARES_OUTSTANDING_GAAP_CONCEPTS = [
    "CommonStockSharesOutstanding",
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "WeightedAverageNumberOfSharesOutstandingBasic",
    "CommonStockSharesIssued",
    "SharesOutstanding",
]


def _parse_date(value: str | None) -> datetime:
    if not value:
        return datetime.min
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return datetime.min


def _is_annual(item: dict[str, Any]) -> bool:
    form = str(item.get("form", "")).upper()
    fiscal_period = str(item.get("fp", "")).upper()
    return form in ANNUAL_FORMS or fiscal_period == "FY"


def _fact_sort_key(item: dict[str, Any]) -> tuple[datetime, datetime, int]:
    return (
        _parse_date(item.get("filed")),
        _parse_date(item.get("end")),
        int(item.get("fy", 0) or 0),
    )


def _latest_fact(items: list[dict[str, Any]], prefer_annual: bool = True) -> dict[str, Any] | None:
    usable = [item for item in items if item.get("val") is not None]
    if not usable:
        return None

    if prefer_annual:
        annual = [item for item in usable if _is_annual(item)]
        if annual:
            return max(annual, key=_fact_sort_key)

    quarterly = [item for item in usable if not _is_annual(item)]
    if quarterly:
        return max(quarterly, key=_fact_sort_key)

    return max(usable, key=_fact_sort_key)


def _exact_period_fact(items: list[dict[str, Any]], fiscal_year: str, fiscal_period: str) -> dict[str, Any] | None:
    usable = [item for item in items if item.get("val") is not None]
    exact = [
        item
        for item in usable
        if str(item.get("fy", "")) == fiscal_year and str(item.get("fp", "")).upper() == fiscal_period.upper()
    ]
    if not exact:
        return None
    return max(exact, key=_fact_sort_key)


def _extract_metric(
    facts: dict[str, Any],
    taxonomy: str,
    concepts: list[str],
    unit: str,
    fiscal_year: str,
    fiscal_period: str,
) -> tuple[float | None, str | None]:
    """Extract first available concept value for an exact fiscal period."""
    for concept in concepts:
        units = facts.get(taxonomy, {}).get(concept, {}).get("units", {}).get(unit, [])
        item = _exact_period_fact(units, fiscal_year=fiscal_year, fiscal_period=fiscal_period)
        if item is not None:
            return float(item["val"]), concept
    return None, None


def _extract_metric_any_period(
    facts: dict[str, Any],
    taxonomy: str,
    concepts: list[str],
    unit: str,
) -> tuple[float | None, str | None, str]:
    """Fallback: extract the latest available value across ANY period.

    Returns (value, concept_used, source_note).
    Used for shares_outstanding when the exact fiscal period has no data.
    """
    for concept in concepts:
        all_units = facts.get(taxonomy, {}).get(concept, {}).get("units", {}).get(unit, [])
        fact = _latest_fact(all_units, prefer_annual=True)
        if fact is not None:
            period_note = f"FY{fact.get('fy', '?')} {fact.get('fp', '?')} (fallback)"
            return float(fact["val"]), concept, period_note
    return None, None, ""


def fetch_sec_data(cik: str) -> dict[str, Any]:
    """Fetch SEC company facts with a single selected fiscal period."""
    normalized_cik = str(cik).strip().zfill(10)
    inputs_used = ["cik", "NetIncomeLoss", "OperatingIncomeLoss", "InterestExpense", "EntityCommonStockSharesOutstanding"]

    if not normalized_cik.isdigit() or len(normalized_cik) != 10:
        return error_response(
            gate=GATE_NAME,
            code="SEC_INVALID_CIK",
            message=f"CIK must be a 10-digit numeric string, got '{cik}'",
            inputs_used=inputs_used,
        )

    try:
        headers = {"User-Agent": os.getenv("SEC_USER_AGENT", "Mizan mizan@example.com")}
        url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{normalized_cik}.json"
        response = httpx.get(url, headers=headers, timeout=15.0)

        if response.status_code == 404:
            return error_response(
                gate=GATE_NAME,
                code="SEC_COMPANY_NOT_FOUND",
                message=f"No SEC company facts found for CIK {normalized_cik}",
                inputs_used=inputs_used,
            )

        response.raise_for_status()
        payload = response.json()
        facts = payload.get("facts", {})

        net_income_units = facts.get("us-gaap", {}).get("NetIncomeLoss", {}).get("units", {}).get("USD", [])
        anchor = _latest_fact(net_income_units, prefer_annual=True)
        if anchor is None:
            return error_response(
                gate=GATE_NAME,
                code="SEC_MISSING_ANCHOR_PERIOD",
                message="Missing NetIncomeLoss facts to anchor fiscal period",
                inputs_used=inputs_used,
            )

        fiscal_year = str(anchor.get("fy", ""))
        fiscal_period = str(anchor.get("fp", "")).upper()
        source_filing = str(anchor.get("form", "")).upper() or "UNKNOWN"

        if not fiscal_year or not fiscal_period:
            return error_response(
                gate=GATE_NAME,
                code="SEC_ANCHOR_PERIOD_INCOMPLETE",
                message="Anchor fact is missing fiscal year or fiscal period",
                inputs_used=inputs_used,
            )

        net_income = float(anchor["val"])
        operating_cashflow, operating_cashflow_concept = _extract_metric(
            facts,
            "us-gaap",
            ["NetCashProvidedByUsedInOperatingActivities"],
            "USD",
            fiscal_year,
            fiscal_period,
        )
        capex, capex_concept = _extract_metric(
            facts,
            "us-gaap",
            ["PaymentsToAcquirePropertyPlantAndEquipment"],
            "USD",
            fiscal_year,
            fiscal_period,
        )
        cash, cash_concept = _extract_metric(
            facts,
            "us-gaap",
            ["CashAndCashEquivalentsAtCarryingValue"],
            "USD",
            fiscal_year,
            fiscal_period,
        )
        long_term_debt, long_term_debt_concept = _extract_metric(
            facts,
            "us-gaap",
            ["LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],
            "USD",
            fiscal_year,
            fiscal_period,
        )
        current_debt, current_debt_concept = _extract_metric(
            facts,
            "us-gaap",
            ["DebtCurrent", "ShortTermDebt", "ShortTermBorrowings", "CommercialPaper"],
            "USD",
            fiscal_year,
            fiscal_period,
        )
        shares_outstanding, shares_concept = _extract_metric(
            facts,
            "dei",
            SHARES_OUTSTANDING_DEI_CONCEPTS,
            "shares",
            fiscal_year,
            fiscal_period,
        )
        shares_source_note = "exact_period"
        if shares_outstanding is None:
            shares_outstanding, shares_concept = _extract_metric(
                facts,
                "us-gaap",
                SHARES_OUTSTANDING_GAAP_CONCEPTS,
                "shares",
                fiscal_year,
                fiscal_period,
            )
        # Fallback: try DEI across ANY period
        if shares_outstanding is None:
            shares_outstanding, shares_concept, shares_source_note = _extract_metric_any_period(
                facts, "dei", SHARES_OUTSTANDING_DEI_CONCEPTS, "shares",
            )
        # Fallback: try GAAP concepts across ANY period
        if shares_outstanding is None:
            shares_outstanding, shares_concept, shares_source_note = _extract_metric_any_period(
                facts, "us-gaap", SHARES_OUTSTANDING_GAAP_CONCEPTS, "shares",
            )
        interest_expense, interest_expense_concept = _extract_metric(
            facts,
            "us-gaap",
            INTEREST_EXPENSE_CONCEPTS,
            "USD",
            fiscal_year,
            fiscal_period,
        )
        # Fallback: find interest expense across ANY period (non-blocking — only
        # used for interest_coverage ratio; missing is tolerated)
        interest_expense_fallback_note = ""
        if interest_expense is None:
            interest_expense, interest_expense_concept, interest_expense_fallback_note = (
                _extract_metric_any_period(
                    facts, "us-gaap", INTEREST_EXPENSE_CONCEPTS, "USD"
                )
            )
        operating_income, operating_income_concept = _extract_metric(
            facts,
            "us-gaap",
            ["OperatingIncomeLoss"],
            "USD",
            fiscal_year,
            fiscal_period,
        )

        capex_missing = capex is None
        free_cashflow = None
        if operating_cashflow is not None:
            capex_for_fcf = float(capex) if capex is not None else 0.0
            free_cashflow = float(operating_cashflow) - capex_for_fcf

        long_term_debt_value = float(long_term_debt) if long_term_debt is not None else 0.0
        current_debt_value = float(current_debt) if current_debt is not None else 0.0
        total_debt = long_term_debt_value + current_debt_value

        interest_coverage = None
        if interest_expense is not None and operating_income is not None and abs(float(interest_expense)) > 0.0:
            interest_coverage = operating_income / abs(float(interest_expense))

        required_metrics = {
            "net_income": net_income,
            "operating_cashflow": operating_cashflow,
            "cash": cash,
            "shares_outstanding": shares_outstanding,
        }
        missing = [key for key, value in required_metrics.items() if value is None]
        if missing:
            # WHY: shares_outstanding is the most common missing metric; give an
            # actionable error so the user knows all fallback concepts failed.
            if "shares_outstanding" in missing:
                all_tried = SHARES_OUTSTANDING_DEI_CONCEPTS + SHARES_OUTSTANDING_GAAP_CONCEPTS
                shares_msg = (
                    f" shares_outstanding: tried {', '.join(all_tried)} "
                    f"(both exact period {fiscal_year} {fiscal_period} and any-period fallback) — "
                    f"all missing for CIK {normalized_cik}."
                )
            else:
                shares_msg = ""
            return error_response(
                gate=GATE_NAME,
                code="SEC_MISSING_REQUIRED_METRICS",
                message=(
                    f"Missing SEC metrics for CIK {normalized_cik} in period "
                    f"{fiscal_year} {fiscal_period}: {', '.join(missing)}.{shares_msg}"
                ),
                inputs_used=inputs_used,
                missing_inputs=missing,
            )

        data = {
            "net_income": round_float(net_income, 2),
            "operating_cashflow": round_float(float(operating_cashflow), 2),
            "capex": round_float(float(capex), 2) if capex is not None else None,
            "free_cashflow": round_float(float(free_cashflow), 2),
            "cash": round_float(float(cash), 2),
            "long_term_debt": round_float(long_term_debt_value, 2),
            "current_debt": round_float(current_debt_value, 2),
            "total_debt": round_float(total_debt, 2),
            "shares_outstanding": round_float(float(shares_outstanding), 2),
            "interest_expense": round_float(float(interest_expense), 2) if interest_expense is not None else None,
            "interest_coverage": round_float(float(interest_coverage), 6) if interest_coverage is not None else None,
            "source_filing": source_filing,
            "fiscal_year": fiscal_year,
            "fiscal_period": fiscal_period,
            "data_source": "SEC_EDGAR_XBRL",
            "data_quality": {
                "capex_missing": capex_missing,
                "free_cashflow_fallback": "OPERATING_CASHFLOW_MINUS_CAPEX_OR_ZERO_IF_CAPEX_MISSING",
                "shares_source_note": shares_source_note,
                "interest_expense_fallback_note": interest_expense_fallback_note if interest_expense_fallback_note else None,
            },
            "concepts_used": {
                "net_income": "NetIncomeLoss",
                "operating_cashflow": operating_cashflow_concept,
                "capex": capex_concept,
                "cash": cash_concept,
                "long_term_debt": long_term_debt_concept,
                "current_debt": current_debt_concept,
                "shares_outstanding": shares_concept,
                "interest_expense": interest_expense_concept,
                "operating_income": operating_income_concept,
            },
            "units": {
                "net_income": "USD",
                "operating_cashflow": "USD",
                "capex": "USD",
                "free_cashflow": "USD",
                "cash": "USD",
                "total_debt": "USD",
                "shares_outstanding": "shares",
                "interest_expense": "USD",
                "interest_coverage": "ratio",
            },
        }

        structured_log(
            logger,
            "info",
            "sec_data_fetched",
            gate=GATE_NAME,
            cik=normalized_cik,
            source_filing=source_filing,
            fiscal_year=fiscal_year,
            fiscal_period=fiscal_period,
        )

        confidence = 95 if shares_source_note == "exact_period" else 75
        one_liner = (
            f"SEC fundamentals loaded for CIK {normalized_cik} "
            f"({source_filing} {fiscal_year} {fiscal_period})"
        )
        return ok_response(
            gate=GATE_NAME, data=data, inputs_used=inputs_used,
            confidence=confidence, one_liner=one_liner,
        )

    except httpx.HTTPError as error:
        structured_log(logger, "error", "sec_http_error", gate=GATE_NAME, cik=normalized_cik, error=str(error))
        return error_response(
            gate=GATE_NAME,
            code="SEC_FETCH_HTTP_ERROR",
            message=f"Failed to fetch SEC data: {error}",
            inputs_used=inputs_used,
        )
    except Exception as error:
        structured_log(logger, "error", "sec_unexpected_error", gate=GATE_NAME, cik=normalized_cik, error=str(error))
        return error_response(
            gate=GATE_NAME,
            code="SEC_INTERNAL_ERROR",
            message=f"SEC data fetch failed: {error}",
            inputs_used=inputs_used,
        )


# ---------------------------------------------------------------------------
# Business context fetcher (for Gate 1)
# ---------------------------------------------------------------------------

GATE_NAME_CONTEXT = "Data Fetcher – SEC Business Context"


def _strip_html(html: str) -> str:
    """Remove HTML tags and normalise whitespace."""
    text = re.sub(r"<style[^>]*>.*?</style>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-zA-Z]+;", " ", text)   # HTML entities
    text = re.sub(r"&#\d+;", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_filing_sections(text: str) -> dict[str, str]:
    """Try to locate Item 1 (Business) and Item 1A (Risk Factors) in 10-K text."""
    sections: dict[str, str] = {}

    item1_match = re.search(
        r"Item\s*1[.\s]*[-\u2013\u2014]?\s*Business", text, re.IGNORECASE,
    )
    item1a_match = re.search(
        r"Item\s*1A[.\s]*[-\u2013\u2014]?\s*Risk\s*Factors", text, re.IGNORECASE,
    )
    item1b_match = re.search(
        r"Item\s*1B[.\s]*[-\u2013\u2014]?\s*Unresolved", text, re.IGNORECASE,
    )
    item2_match = re.search(
        r"Item\s*2[.\s]*[-\u2013\u2014]?\s*Properties", text, re.IGNORECASE,
    )

    if item1_match:
        start = item1_match.start()
        end_marker = item1a_match or item1b_match or item2_match
        end = (
            end_marker.start()
            if end_marker and end_marker.start() > start
            else start + 10_000
        )
        sections["business_description"] = text[start : min(end, start + 10_000)].strip()

    if item1a_match:
        start = item1a_match.start()
        end_marker = item1b_match or item2_match
        end = (
            end_marker.start()
            if end_marker and end_marker.start() > start
            else start + 10_000
        )
        sections["risk_factors"] = text[start : min(end, start + 10_000)].strip()

    return sections


def fetch_sec_business_context(cik: str) -> dict[str, Any]:
    """Fetch company metadata and 10-K text for Gate 1 business context."""
    normalized_cik = str(cik).strip().zfill(10)
    cik_number = str(int(normalized_cik))  # remove leading zeros for archive URL
    inputs_used = ["cik", "submissions", "10-K_filing_text"]

    try:
        headers = {"User-Agent": os.getenv("SEC_USER_AGENT", "Mizan mizan@example.com")}

        # 1. Fetch submissions metadata
        sub_url = f"https://data.sec.gov/submissions/CIK{normalized_cik}.json"
        sub_resp = httpx.get(sub_url, headers=headers, timeout=15.0)
        sub_resp.raise_for_status()
        sub_data = sub_resp.json()

        company_name = sub_data.get("name", "")
        sic = sub_data.get("sic", "")
        sic_description = sub_data.get("sicDescription", "")
        entity_type = sub_data.get("entityType", "")
        category = sub_data.get("category", "")

        # 2. Find latest 10-K / 20-F / 40-F filing
        recent = sub_data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        accessions = recent.get("accessionNumber", [])
        primary_docs = recent.get("primaryDocument", [])
        filing_dates = recent.get("filingDate", [])

        tenk_index = None
        for i, form in enumerate(forms):
            if form in ("10-K", "20-F", "40-F"):
                tenk_index = i
                break

        filing_text_sections: dict[str, str] = {}
        filing_source: str | None = None
        filing_date: str | None = None

        if (
            tenk_index is not None
            and tenk_index < len(accessions)
            and tenk_index < len(primary_docs)
        ):
            accession = accessions[tenk_index]
            primary_doc = primary_docs[tenk_index]
            filing_date = (
                filing_dates[tenk_index] if tenk_index < len(filing_dates) else None
            )
            accession_dir = accession.replace("-", "")
            doc_url = (
                f"https://www.sec.gov/Archives/edgar/data/"
                f"{cik_number}/{accession_dir}/{primary_doc}"
            )
            filing_source = doc_url

            try:
                doc_resp = httpx.get(doc_url, headers=headers, timeout=30.0)
                doc_resp.raise_for_status()
                html_text = doc_resp.text[:500_000]  # cap at 500 KB
                clean_text = _strip_html(html_text)
                filing_text_sections = _extract_filing_sections(clean_text)
            except Exception as text_err:
                structured_log(
                    logger,
                    "warning",
                    "sec_filing_text_extraction_failed",
                    gate=GATE_NAME_CONTEXT,
                    url=doc_url,
                    error=str(text_err),
                )

        data = {
            "company_name": company_name,
            "sic": sic,
            "sic_description": sic_description,
            "entity_type": entity_type,
            "category": category,
            "filing_source": filing_source,
            "filing_date": filing_date,
            "business_description": filing_text_sections.get("business_description"),
            "risk_factors": filing_text_sections.get("risk_factors"),
        }

        structured_log(
            logger,
            "info",
            "sec_business_context_fetched",
            gate=GATE_NAME_CONTEXT,
            cik=normalized_cik,
            has_business_description=bool(filing_text_sections.get("business_description")),
            has_risk_factors=bool(filing_text_sections.get("risk_factors")),
        )

        has_desc = bool(filing_text_sections.get("business_description"))
        has_risk = bool(filing_text_sections.get("risk_factors"))
        if has_desc and has_risk:
            ctx_confidence = 90
            ctx_one_liner = f"10-K business description and risk factors loaded for CIK {normalized_cik}"
        elif has_desc or has_risk:
            ctx_confidence = 60
            ctx_one_liner = f"Partial 10-K sections loaded for CIK {normalized_cik}"
        else:
            ctx_confidence = 30
            ctx_one_liner = f"Metadata only for CIK {normalized_cik} — no 10-K text sections found"

        return ok_response(
            gate=GATE_NAME_CONTEXT, data=data, inputs_used=inputs_used,
            confidence=ctx_confidence, one_liner=ctx_one_liner,
        )

    except httpx.HTTPError as error:
        structured_log(
            logger, "error", "sec_business_context_http_error",
            gate=GATE_NAME_CONTEXT, error=str(error),
        )
        return error_response(
            gate=GATE_NAME_CONTEXT,
            code="SEC_BUSINESS_CONTEXT_HTTP_ERROR",
            message=f"Failed to fetch SEC business context: {error}",
            inputs_used=inputs_used,
        )
    except Exception as error:
        structured_log(
            logger, "error", "sec_business_context_unexpected_error",
            gate=GATE_NAME_CONTEXT, error=str(error),
        )
        return error_response(
            gate=GATE_NAME_CONTEXT,
            code="SEC_BUSINESS_CONTEXT_INTERNAL_ERROR",
            message=f"SEC business context fetch failed: {error}",
            inputs_used=inputs_used,
        )
