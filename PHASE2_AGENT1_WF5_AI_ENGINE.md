# NovaCare — Phase 2 | Agent 1
## Workflows: WF5 — AI Engine (Groq Nurse Chat)
> Paste NOVACARE_MASTER.md into context first, then this file.
> Branch: `phase2/ai-engine`
> Model: Claude Opus
> Dependency: Phase 1 must be merged into `develop` before starting.

---

## Goal
Build the complete AI Nurse engine — the brain of NovaCare. This handles all patient conversations using Groq (primary), with fallback to OpenRouter/Google AI. The AI must feel like a real nurse: warm, empathetic, medically aware, and never clinical.

---

## WF5 Part A — Backend AI Engine

### Step 1 — AI Provider Service
`services/ai/providers.py`:
```python
import httpx
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
```

### Step 2 — Nurse Prompt Engine
`services/ai/prompts.py`:
```python
from typing import Optional

NURSE_SYSTEM_PROMPT = """You are Nova, an empathetic AI health companion built into NovaCare. You act as a caring, knowledgeable nurse — not a doctor.

Your personality:
- Warm, gentle, and reassuring — like a trusted friend who happens to know a lot about health
- Ask one focused follow-up question at a time — never overwhelm the patient
- Use simple language — avoid complex medical jargon unless necessary, and always explain it
- Be culturally sensitive — many users are from India, ages 40–60, with conditions like Diabetes, BP, Heart disease
- Respond in the same language the patient uses (Hindi/English mix is fine)

What you DO:
- Listen actively and validate feelings ("That sounds difficult, let me help...")
- Ask about symptoms in a structured way (location, severity 1-10, duration, what makes it worse/better)
- Suggest evidence-based lifestyle changes (diet, exercise, sleep, stress management)
- Remind about medicines if the patient mentions forgetting
- Celebrate health wins ("Your BP has improved this week — great work!")
- Flag concerning patterns to the doctor dashboard

What you NEVER do:
- Prescribe or change medications
- Diagnose conditions
- Replace professional medical advice
- Panic the patient about symptoms

CRISIS PROTOCOL: If patient mentions chest pain + shortness of breath, or suicidal thoughts, or stroke symptoms (FAST) — immediately say:
"⚠️ This sounds urgent. Please call emergency services (112 in India) right now or ask someone nearby for help. Do not wait."

Patient context will be provided below when available.
"""


def build_nurse_messages(
    user_message: str,
    conversation_history: list,
    patient_context: Optional[dict] = None
) -> list:
    """Build the messages array for the nurse chat."""
    system = NURSE_SYSTEM_PROMPT

    # Inject patient context if available
    if patient_context:
        ctx_parts = []
        if patient_context.get("name"):
            ctx_parts.append(f"Patient name: {patient_context['name']}")
        if patient_context.get("age"):
            ctx_parts.append(f"Age: {patient_context['age']}")
        if patient_context.get("conditions"):
            ctx_parts.append(f"Chronic conditions: {', '.join(patient_context['conditions'])}")
        if patient_context.get("medicines"):
            ctx_parts.append(f"Current medicines: {', '.join(patient_context['medicines'])}")
        if patient_context.get("mood_score"):
            ctx_parts.append(f"Today's mood score: {patient_context['mood_score']}/5")
        if patient_context.get("latest_bp"):
            ctx_parts.append(f"Latest BP: {patient_context['latest_bp']}")
        if patient_context.get("latest_sugar"):
            ctx_parts.append(f"Latest blood sugar: {patient_context['latest_sugar']}")
        if patient_context.get("risk_level"):
            ctx_parts.append(f"Current risk level: {patient_context['risk_level']}")

        if ctx_parts:
            system += "\n\n--- PATIENT CONTEXT ---\n" + "\n".join(ctx_parts)

    messages = [{"role": "system", "content": system}]

    # Add conversation history (last 10 messages to save tokens)
    for msg in conversation_history[-10:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})
    return messages


SENTIMENT_PROMPT = """Analyze the emotional tone and health indicators in this patient message.
Return ONLY valid JSON — no explanation, no markdown.

{
  "mood_score": <1-5>,
  "primary_emotion": "<string>",
  "health_flags": ["<flag1>", "<flag2>"],
  "crisis_detected": <true|false>,
  "urgency": "<low|medium|high|critical>"
}

mood_score: 1=very negative/distressed, 5=very positive/happy
health_flags: any of ["chest_pain","breathlessness","high_sugar","high_bp","missed_medicine","pain","fever","dizziness","fatigue","anxiety","depression"]
crisis_detected: true if patient mentions self-harm, suicidal thoughts, or emergency symptoms

Message: """


ASSESSMENT_QUESTIONS = {
    "general": [
        "How have you been feeling overall this week on a scale of 1 to 10?",
        "Have you been taking all your medicines on time?",
        "How has your sleep been? How many hours per night roughly?",
        "How much water are you drinking daily?",
        "Have you been doing any physical activity this week?",
        "Any new pain or discomfort you'd like to tell me about?",
        "How has your appetite been? Any changes in your diet?",
        "How are you managing stress levels?",
    ],
    "diabetes": [
        "When did you last check your blood sugar? What was the reading?",
        "Have you had any episodes of feeling very shaky, sweaty, or dizzy? (low sugar signs)",
        "Are your feet feeling normal — no numbness or tingling?",
        "Have you been eating at regular meal times?",
        "How much sweet food or refined carbs have you had this week?",
    ],
    "hypertension": [
        "Have you checked your BP recently? What was the reading?",
        "Have you had any headaches, especially in the morning?",
        "How much salt are you consuming? Do you add extra salt to food?",
        "Are you feeling stressed or anxious more than usual?",
        "Have you been regular with your BP medicines?",
    ],
    "heart_disease": [
        "Any chest discomfort, tightness, or pressure recently?",
        "Do you get breathless when climbing stairs or walking?",
        "Have you noticed any swelling in your feet or ankles?",
        "Have you been doing your prescribed cardiac exercises?",
        "Any palpitations or irregular heartbeat sensations?",
    ],
}


def get_assessment_prompt(conditions: list, responses_so_far: list) -> str:
    """Generate next assessment question based on conditions and previous responses."""
    asked = len(responses_so_far)
    questions = ASSESSMENT_QUESTIONS["general"].copy()

    for condition in conditions:
        if condition in ASSESSMENT_QUESTIONS:
            questions.extend(ASSESSMENT_QUESTIONS[condition])

    if asked < len(questions):
        return questions[asked]
    return None  # Assessment complete


RECOMMENDATION_PROMPT = """Based on this patient's health data, generate 3 personalized, actionable wellness recommendations.

Patient data:
{patient_data}

Rules:
- Be specific and realistic — not generic advice
- Consider their conditions and current health metrics
- Make recommendations feel encouraging, not alarming
- Include one lifestyle change, one nutrition tip, one mental wellness tip

Return ONLY valid JSON array:
[
  {{"title": "...", "description": "...", "type": "lifestyle|nutrition|mental|exercise|medication", "priority": "high|medium|low"}},
  {{"title": "...", "description": "...", "type": "...", "priority": "..."}},
  {{"title": "...", "description": "...", "type": "...", "priority": "..."}}
]"""
```

