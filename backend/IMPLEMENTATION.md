# Mizan Implementation Guide

## What's Been Built

✅ **Complete fail-closed architecture**
- FastAPI application with sequential gate execution
- Pydantic validation for all inputs/outputs
- Explicit error handling at every gate

✅ **All 6 Gates Implemented**
- Gate 0: Identity Resolution (deterministic, SEC lookup)
- Gate 2: Valuation & Margin of Safety (pure Python math)
- Gate 3: Market Structure (LLM interpretation only)
- Gate 4: Impairment Risk (LLM interpretation only)
- Gate 5: Position Sizing (deterministic calculation)
- Gate 6: Final Verdict (deterministic aggregation)

✅ **LLM Integration**
- CrewAI with temperature=0
- Strict JSON outputs
- No calculation, only interpretation

✅ **Data Fetchers (STUB)**
- SEC fetcher (needs XBRL parsing)
- Polygon fetcher (needs API integration)
- FRED fetcher (needs API integration)

## What You Need to Do

### 1. Set Up Environment

```bash
cd mizan
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure API Keys

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required keys:
- `GOOGLE_API_KEY` - For CrewAI LLM calls (Google Gemini)
- `POLYGON_API_KEY` - For market data (optional for testing)
- `FRED_API_KEY` - For macro data (optional for testing)

### 3. Implement Real Data Fetchers

**Priority: SEC Fetcher**

The system currently uses stub data. You need to implement real XBRL parsing in:
- `app/data_fetchers/sec_fetcher.py`

Resources:
- SEC EDGAR API: https://www.sec.gov/edgar/sec-api-documentation
- Company Facts API: `https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json`
- XBRL tags to extract:
  - `NetIncomeLoss`
  - `NetCashProvidedByUsedInOperatingActivities`
  - `DebtCurrent` + `DebtNoncurrent`
  - `CashAndCashEquivalentsAtCarryingValue`
  - `CommonStockSharesOutstanding`
  - `InterestExpense`

**Optional: Polygon & FRED**

For testing, the stub data works. For production:
- Implement `app/data_fetchers/polygon_fetcher.py`
- Implement `app/data_fetchers/fred_fetcher.py`

### 4. Run the Server

```bash
uvicorn app.main:app --reload
```

Server runs at: http://localhost:8000

API docs: http://localhost:8000/docs

### 5. Test the System

```bash
python test_api.py
```

Or use curl:

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"company_input": "AAPL"}'
```

## Architecture Compliance

✅ **Fail-closed**: Every gate validates inputs, returns ERROR if missing
✅ **Deterministic math**: Gates 2, 5, 6 are pure Python
✅ **LLM interpretation only**: Gates 3, 4 never calculate
✅ **Explicit context**: Each gate receives only declared inputs
✅ **No hallucinations**: Missing data = explicit error message

## Decision Flow

```
Input: "AAPL"
  ↓
Gate 0: Resolve → ticker=AAPL, cik=0000320193
  ↓
Fetch Data: SEC + Polygon + FRED
  ↓
Gate 2: Calculate intrinsic value, margin of safety
  ↓ (if PASS)
Gate 3: LLM classifies market (TAILWIND/NEUTRAL/HEADWIND)
  ↓
Gate 4: LLM assesses impairment risk (LOW/MEDIUM/HIGH)
  ↓
Gate 5: Calculate position size (% NAV)
  ↓
Gate 6: Aggregate → INVEST / WATCH / REJECT
```

## Next Steps

1. **Get Google API key** → Add to `.env` (for Gemini)
2. **Test with stub data** → Verify gates work
3. **Implement SEC fetcher** → Real financial data
4. **Test with real company** → Validate end-to-end
5. **Add Polygon/FRED** → Complete market data

## Debugging

Check logs:
```bash
tail -f app.log
```

Test individual gates:
```python
from app.gates.gate0_identity import resolve_identity
result = resolve_identity("AAPL")
print(result)
```

## Production Checklist

- [ ] Real SEC XBRL parsing
- [ ] Real Polygon API integration
- [ ] Real FRED API integration
- [ ] Error monitoring
- [ ] Rate limiting on external APIs
- [ ] Caching for SEC data
- [ ] Docker deployment
- [ ] Environment-specific configs
