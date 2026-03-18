from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta
from dependencies import get_current_user, supabase
from services.ai.providers import ai_complete

router = APIRouter()


class VitalsEntry(BaseModel):
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    heart_rate: Optional[int] = None
    blood_sugar_fasting: Optional[float] = None
    blood_sugar_pp: Optional[float] = None
    spo2: Optional[int] = None
    temperature: Optional[float] = None
    weight_kg: Optional[float] = None


class WellnessEntry(BaseModel):
    mood_score: Optional[int] = None      # 1-5
    mood_note: Optional[str] = None
    sleep_hours: Optional[float] = None
    sleep_quality: Optional[int] = None   # 1-5
    steps_count: Optional[int] = None
    exercise_minutes: Optional[int] = None
    exercise_type: Optional[str] = None
    water_ml: Optional[int] = None
    meals_logged: Optional[list] = None   # [{meal, items, calories}]
    diet_score: Optional[int] = None      # 1-5


@router.post("/log")
async def log_vitals(entry: VitalsEntry, user=Depends(get_current_user)):
    """Log a vitals entry. DB trigger auto-flags critical values."""
    data = {k: v for k, v in entry.dict().items() if v is not None}
    data["patient_id"] = user.id

    # AI quick analysis
    vitals_text = ", ".join(f"{k}={v}" for k, v in data.items() if k != "patient_id")
    try:
        analysis = await ai_complete(
            "quick_analysis",
            [{"role": "user", "content": f"Briefly assess these vitals in 1 sentence (no diagnosis): {vitals_text}"}]
        )
        data["ai_analysis"] = analysis
    except Exception:
        pass

    res = supabase.table("vitals_logs").insert(data).execute()
    record = res.data[0]

    # If flagged as critical, notify doctor (real notification in Phase 4)
    if record.get("risk_level") in ("critical", "warning"):
        supabase.table("doctor_patient_links")\
            .select("doctor_id")\
            .eq("patient_id", user.id).eq("active", True)\
            .execute()
        # TODO: trigger push notification to doctor in Phase 4

    return {"success": True, "data": record, "error": None}


@router.post("/wellness")
async def log_wellness(entry: WellnessEntry, user=Depends(get_current_user)):
    """Log daily wellness (mood, sleep, activity, water, diet). One entry per day."""
    data = {k: v for k, v in entry.dict().items() if v is not None}
    data["patient_id"] = user.id
    data["log_date"] = str(date.today())

    # Check for existing entry today
    existing = supabase.table("wellness_logs")\
        .select("id").eq("patient_id", user.id).eq("log_date", data["log_date"]).execute()

    if existing.data:
        res = supabase.table("wellness_logs")\
            .update(data).eq("id", existing.data[0]["id"]).execute()
    else:
        res = supabase.table("wellness_logs").insert(data).execute()

    # Generate AI daily summary if mood + at least 2 other fields present
    record = res.data[0]
    filled = sum(1 for k in ["sleep_hours", "steps_count", "water_ml", "diet_score"] if data.get(k))
    if data.get("mood_score") and filled >= 2:
        try:
            summary_prompt = f"""In 1-2 warm, encouraging sentences, summarize this patient's day:
Mood: {data.get('mood_score')}/5 ({data.get('mood_note', 'no note')})
Sleep: {data.get('sleep_hours')}h (quality {data.get('sleep_quality')}/5)
Water: {data.get('water_ml')}ml
Steps: {data.get('steps_count')}
Exercise: {data.get('exercise_minutes')}min of {data.get('exercise_type','activity')}
Diet score: {data.get('diet_score')}/5
End with one specific tip for tomorrow."""

            summary = await ai_complete(
                "quick_analysis",
                [{"role": "user", "content": summary_prompt}]
            )
            supabase.table("wellness_logs").update({"ai_daily_summary": summary}).eq("id", record["id"]).execute()
            record["ai_daily_summary"] = summary
        except Exception:
            pass

    return {"success": True, "data": record, "error": None}


@router.get("/today")
async def get_today(user=Depends(get_current_user)):
    """Get today's vitals and wellness summary."""
    today = str(date.today())

    vitals = supabase.table("vitals_logs")\
        .select("*").eq("patient_id", user.id)\
        .order("logged_at", desc=True).limit(1).execute().data

    wellness = supabase.table("wellness_logs")\
        .select("*").eq("patient_id", user.id).eq("log_date", today).execute().data

    # Medicine adherence today
    med_logs = supabase.table("medicine_logs")\
        .select("status")\
        .eq("patient_id", user.id)\
        .gte("scheduled_time", f"{today}T00:00:00")\
        .lte("scheduled_time", f"{today}T23:59:59").execute().data or []

    taken = sum(1 for m in med_logs if m["status"] == "taken")
    total = len(med_logs)

    return {
        "success": True,
        "data": {
            "vitals": vitals[0] if vitals else None,
            "wellness": wellness[0] if wellness else None,
            "medicine_adherence": {"taken": taken, "total": total, "pct": round(taken/total*100) if total else 0},
        },
        "error": None,
    }


@router.get("/history")
async def get_history(days: int = 7, user=Depends(get_current_user)):
    """Get vitals and wellness history for past N days."""
    since = (datetime.now() - timedelta(days=days)).isoformat()

    vitals = supabase.table("vitals_logs")\
        .select("*").eq("patient_id", user.id)\
        .gte("logged_at", since)\
        .order("logged_at").execute().data or []

    wellness = supabase.table("wellness_logs")\
        .select("*").eq("patient_id", user.id)\
        .gte("log_date", (date.today() - timedelta(days=days)).isoformat())\
        .order("log_date").execute().data or []

    # Check for burnout pattern (3+ bad mood days)
    low_mood_streak = 0
    for w in sorted(wellness, key=lambda x: x["log_date"], reverse=True):
        if w.get("mood_score", 3) <= 2:
            low_mood_streak += 1
        else:
            break

    burnout_alert = low_mood_streak >= 3

    return {
        "success": True,
        "data": {"vitals": vitals, "wellness": wellness, "burnout_alert": burnout_alert},
        "error": None,
    }
