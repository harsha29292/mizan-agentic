"""
Mizan — Internal Financial Decision Engine
Entry point for FastAPI application

Orchestration is delegated to app.orchestrator.run_pipeline().
This module handles HTTP routing, CORS, and error boundaries only.
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import logging

from app.orchestrator import run_pipeline
from app.response_utils import structured_log

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Mizan",
    description="Internal Financial Decision Engine",
    version="2.0.0"
)

# CORS (internal tool, but allow for testing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalysisRequest(BaseModel):
    """Input contract for analysis endpoint"""
    company_input: str = Field(..., description="Ticker symbol or company name")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Mizan",
        "status": "operational",
        "version": "2.0.0"
    }


@app.get("/health")
async def health():
    """Explicit health endpoint for frontend monitoring"""
    return {
        "service": "Mizan",
        "status": "operational",
        "version": "2.0.0"
    }


@app.post("/analyze")
async def analyze_company(request: AnalysisRequest):
    """
    Main analysis endpoint.

    Delegates to the Orchestrator Agent which runs gates 0-6 sequentially,
    tracks data sufficiency, suppresses downstream on REJECT signals,
    and computes pipeline-level confidence.
    """
    try:
        structured_log(logger, "info", "analysis_request_received", company_input=request.company_input)
        response = run_pipeline(request.company_input)
        return response

    except Exception as error:
        structured_log(logger, "error", "analysis_unexpected_error", company_input=request.company_input, error=str(error))
        raise HTTPException(status_code=500, detail=str(error))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
