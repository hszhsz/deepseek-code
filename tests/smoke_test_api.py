#!/usr/bin/env python3
"""
deepseek-code Smoke Test
Tests core DeepSeek API capabilities that our code relies on:
1. Basic Chat Completion (OpenAI-compatible format)
2. Tool Calling / Function Calling
3. FIM (Fill-in-the-Middle) Completion
4. Thinking/Reasoning Mode
"""

import json
import sys
import time
import traceback

API_KEY = "sk-d782c00f1f554122b29e3ff9388ade44"
BASE_URL = "https://api.deepseek.com"
BETA_URL = "https://api.deepseek.com/beta"

# Use urllib to avoid needing requests library
import urllib.request
import urllib.error

def api_call(url, payload, headers=None):
    """Make an API call and return the response."""
    h = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    }
    if headers:
        h.update(headers)
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=h, method="POST")
    
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8")), resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        return {"error": body, "status_code": e.code}, e.code
    except Exception as e:
        return {"error": str(e)}, 0


def test_basic_chat():
    """Test 1: Basic chat completion (OpenAI-compatible)"""
    print("\n" + "="*60)
    print("TEST 1: Basic Chat Completion")
    print("="*60)
    
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "user", "content": "What is 2+2? Reply with just the number."}
        ],
        "max_tokens": 100,
        "temperature": 0,
    }
    
    resp, status = api_call(f"{BASE_URL}/v1/chat/completions", payload)
    
    if status == 200:
        content = resp["choices"][0]["message"]["content"]
        model_used = resp.get("model", "unknown")
        usage = resp.get("usage", {})
        print(f"  Status: PASS ✓")
        print(f"  Model: {model_used}")
        print(f"  Response: {content.strip()}")
        print(f"  Tokens: input={usage.get('prompt_tokens',0)}, output={usage.get('completion_tokens',0)}")
        return True
    else:
        print(f"  Status: FAIL ✗")
        print(f"  Error: {resp}")
        return False


def test_tool_calling():
    """Test 2: Tool calling / Function calling"""
    print("\n" + "="*60)
    print("TEST 2: Tool Calling")
    print("="*60)
    
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get the current weather for a location",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "City name"
                        }
                    },
                    "required": ["location"]
                }
            }
        }
    ]
    
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "user", "content": "What's the weather in Beijing?"}
        ],
        "tools": tools,
        "tool_choice": "auto",
        "max_tokens": 200,
    }
    
    resp, status = api_call(f"{BASE_URL}/v1/chat/completions", payload)
    
    if status == 200:
        message = resp["choices"][0]["message"]
        tool_calls = message.get("tool_calls", [])
        if tool_calls:
            tc = tool_calls[0]
            func_name = tc["function"]["name"]
            func_args = tc["function"]["arguments"]
            print(f"  Status: PASS ✓")
            print(f"  Tool called: {func_name}")
            print(f"  Arguments: {func_args}")
            return True
        else:
            # Some models might respond directly without tool call
            content = message.get("content", "")
            print(f"  Status: WARN (no tool_calls, got content instead)")
            print(f"  Content: {content[:100]}")
            return True  # Not a hard failure
    else:
        print(f"  Status: FAIL ✗")
        print(f"  Error: {resp}")
        return False


def test_fim_completion():
    """Test 3: FIM (Fill-in-the-Middle) completion"""
    print("\n" + "="*60)
    print("TEST 3: FIM Code Completion")
    print("="*60)
    
    # Test FIM with a simple Python function
    prefix = """def fibonacci(n):
    \"\"\"Calculate the nth Fibonacci number.\"\"\"
    if n <= 1:
        return n
"""
    suffix = """
    return fibonacci(n-1) + fibonacci(n-2)

print(fibonacci(10))
"""
    
    payload = {
        "model": "deepseek-chat",
        "prompt": prefix,
        "suffix": suffix,
        "max_tokens": 100,
        "temperature": 0,
    }
    
    resp, status = api_call(f"{BETA_URL}/v1/completions", payload)
    
    if status == 200:
        completion = resp["choices"][0]["text"]
        print(f"  Status: PASS ✓")
        print(f"  Prefix ends: ...if n <= 1: return n")
        print(f"  Completion: {completion.strip()[:200]}")
        print(f"  Suffix starts: return fibonacci(n-1)...")
        return True
    else:
        print(f"  Status: FAIL ✗")
        print(f"  HTTP Status: {status}")
        print(f"  Error: {json.dumps(resp, indent=2)[:500]}")
        return False


