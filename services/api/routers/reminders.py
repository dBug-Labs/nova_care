from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timedelta
from dependencies import get_current_user, supabase

router = APIRouter()


class MedicineCreate(BaseModel):
    name: str
    dosage: str
    frequency: str
    schedule_times: List[str]   # ["08:00", "20:00"]
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    stock_count: int = 0
    stock_unit: str = "tablets"
    refill_alert_at: int = 5
    notes: Optional[str] = None


class MedicineIntakeLog(BaseModel):
    medicine_id: str
    status: str   # taken | missed | snoozed
    scheduled_time: str


class ReminderCreate(BaseModel):
    type: str         # water | walk | medicine | appointment | vitals | custom
    title: str
    message: Optional[str] = None
    schedule_time: str          # "HH:MM"
    days_of_week: List[int] = [1,2,3,4,5,6,7]
    expo_push_token: Optional[str] = None


class StockUpdate(BaseModel):
    medicine_id: str
    new_count: int


@router.post("/medicines")
async def add_medicine(req: MedicineCreate, user=Depends(get_current_user)):
    data = req.dict()
    data["patient_id"] = user.id
    data["start_date"] = data.get("start_date") or str(date.today())
    res = supabase.table("medicines").insert(data).execute()

    # Generate today's medicine log entries
    today = str(date.today())
    logs = []
    for t in req.schedule_times:
        logs.append({
            "medicine_id": res.data[0]["id"],
            "patient_id": user.id,
            "scheduled_time": f"{today}T{t}:00",
            "status": "missed",
        })
    if logs:
        supabase.table("medicine_logs").insert(logs).execute()

    return {"success": True, "data": res.data[0], "error": None}


@router.get("/medicines")
async def get_medicines(user=Depends(get_current_user)):
    res = supabase.table("medicines")\
        .select("*").eq("patient_id", user.id).eq("active", True)\
        .order("created_at").execute()

    medicines = res.data or []
    # Flag low stock
    for m in medicines:
        m["low_stock"] = m.get("stock_count", 0) <= m.get("refill_alert_at", 5)

    return {"success": True, "data": medicines, "error": None}


@router.post("/medicines/log-intake")
async def log_intake(req: MedicineIntakeLog, user=Depends(get_current_user)):
    """Mark a medicine as taken, missed, or snoozed."""
    res = supabase.table("medicine_logs").update({
        "status": req.status,
        "taken_at": datetime.utcnow().isoformat() if req.status == "taken" else None,
    }).eq("medicine_id", req.medicine_id)\
      .eq("scheduled_time", req.scheduled_time).execute()

    # If taken, deduct from stock
    if req.status == "taken":
        med = supabase.table("medicines").select("stock_count,refill_alert_at,name")\
            .eq("id", req.medicine_id).single().execute().data
        if med and med.get("stock_count", 0) > 0:
            new_count = med["stock_count"] - 1
            supabase.table("medicines").update({"stock_count": new_count}).eq("id", req.medicine_id).execute()
            # Send low stock alert if threshold reached
            if new_count <= med.get("refill_alert_at", 5):
                await send_push_notification(
                    user.id,
                    "💊 Medicine Running Low",
                    f"{med['name']} — only {new_count} {med.get('stock_unit','tablets')} left. Time to refill!",
                )

    return {"success": True, "data": {"status": req.status}, "error": None}


@router.patch("/medicines/stock")
async def update_stock(req: StockUpdate, user=Depends(get_current_user)):
    """Manually update medicine stock count after refill."""
    res = supabase.table("medicines")\
        .update({"stock_count": req.new_count})\
        .eq("id", req.medicine_id).eq("patient_id", user.id).execute()
    return {"success": True, "data": res.data[0] if res.data else None, "error": None}


@router.get("/medicines/today")
async def today_medicines(user=Depends(get_current_user)):
    """Get today's medicine schedule with intake status."""
    today = str(date.today())
    logs = supabase.table("medicine_logs")\
        .select("*, medicines(name, dosage, stock_count, refill_alert_at)")\
        .eq("patient_id", user.id)\
        .gte("scheduled_time", f"{today}T00:00:00")\
        .lte("scheduled_time", f"{today}T23:59:59")\
        .order("scheduled_time").execute().data or []

    return {"success": True, "data": logs, "error": None}


# ─── REMINDERS ───────────────────────────────

@router.post("/reminders")
async def create_reminder(req: ReminderCreate, user=Depends(get_current_user)):
    data = req.dict()
    data["patient_id"] = user.id
    res = supabase.table("reminders").insert(data).execute()
    return {"success": True, "data": res.data[0], "error": None}


@router.get("/reminders")
async def get_reminders(user=Depends(get_current_user)):
    res = supabase.table("reminders")\
        .select("*").eq("patient_id", user.id).eq("active", True)\
        .order("schedule_time").execute()
    return {"success": True, "data": res.data or [], "error": None}


@router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str, user=Depends(get_current_user)):
    supabase.table("reminders").update({"active": False})\
        .eq("id", reminder_id).eq("patient_id", user.id).execute()
    return {"success": True, "data": None, "error": None}


@router.post("/push-token")
async def save_push_token(token: str, user=Depends(get_current_user)):
    """Save Expo push token for notifications."""
    supabase.table("profiles").update({"expo_push_token": token}).eq("id", user.id).execute()
    return {"success": True, "data": None, "error": None}


# ─── PUSH NOTIFICATION HELPER ─────────────────

async def send_push_notification(user_id: str, title: str, body: str, data: dict = {}):
    """Send Expo push notification to a user."""
    import httpx
    profile = supabase.table("profiles").select("expo_push_token").eq("id", user_id).single().execute().data
    token = profile.get("expo_push_token") if profile else None
    if not token:
        return

    payload = {"to": token, "title": title, "body": body, "data": data, "sound": "default"}
    async with httpx.AsyncClient() as client:
        await client.post("https://exp.host/--/api/v2/push/send", json=payload)
