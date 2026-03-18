import httpx
import sys
import os
import json as _json

# Allow importing config from the api directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))
from config import settings
from typing import AsyncGenerator

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# All tasks routed through Groq only
MODELS = {
    "nurse_chat":      "llama-3.3-70b-versatile",
    "quick_analysis":  "llama-3.1-8b-instant",
    "deep_reasoning":  "llama-3.3-70b-versatile",
    "lab_vision":      "llama-3.3-70b-versatile",
    "fallback":        "llama-3.1-8b-instant",
}


async def call_groq(model: str, messages: list, stream: bool = False) -> str | AsyncGenerator:
    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, "messages": messages, "stream": stream, "max_tokens": 1024, "temperature": 0.7}

    if stream:
        async def _stream():
            async with httpx.AsyncClient(timeout=30) as client:
                async with client.stream("POST", GROQ_URL, json=payload, headers=headers) as r:
                    async for line in r.aiter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            chunk = _json.loads(line[6:])
                            delta = chunk["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
        return _stream()
    else:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(GROQ_URL, json=payload, headers=headers)
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]


async def call_openrouter(model: str, messages: list) -> str:
    """Deprecated — redirects to Groq."""
    return await call_groq("llama-3.3-70b-versatile", messages)


async def call_gemini(messages: list) -> str:
    """Deprecated — redirects to Groq."""
    return await call_groq("llama-3.1-8b-instant", messages)


async def ai_complete(task: str, messages: list, stream: bool = False):
    """
    All AI tasks routed through Groq.
    task: one of MODELS keys
    """
    model = MODELS.get(task, MODELS["fallback"])
    try:
        return await call_groq(model, messages, stream=stream)
    except Exception as e:
        print(f"[AI] Primary model {model} failed: {e} — trying fallback")
        return await call_groq("llama-3.1-8b-instant", messages, stream=stream)


async def ai_transcribe(audio_bytes: bytes, filename: str) -> str:
    """Transcribe audio using Groq's Whisper API"""
    url = "https://api.groq.com/openai/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {settings.GROQ_API_KEY}"}
    files = {"file": (filename, audio_bytes, "audio/m4a")}
    data = {"model": "whisper-large-v3-turbo"}
    
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, headers=headers, files=files, data=data)
        r.raise_for_status()
        return r.json().get("text", "").strip()