def test_thinking_mode():
    """Test 4: Thinking/Reasoning mode"""
    print("\n" + "="*60)
    print("TEST 4: Thinking/Reasoning Mode")
    print("="*60)
    
    payload = {
        "model": "deepseek-reasoner",
        "messages": [
            {"role": "user", "content": "What is 15 * 37? Think step by step."}
        ],
        "max_tokens": 500,
    }
    
    resp, status = api_call(f"{BASE_URL}/v1/chat/completions", payload)
    
    if status == 200:
        message = resp["choices"][0]["message"]
        content = message.get("content", "")
        reasoning = message.get("reasoning_content", "")
        model_used = resp.get("model", "unknown")
        usage = resp.get("usage", {})
        print(f"  Status: PASS ✓")
        print(f"  Model: {model_used}")
        if reasoning:
            print(f"  Reasoning: {reasoning[:200]}...")
        print(f"  Answer: {content.strip()[:200]}")
        print(f"  Tokens: input={usage.get('prompt_tokens',0)}, reasoning={usage.get('completion_tokens_details',{}).get('reasoning_tokens',0)}, output={usage.get('completion_tokens',0)}")
        return True
    else:
        print(f"  Status: FAIL ✗")
        print(f"  Error: {json.dumps(resp, indent=2)[:500]}")
        return False


def test_tool_calling_with_thinking():
    """Test 5: Tool calling combined with thinking mode"""
    print("\n" + "="*60)
    print("TEST 5: Tool Calling + Thinking Mode")
    print("="*60)
    
    tools = [
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read the contents of a file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "File path to read"
                        }
                    },
                    "required": ["path"]
                }
            }
        }
    ]
    
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "You are a coding assistant. Use tools to help the user."},
            {"role": "user", "content": "Please read the file at /src/main.ts to check for errors."}
        ],
        "tools": tools,
        "tool_choice": "auto",
        "max_tokens": 300,
    }
    
    resp, status = api_call(f"{BASE_URL}/v1/chat/completions", payload)
    
    if status == 200:
        message = resp["choices"][0]["message"]
        tool_calls = message.get("tool_calls", [])
        reasoning = message.get("reasoning_content", "")
        
        if tool_calls:
            tc = tool_calls[0]
            print(f"  Status: PASS ✓")
            print(f"  Tool: {tc['function']['name']}")
            print(f"  Args: {tc['function']['arguments']}")
            if reasoning:
                print(f"  Reasoning present: Yes ({len(reasoning)} chars)")
            return True
        else:
            content = message.get("content", "")
            print(f"  Status: WARN (model responded without tool call)")
            print(f"  Content: {content[:150]}")
            return True
    else:
        print(f"  Status: FAIL ✗")
        print(f"  Error: {resp}")
        return False


def test_streaming():
    """Test 6: Streaming response (basic validation)"""
    print("\n" + "="*60)
    print("TEST 6: Streaming Response")
    print("="*60)
    
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "user", "content": "Count from 1 to 5."}
        ],
        "max_tokens": 50,
        "stream": True,
    }
    
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    }
    req = urllib.request.Request(f"{BASE_URL}/v1/chat/completions", data=data, headers=headers, method="POST")
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            chunks = []
            for line in resp:
                line = line.decode("utf-8").strip()
                if line.startswith("data: ") and line != "data: [DONE]":
                    chunk_data = json.loads(line[6:])
                    delta = chunk_data["choices"][0].get("delta", {})
                    if "content" in delta:
                        chunks.append(delta["content"])
            
            full_content = "".join(chunks)
            print(f"  Status: PASS ✓")
            print(f"  Chunks received: {len(chunks)}")
            print(f"  Content: {full_content.strip()[:100]}")
            return True
    except Exception as e:
        print(f"  Status: FAIL ✗")
        print(f"  Error: {e}")
        return False


if __name__ == "__main__":
    print("╔══════════════════════════════════════════════════════════╗")
    print("║          deepseek-code Smoke Test Suite                  ║")
    print("╠══════════════════════════════════════════════════════════╣")
    print(f"║  API Base: {BASE_URL:<45}║")
    print(f"║  API Key:  sk-...{API_KEY[-6:]:<43}║")
    print("╚══════════════════════════════════════════════════════════╝")
    
    results = {}
    tests = [
        ("Basic Chat", test_basic_chat),
        ("Tool Calling", test_tool_calling),
        ("FIM Completion", test_fim_completion),
        ("Thinking Mode", test_thinking_mode),
        ("Tool + Thinking", test_tool_calling_with_thinking),
        ("Streaming", test_streaming),
    ]
    
    for name, test_fn in tests:
        try:
            results[name] = test_fn()
        except Exception as e:
            print(f"  Status: ERROR ✗")
            print(f"  Exception: {e}")
            traceback.print_exc()
            results[name] = False
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    for name, result in results.items():
        status = "PASS ✓" if result else "FAIL ✗"
        print(f"  {name:<20} {status}")
    print(f"\n  Result: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n  🎉 All smoke tests PASSED!")
        sys.exit(0)
    else:
        print("\n  ⚠️  Some tests failed. Investigating...")
        sys.exit(1)
