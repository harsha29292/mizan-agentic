# Mizan — Internal Financial Decision Engine

**Purpose**: Real capital allocation engine for equity evaluation through sequential decision gates.

## Core Principles

- **Fail-closed**: Missing data = explicit error, never guess
- **Deterministic**: All math in pure Python, zero randomness
- **LLMs interpret only**: Never calculate, never invent values
- **Explicit context**: Each gate receives only declared inputs

## Architecture

```
FastAPI
 ├── Input Validation (Pydantic)
 ├── Identity Resolution (SEC)
 ├── Data Fetchers (SEC, Polygon, FRED, Dome)
 ├── Numeric Engine (pure Python)
 ├── Gate Execution Harness (fail-closed)
 ├── CrewAI (interpretation only)
 └── Output Validator
```

## Gates

0. **Identity Resolution** — Resolve ticker → CIK
2. **Valuation & Margin of Safety** — Deterministic intrinsic value
3. **Market Structure** — LLM classification (TAILWIND/NEUTRAL/HEADWIND)
4. **Permanent Impairment Risk** — LLM interpretation (LOW/MEDIUM/HIGH)
5. **Position Sizing** — Conservative % NAV calculation
6. **Final Verdict** — Aggregation (INVEST/WATCH/REJECT)

## Tech Stack

- Python 3.11+
- FastAPI
- CrewAI (temperature=0, strict JSON)
- Pydantic for validation

## Installation

```bash
pip install -r requirements.txt
```

## Usage

```bash
uvicorn app.main:app --reload
```

POST `/analyze` with:
```json
{
  "company_input": "AAPL"
}
```

## Success Criteria

✅ Every output is traceable  
✅ Every failure is explicit  
✅ No LLM can change numeric truth  
✅ System prefers silence over error
