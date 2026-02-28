"""Utilities for parsing structured JSON from LLM outputs."""
import json
import re
from typing import Any, Dict


def parse_json_object(raw: Any) -> Dict[str, Any]:
    text = str(raw).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text, re.IGNORECASE)
    if fenced:
        return json.loads(fenced.group(1))

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(text[start:end + 1])

    raise ValueError("Unable to parse JSON object from model output")