### Step 3 — AI Nurse Router (FastAPI)
`services/api/routers/ai_nurse.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json
from dependencies import get_current_user, supabase
from services.ai.providers import ai_complete
from services.ai.prompts import (
    build_nurse_messages, SENTIMENT_PROMPT, RECOMMENDATION_PROMPT,
    get_assessment_prompt
)

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None  # None = start new session


class AssessmentRequest(BaseModel):
    response: str
    session_id: str
    question_index: int


@router.post("/chat")
async def nurse_chat(req: ChatRequest, user=Depends(get_current_user)):
    """Main AI nurse chat — streams response word by word."""

    # 1. Get or create chat session
    if req.session_id:
        session_res = supabase.table("chat_sessions").select("*").eq("id", req.session_id).single().execute()
        session = session_res.data
    else:
        session_res = supabase.table("chat_sessions").insert({
            "patient_id": user.id,
            "session_type": "general",
            "title": req.message[:50],
        }).execute()
        session = session_res.data[0]

    session_id = session["id"]

    # 2. Fetch conversation history
    history_res = supabase.table("chat_messages")\
        .select("role, content")\
        .eq("session_id", session_id)\
        .order("created_at").execute()
    history = history_res.data or []

    # 3. Get patient context
    profile_res = supabase.table("patient_profiles")\
        .select("*, profiles(full_name, date_of_birth)")\
        .eq("id", user.id).single().execute()
    profile = profile_res.data or {}

    # Latest vitals
    vitals_res = supabase.table("vitals_logs")\
        .select("systolic_bp,diastolic_bp,blood_sugar_fasting,risk_level")\
        .eq("patient_id", user.id)\
        .order("logged_at", desc=True).limit(1).execute()
    latest_vitals = vitals_res.data[0] if vitals_res.data else {}

    # Today's wellness
    from datetime import date
    wellness_res = supabase.table("wellness_logs")\
        .select("mood_score")\
        .eq("patient_id", user.id)\
        .eq("log_date", str(date.today())).execute()
    today_mood = wellness_res.data[0]["mood_score"] if wellness_res.data else None

    # Build patient context
    from datetime import date as dt
    dob = profile.get("profiles", {}).get("date_of_birth")
    age = None
    if dob:
        birth = dt.fromisoformat(dob)
        age = (dt.today() - birth).days // 365

    patient_ctx = {
        "name": profile.get("profiles", {}).get("full_name", "").split()[0],
        "age": age,
        "conditions": profile.get("chronic_conditions", []),
        "mood_score": today_mood,
        "latest_bp": f"{latest_vitals.get('systolic_bp')}/{latest_vitals.get('diastolic_bp')}" if latest_vitals.get("systolic_bp") else None,
        "latest_sugar": latest_vitals.get("blood_sugar_fasting"),
        "risk_level": latest_vitals.get("risk_level"),
    }

    # 4. Run sentiment analysis on the message (quick, non-blocking)
    try:
        sentiment_res = await ai_complete(
            "quick_analysis",
            [{"role": "user", "content": SENTIMENT_PROMPT + req.message}]
        )
        sentiment = json.loads(sentiment_res)
    except Exception:
        sentiment = {"mood_score": 3, "crisis_detected": False, "health_flags": []}

    # 5. Save user message
    supabase.table("chat_messages").insert({
        "session_id": session_id,
        "role": "user",
        "content": req.message,
    }).execute()

    # 6. Build messages and stream response
    messages = build_nurse_messages(req.message, history, patient_ctx)

    async def stream_response():
        full_response = ""
        try:
            stream = await ai_complete("nurse_chat", messages, stream=True)
            async for token in stream:
                full_response += token
                yield f"data: {json.dumps({'token': token, 'session_id': session_id})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        # Save assistant message after streaming completes
        supabase.table("chat_messages").insert({
            "session_id": session_id,
            "role": "assistant",
            "content": full_response,
            "model_used": "llama-3.3-70b-versatile",
        }).execute()

        # Update session stats
        supabase.table("chat_sessions").update({
            "message_count": len(history) + 2,
            "mood_detected": sentiment.get("primary_emotion"),
            "health_flags": sentiment.get("health_flags", []),
        }).eq("id", session_id).execute()

        # If crisis detected, flag the patient
        if sentiment.get("crisis_detected"):
            supabase.table("vitals_logs").insert({
                "patient_id": user.id,
                "risk_level": "critical",
                "flagged": True,
                "ai_analysis": f"Crisis detected in chat: {req.message[:100]}",
            }).execute()

        yield f"data: {json.dumps({'done': True, 'session_id': session_id, 'sentiment': sentiment})}\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")


@router.post("/start-assessment")
async def start_assessment(user=Depends(get_current_user)):
    """Begin a structured health assessment conversation."""

    profile_res = supabase.table("patient_profiles")\
        .select("chronic_conditions")\
        .eq("id", user.id).single().execute()
    conditions = profile_res.data.get("chronic_conditions", []) if profile_res.data else []

    first_question = get_assessment_prompt(conditions, [])

    session_res = supabase.table("chat_sessions").insert({
        "patient_id": user.id,
        "session_type": "health_assessment",
        "title": "Weekly Health Assessment",
    }).execute()

    return {
        "success": True,
        "data": {
            "session_id": session_res.data[0]["id"],
            "question": first_question,
            "question_index": 0,
            "conditions": conditions,
        },
        "error": None,
    }


@router.post("/assessment-respond")
async def assessment_respond(req: AssessmentRequest, user=Depends(get_current_user)):
    """Submit answer to assessment question, get next question or final analysis."""

    profile_res = supabase.table("patient_profiles")\
        .select("chronic_conditions")\
        .eq("id", user.id).single().execute()
    conditions = profile_res.data.get("chronic_conditions", []) if profile_res.data else []

    # Get all previous Q&A
    history_res = supabase.table("chat_messages")\
        .select("role, content")\
        .eq("session_id", req.session_id)\
        .order("created_at").execute()
    history = history_res.data or []

    # Save this response
    prev_question = history[-1]["content"] if history else ""
    supabase.table("chat_messages").insert({
        "session_id": req.session_id,
        "role": "user",
        "content": req.response,
    }).execute()

    # Get next question
    responses_so_far = [m for m in history if m["role"] == "user"]
    next_question = get_assessment_prompt(conditions, responses_so_far + [req.response])

    if next_question:
        supabase.table("chat_messages").insert({
            "session_id": req.session_id,
            "role": "assistant",
            "content": next_question,
        }).execute()
        return {"success": True, "data": {"question": next_question, "done": False}, "error": None}

    # All questions answered — generate AI analysis
    qa_text = "\n".join([
        f"Q: {history[i]['content']}\nA: {history[i+1]['content']}"
        for i in range(0, len(history)-1, 2)
    ])

    analysis = await ai_complete(
        "nurse_chat",
        [
            {"role": "system", "content": "You are a health analyst. Summarize this patient health assessment. Be warm, specific, and constructive. Highlight what is good, what needs attention, and give 3 clear action items."},
            {"role": "user", "content": f"Patient assessment responses:\n{qa_text}"}
        ]
    )

    supabase.table("health_assessments").insert({
        "patient_id": user.id,
        "responses": [{"q": h["content"], "a": history[i+1]["content"]} for i, h in enumerate(history) if h["role"] == "assistant"],
        "ai_analysis": analysis,
    }).execute()

    supabase.table("chat_sessions").update({"ended_at": "now()", "summary": analysis[:200]}).eq("id", req.session_id).execute()

    return {"success": True, "data": {"analysis": analysis, "done": True}, "error": None}


@router.get("/recommendations")
async def get_recommendations(user=Depends(get_current_user)):
    """Generate personalized wellness recommendations based on patient data."""

    # Fetch all relevant patient data
    profile = supabase.table("patient_profiles").select("*").eq("id", user.id).single().execute().data or {}
    vitals = supabase.table("vitals_logs").select("*").eq("patient_id", user.id).order("logged_at", desc=True).limit(7).execute().data or []
    wellness = supabase.table("wellness_logs").select("*").eq("patient_id", user.id).order("log_date", desc=True).limit(7).execute().data or []
    med_logs = supabase.table("medicine_logs").select("status").eq("patient_id", user.id).order("created_at", desc=True).limit(20).execute().data or []

    # Calculate adherence
    taken = sum(1 for m in med_logs if m["status"] == "taken")
    adherence = round((taken / len(med_logs)) * 100) if med_logs else 0

    patient_data = f"""
Chronic conditions: {profile.get('chronic_conditions', [])}
Average mood (last 7 days): {sum(w.get('mood_score', 3) for w in wellness) / max(len(wellness), 1):.1f}/5
Average sleep: {sum(w.get('sleep_hours', 0) for w in wellness) / max(len(wellness), 1):.1f} hours
Average water: {sum(w.get('water_ml', 0) for w in wellness) / max(len(wellness), 1):.0f} ml/day
Exercise days this week: {sum(1 for w in wellness if w.get('exercise_minutes', 0) > 0)}
Medicine adherence: {adherence}%
Latest BP: {vitals[0].get('systolic_bp')}/{vitals[0].get('diastolic_bp')} if vitals else 'not logged'
Latest blood sugar: {vitals[0].get('blood_sugar_fasting')} if vitals else 'not logged'
Risk level: {vitals[0].get('risk_level', 'unknown') if vitals else 'unknown'}
"""

    import json as _json
    raw = await ai_complete(
        "deep_reasoning",
        [{"role": "user", "content": RECOMMENDATION_PROMPT.format(patient_data=patient_data)}]
    )

    try:
        clean = raw.strip().replace("```json", "").replace("```", "")
        recommendations = _json.loads(clean)
    except Exception:
        recommendations = []

    return {"success": True, "data": {"recommendations": recommendations}, "error": None}
```

