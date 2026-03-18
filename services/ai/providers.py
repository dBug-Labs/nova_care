import httpx
import sys
import os

# Allow importing config from the api directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))
from config import settings
from typing import AsyncGenerator

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={settings.GOOGLE_AI_API_KEY}"

MODELS = {
    "nurse_chat":      ("groq",        "llama-3.3-70b-versatile"),
    "quick_analysis":  ("groq",        "llama-3.1-8b-instant"),
    "deep_reasoning":  ("openrouter",  "deepseek/deepseek-chat-v3-0324:free"),
    "lab_vision":      ("openrouter",  "google/gemini-2.0-flash-exp:free"),
    "fallback":        ("gemini",      "gemini-2.0-flash"),
}


async def call_groq(model: str, messages: list, stream: bool = False) -> dict | AsyncGenerator:
    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, "messages": messages, "stream": stream, "max_tokens": 1024, "temperature": 0.7}

    async with httpx.AsyncClient(timeout=30) as client:
        if stream:
            async def _stream():
                async with client.stream("POST", GROQ_URL, json=payload, headers=headers) as r:
                    async for line in r.aiter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            import json
                            chunk = json.loads(line[6:])
                            delta = chunk["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
            return _stream()
        else:
            r = await client.post(GROQ_URL, json=payload, headers=headers)
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]


async def call_openrouter(model: str, messages: list) -> str:
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://novacare.health",
        "X-Title": "NovaCare",
    }
    payload = {"model": model, "messages": messages, "max_tokens": 1024}
    async with httpx.AsyncClient(timeout=45) as client:
        r = await client.post(OPENROUTER_URL, json=payload, headers=headers)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


async def call_gemini(messages: list) -> str:
    # Convert messages to Gemini format
    contents = [{"role": "user" if m["role"] == "user" else "model",
                 "parts": [{"text": m["content"]}]} for m in messages if m["role"] != "system"]
    payload = {"contents": contents, "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.7}}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(GEMINI_URL, json=payload)
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]


async def ai_complete(task: str, messages: list, stream: bool = False):
    """
    Smart router: tries primary model, falls back on error.
    task: one of MODELS keys
    """
    provider, model = MODELS.get(task, MODELS["nurse_chat"])
    try:
        if provider == "groq":
            return await call_groq(model, messages, stream=stream)
        elif provider == "openrouter":
            return await call_openrouter(model, messages)
        elif provider == "gemini":
            return await call_gemini(messages)
    except Exception as e:
        print(f"[AI] Primary model {model} failed: {e} — falling back")
        # Fallback chain
        try:
            return await call_groq("llama-3.1-8b-instant", messages)
        except Exception:
            try:
                return await call_openrouter("deepseek/deepseek-chat-v3-0324:free", messages)
            except Exception:
                return await call_gemini(messages)
