"""
Background scheduler — runs every minute to fire reminders.
Start with: python scheduler.py
Or integrate with Railway cron.
"""
import asyncio
from datetime import datetime, date
from supabase import create_client
from config import settings
import httpx

supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

WEEKDAY_MAP = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7}  # Python weekday → our 1-7


async def send_push(token: str, title: str, body: str):
    async with httpx.AsyncClient() as client:
        await client.post("https://exp.host/--/api/v2/push/send", json={
            "to": token, "title": title, "body": body, "sound": "default"
        })


async def fire_due_reminders():
    now = datetime.utcnow()
    current_time = now.strftime("%H:%M")
    current_day = WEEKDAY_MAP[now.weekday()]

    # Fetch all active reminders due now
    reminders = supabase.table("reminders")\
        .select("*, profiles(expo_push_token)")\
        .eq("active", True)\
        .eq("schedule_time", current_time)\
        .execute().data or []

    for r in reminders:
        if current_day not in (r.get("days_of_week") or []):
            continue
        token = (r.get("profiles") or {}).get("expo_push_token")
        if token:
            await send_push(token, r["title"], r.get("message", "Time for your health routine!"))

    # Medicine reminders — check today's schedule
    today = str(date.today())
    pending_meds = supabase.table("medicine_logs")\
        .select("*, medicines(name, dosage), profiles!medicine_logs_patient_id_fkey(expo_push_token)")\
        .eq("status", "missed")\
        .eq("scheduled_time", f"{today}T{current_time}:00")\
        .execute().data or []

    for log in pending_meds:
        med = log.get("medicines", {})
        profile = log.get("profiles", {})
        token = profile.get("expo_push_token") if profile else None
        if token:
            await send_push(
                token,
                f"💊 Medicine Reminder",
                f"Time to take {med.get('name', 'your medicine')} — {med.get('dosage', '')}"
            )

    print(f"[{current_time}] Fired {len(reminders)} reminders, {len(pending_meds)} medicine alerts")


async def main():
    print("🔔 NovaCare notification scheduler started")
    while True:
        await fire_due_reminders()
        await asyncio.sleep(60)  # Check every minute

if __name__ == "__main__":
    asyncio.run(main())
