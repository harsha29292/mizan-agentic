"""
Shared LLM configuration for the project.
Ensures all LLM usage is Gemini-based and consistent.
"""
import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


def get_gemini_llm(temperature: float = 0) -> ChatGoogleGenerativeAI:
    """Return a Gemini LLM client with shared project defaults."""
    return ChatGoogleGenerativeAI(
        model=GEMINI_MODEL,
        temperature=temperature,
        google_api_key=os.getenv("GOOGLE_API_KEY")
    )
