"""
Test script for Mizan API
Run this to verify the system works end-to-end
"""
import httpx
import json


def test_analyze_endpoint():
    """Test the /analyze endpoint with a sample company"""
    
    url = "http://localhost:8000/analyze"
    payload = {
        "company_input": "AAPL"
    }
    
    print("Testing Mizan API...")
    print(f"Request: POST {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    print("\n" + "="*60 + "\n")
    
    try:
        response = httpx.post(url, json=payload, timeout=30.0)
        response.raise_for_status()
        
        result = response.json()
        
        print("Response:")
        print(json.dumps(result, indent=2))
        
        if result["status"] == "OK":
            print("\n" + "="*60)
            print("✅ SUCCESS")
            final = (result.get("final") or {}).get("data") or {}
            print(f"Verdict: {final.get('verdict')}")
            if "max_position_size" in final:
                print(f"Max Position: {final['max_position_size']}")
            print(f"Risk Notes: {final.get('risk_notes')}")
        else:
            print("\n" + "="*60)
            print("❌ ERROR")
            print(f"Stage: {result.get('failed_stage')}")
            print(f"Reason: {(result.get('error') or {}).get('message')}")
            
    except httpx.HTTPError as e:
        print(f"❌ HTTP Error: {e}")
    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    test_analyze_endpoint()
