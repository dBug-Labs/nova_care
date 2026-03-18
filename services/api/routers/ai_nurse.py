from fastapi import APIRouter, Depends, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from dependencies import get_current_user, supabase
from services.ai.providers import ai_complete, ai_transcribe
from services.ai.prompts import build_nurse_messages, get_assessment_prompt, RECOMMENDATION_PROMPT
import uuid
import json

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

@router.post("/chat")
async def chat(req: ChatRequest, user=Depends(get_current_user)):
    session_id = req.session_id or str(uuid.uuid4())
    user_msg = req.message

    session_valid = True
    try:
        supabase.table("chat_sessions").insert({
            "id": session_id,
            "patient_id": user["id"],
            "session_type": "general"
        }).execute()
    except Exception as e:
        err_str = str(e)
        if "duplicate" not in err_str.lower() and "already exists" not in err_str.lower():
            session_valid = False
            print("Notice: Chat session not saved (User may not be a patient). Chat history will be disabled.")

    # Save user message
    if session_valid:
        try:
            supabase.table("chat_messages").insert({
                "session_id": session_id,
                "role": "user",
                "content": user_msg
            }).execute()
        except Exception as e:
            print("Error saving user message:", e)

    messages = build_nurse_messages(user_msg, [], {})
    
    async def event_stream():
        full_reply = ""
        try:
            generator = await ai_complete("nurse_chat", messages, stream=True)
            async for chunk in generator:
                full_reply += chunk
                data = json.dumps({"token": chunk, "session_id": session_id})
                yield f"data: {data}\n\n"
        except Exception as e:
            err_msg = "[AI ERROR: " + str(e) + "]"
            full_reply += err_msg
            yield f"data: {json.dumps({'token': err_msg, 'session_id': session_id})}\n\n"
        
        # Save assistant message
        if session_valid:
            try:
                supabase.table("chat_messages").insert({
                    "session_id": session_id,
                    "role": "assistant",
                    "content": full_reply
                }).execute()
            except Exception as e:
                print("Error saving assistant message:", str(e))

    return StreamingResponse(event_stream(), media_type="text/event-stream")

@router.post("/start-assessment")
async def start_assessment(user=Depends(get_current_user)):
    session_id = str(uuid.uuid4())
    q = get_assessment_prompt([], [])
    return {"success": True, "data": {"question": q, "session_id": session_id}}

class AssessRequest(BaseModel):
    response: str
    session_id: str
    question_index: int

@router.post("/assessment-respond")
async def assessment_respond(req: AssessRequest, user=Depends(get_current_user)):
    responses = [""] * (req.question_index + 1)
    q = get_assessment_prompt([], responses)
    return {"success": True, "data": {"question": q}}

@router.get("/recommendations")
async def recommendations(user=Depends(get_current_user)):
    try:
        prompt = RECOMMENDATION_PROMPT.format(patient_data=f"Patient ID: {user['id']}")
        res = await ai_complete("quick_analysis", [{"role": "user", "content": prompt}], stream=False)
        clean = res.strip().replace("```json", "").replace("```", "")
        recs = json.loads(clean)
    except Exception as e:
        print(f"Error in recommendations: {e}")
        recs = [{"title": "Drink Water", "description": "Stay hydrated", "type": "lifestyle", "priority": "medium"}]
    return {"success": True, "data": {"recommendations": recs}}

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...), user=Depends(get_current_user)):
    try:
        audio_bytes = await file.read()
        text = await ai_transcribe(audio_bytes, file.filename or "audio.m4a")
        return {"success": True, "text": text}
    except Exception as e:
        print("Transcription error:", e)
        return {"success": False, "error": str(e)}