---

## WF5 Part B — Frontend AI Nurse Chat Screen

### Chat Store
`apps/mobile/store/chatStore.ts`:
```typescript
import { create } from 'zustand';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sentiment?: {
    mood_score?: number;
    crisis_detected?: boolean;
    health_flags?: string[];
  };
}

interface ChatState {
  messages: Message[];
  sessionId: string | null;
  streaming: boolean;
  streamingContent: string;
  addMessage: (msg: Message) => void;
  setSessionId: (id: string) => void;
  setStreaming: (v: boolean) => void;
  appendStreamToken: (token: string) => void;
  commitStreamedMessage: () => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  streaming: false,
  streamingContent: '',

  addMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),
  setSessionId: (id) => set({ sessionId: id }),
  setStreaming: (v) => set({ streaming: v, streamingContent: v ? '' : get().streamingContent }),
  appendStreamToken: (token) => set(s => ({ streamingContent: s.streamingContent + token })),
  commitStreamedMessage: () => {
    const content = get().streamingContent;
    if (!content) return;
    set(s => ({
      messages: [...s.messages, {
        id: Date.now().toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
      }],
      streaming: false,
      streamingContent: '',
    }));
  },
  clearChat: () => set({ messages: [], sessionId: null }),
}));
```

### Chat Screen
`apps/mobile/app/(app)/nurse.tsx`:
```typescript
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function NurseScreen() {
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);
  const {
    messages, sessionId, streaming, streamingContent,
    addMessage, setSessionId, setStreaming, appendStreamToken, commitStreamedMessage
  } = useChatStore();
  const profile = useAuthStore(s => s.profile);

  const name = profile?.full_name?.split(' ')[0] || 'there';

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, streamingContent]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    addMessage({ id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() });
    setStreaming(true);

    try {
      const { data: { session } } = await import('../../lib/supabase').then(m => m.supabase.auth.getSession());
      const token = session?.access_token;

      const response = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) appendStreamToken(data.token);
            if (data.session_id && !sessionId) setSessionId(data.session_id);
            if (data.done) commitStreamedMessage();
            if (data.error) { setStreaming(false); Alert.alert('Error', data.error); }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: any) {
      setStreaming(false);
      Alert.alert('Connection Error', 'Could not reach Nova. Please check your connection.');
    }
  };

  const quickPrompts = [
    "How am I doing today?", "I forgot my medicine", "I have a headache", "Check my health"
  ];

  const renderMessage = ({ item }: { item: any }) => (
    <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
      {item.role === 'assistant' && (
        <View style={styles.avatarRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>N</Text></View>
          <Text style={styles.senderName}>Nova</Text>
        </View>
      )}
      <Text style={[styles.bubbleText, item.role === 'user' && styles.userBubbleText]}>
        {item.content}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.novaAvatar}><Text style={styles.novaAvatarText}>N</Text></View>
          <View>
            <Text style={styles.headerTitle}>Nova</Text>
            <Text style={styles.headerSub}>Your AI Health Companion</Text>
          </View>
        </View>
        <View style={styles.onlineDot} />
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyGreeting}>Hello, {name} 🌿</Text>
            <Text style={styles.emptyText}>I'm Nova, your personal health companion. How are you feeling today?</Text>
            <View style={styles.quickPromptGrid}>
              {quickPrompts.map(p => (
                <TouchableOpacity key={p} style={styles.quickPrompt} onPress={() => { setInput(p); }}>
                  <Text style={styles.quickPromptText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
      />

      {/* Streaming bubble */}
      {streaming && streamingContent && (
        <View style={[styles.bubble, styles.assistantBubble, styles.streamingBubble]}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>N</Text></View>
            <Text style={styles.senderName}>Nova</Text>
          </View>
          <Text style={styles.bubbleText}>{streamingContent}<Text style={styles.cursor}>▌</Text></Text>
        </View>
      )}
      {streaming && !streamingContent && (
        <View style={[styles.bubble, styles.assistantBubble]}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ask Nova anything about your health..."
          placeholderTextColor={Colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || streaming}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.disclaimer}>Nova provides health guidance only — not medical advice.</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 52, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  novaAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  novaAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.success },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: { marginBottom: 14, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primary, borderRadius: 18, borderBottomRightRadius: 4, padding: 14 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: Colors.card, borderRadius: 18, borderBottomLeftRadius: 4, padding: 14, borderWidth: 1, borderColor: Colors.border },
  streamingBubble: { opacity: 0.95 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  senderName: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  bubbleText: { fontSize: 15, color: Colors.text, lineHeight: 22 },
  userBubbleText: { color: '#fff' },
  cursor: { color: Colors.primary, fontWeight: '700' },
  emptyState: { paddingTop: 48, alignItems: 'center', paddingHorizontal: 20 },
  emptyGreeting: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  quickPromptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  quickPrompt: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  quickPromptText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  inputRow: { flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 8, backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: Colors.background, borderRadius: 22, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: Colors.text, maxHeight: 120 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
  disclaimer: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', paddingBottom: 8 },
});
```

---

## WF5 Done Checklist
- [ ] `services/ai/providers.py` — Groq + OpenRouter + Gemini clients with fallback
- [ ] `services/ai/prompts.py` — Nova system prompt, sentiment, assessment questions, recommendations
- [ ] `services/api/routers/ai_nurse.py` — /chat, /start-assessment, /assessment-respond, /recommendations
- [ ] Streaming SSE works end-to-end (test with curl first)
- [ ] Frontend `store/chatStore.ts` — message state, streaming state
- [ ] Frontend `app/(app)/nurse.tsx` — full chat UI with streaming bubbles
- [ ] Test: send "I have chest pain and shortness of breath" → verify crisis response
- [ ] Test: send "My BP is 182/110" → verify it gets flagged in vitals_logs
- [ ] Test: quick prompts work, session persists across messages
- [ ] Groq API key set in `.env` and tested
- [ ] OpenRouter API key set in `.env` and tested
- [ ] Google AI API key set in `.env` and tested

---

## PR Instructions
```bash
git add .
git commit -m "feat(phase2): AI nurse engine — Groq streaming chat + sentiment + assessments"
git push origin phase2/ai-engine
# PR: phase2/ai-engine → develop
# Tag: @Agent3 for review
```
