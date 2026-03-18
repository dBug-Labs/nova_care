import httpx, asyncio, json, os
from pathlib import Path
from datetime import date
from dotenv import load_dotenv

load_dotenv(Path("services/api/.env"))
API = "http://localhost:8000"
SB_URL  = os.getenv("SUPABASE_URL","")
SB_ANON = os.getenv("SUPABASE_ANON_KEY", os.getenv("SUPABASE_SERVICE_KEY",""))

try:
    STATE = json.loads(Path("test_state.json").read_text(encoding="utf-8"))
except:
    print("[FAIL] - No test_state.json - run T2 first"); exit(1)

PAT_TOKEN = STATE.get("pat_token","")
PAT_ID    = STATE.get("pat_id","")
results   = []

def chk(name, ok, detail=""):
    icon = "[PASS]" if ok else "[FAIL]"
    print(f"  {icon} - {name}" + (f": {detail}" if detail else ""))
    results.append({"name": name, "ok": ok, "detail": detail})

async def post(path, data, token=None):
    h = {}
    if token: h["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=30) as c:
        return await c.post(f"{API}{path}", json=data, headers=h)

async def get(path, token=None):
    h = {}
    if token: h["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=20) as c:
        return await c.get(f"{API}{path}", headers=h)

async def patch(path, data, token=None):
    h = {"Content-Type":"application/json"}
    if token: h["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=20) as c:
        return await c.patch(f"{API}{path}", json=data, headers=h)

async def run():
    if not PAT_TOKEN:
        print("[FAIL] - No patient token"); return

    # ── WF7: Log normal vitals ────────────────────────────────────────
    try:
        r = await post("/vitals/log", {
            "systolic_bp":118,"diastolic_bp":76,"heart_rate":72,
            "blood_sugar_fasting":105,"spo2":98,"weight_kg":78.5,"temperature":98.4
        }, PAT_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        d  = r.json().get("data",{}) if ok else {}
        chk("WF7 - Log normal vitals (all 7 fields)", ok,
            f"risk={d.get('risk_level')}, ai_analysis={'set' if d.get('ai_analysis') else 'missing'}")
    except Exception as e:
        chk("WF7 - Log normal vitals", False, str(e))

    # ── WF7: Log CRITICAL vitals -> auto-flag via trigger ─────────────
    try:
        r = await post("/vitals/log", {
            "systolic_bp":188,"diastolic_bp":118,"blood_sugar_fasting":330,"spo2":91
        }, PAT_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        d  = r.json().get("data",{}) if ok else {}
        flagged = d.get("flagged",False)
        risk    = d.get("risk_level","")
        chk("WF7 - Critical vitals auto-flagged (trigger)", ok and flagged and risk=="critical",
            f"risk={risk}, flagged={flagged}" + (" - check migration 007 trigger!" if not (flagged and risk=="critical") else ""))
    except Exception as e:
        chk("WF7 - Critical vitals trigger", False, str(e))

    # ── WF7: Log wellness ─────────────────────────────────────────────
    try:
        r = await post("/vitals/wellness", {
            "mood_score":4,"mood_note":"Feeling better after morning walk",
            "sleep_hours":7.5,"sleep_quality":4,
            "steps_count":8200,"exercise_minutes":35,"exercise_type":"walking",
            "water_ml":2200,
            "meals_logged":[
                {"meal":"breakfast","items":["oats","banana"],"calories":320},
                {"meal":"lunch","items":["dal","roti","sabzi"],"calories":480}
            ],
            "diet_score":4
        }, PAT_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        d  = r.json().get("data",{}) if ok else {}
        chk("WF7 - Log wellness (mood+sleep+water+exercise+diet)", ok,
            f"log_date={d.get('log_date')}, ai_summary={'set' if d.get('ai_daily_summary') else 'generating...'}")
    except Exception as e:
        chk("WF7 - Log wellness", False, str(e))

    # Wait a moment for AI summary
    await asyncio.sleep(3)

    # ── WF7: Today's summary ──────────────────────────────────────────
    try:
        r = await get("/vitals/today", PAT_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        d  = r.json().get("data",{}) if ok else {}
        has_v = d.get("vitals") is not None
        has_w = d.get("wellness") is not None
        has_m = "medicine_adherence" in d
        chk("WF7 - Today summary endpoint", ok and has_v and has_w,
            f"vitals={'Y' if has_v else 'N'} wellness={'Y' if has_w else 'N'} adherence={'Y' if has_m else 'N'}")
        if has_w and d["wellness"].get("ai_daily_summary"):
            chk("WF7 - AI daily summary generated", True,
                f"'{d['wellness']['ai_daily_summary'][:60]}...'")
        else:
            chk("WF7 - AI daily summary generated", False, "ai_daily_summary missing - check wellness route AI call")
    except Exception as e:
        chk("WF7 - Today summary", False, str(e))

    # ── WF7: 7-day history + burnout detection ────────────────────────
    try:
        r = await get("/vitals/history?days=7", PAT_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        d  = r.json().get("data",{}) if ok else {}
        vc = len(d.get("vitals",[]))
        wc = len(d.get("wellness",[]))
        burnout_key = "burnout_alert" in d
        chk("WF7 - 7-day history endpoint", ok,
            f"vitals={vc}, wellness={wc}, burnout_alert_field={'Y' if burnout_key else 'N'}")
    except Exception as e:
        chk("WF7 - 7-day history", False, str(e))

    # ── WF8: Add medicine ─────────────────────────────────────────────
    med_id = None
    try:
        r = await post("/reminders/medicines", {
            "name":"Metformin","dosage":"500mg","frequency":"Twice daily",
            "schedule_times":["08:00","20:00"],
            "stock_count":28,"stock_unit":"tablets","refill_alert_at":7,
            "notes":"Take with food"
        }, PAT_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        med_id = r.json().get("data",{}).get("id","") if ok else ""
        chk("WF8 - Add medicine (Metformin 500mg)", ok,
            f"id={med_id[:12] if med_id else 'none'}...")
    except Exception as e:
        chk("WF8 - Add medicine", False, str(e))

    # WF8: Get medicines list
    try:
        r = await get("/reminders/medicines", PAT_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        meds = r.json().get("data",[]) if ok else []
        chk("WF8 - Get medicines list", ok, f"{len(meds)} medicine(s)")
    except Exception as e:
        chk("WF8 - Medicines list", False, str(e))

    # WF8: Today's schedule
    try:
        r = await get("/reminders/medicines/today", PAT_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        schedule = r.json().get("data",[]) if ok else []
        chk("WF8 - Today's medicine schedule", ok, f"{len(schedule)} dose(s) scheduled")
    except Exception as e:
        chk("WF8 - Today schedule", False, str(e))

    # WF8: Log intake (taken) -> stock deducts
    if med_id:
        scheduled_time = f"{date.today()}T08:00:00"
        try:
            r = await post("/reminders/medicines/log-intake", {
                "medicine_id":med_id,"status":"taken","scheduled_time":scheduled_time
            }, PAT_TOKEN)
            ok = r.status_code==200 and r.json().get("success")
            chk("WF8 - Log medicine intake (taken)", ok, f"status={r.status_code}")

            # Verify stock decreased
            if ok:
                r2 = await get("/reminders/medicines", PAT_TOKEN)
                meds = r2.json().get("data",[])
                metformin = next((m for m in meds if m.get("name")=="Metformin"), None)
                if metformin:
                    stock = metformin.get("stock_count",28)
                    chk("WF8 - Stock auto-deducted after intake", stock == 27,
                        f"stock={stock} (expected 27)" + (" - check log_intake route stock deduction logic" if stock != 27 else ""))
                else:
                    chk("WF8 - Stock auto-deducted", False, "Metformin not found in medicines list")
        except Exception as e:
            chk("WF8 - Log intake", False, str(e))

    # WF8: Low stock detection
    try:
        r = await post("/reminders/medicines", {
            "name":"Amlodipine","dosage":"5mg","frequency":"Once daily",
            "schedule_times":["09:00"],"stock_count":3,"refill_alert_at":5
        }, PAT_TOKEN)
        r2 = await get("/reminders/medicines", PAT_TOKEN)
        meds = r2.json().get("data",[])
        amlod = next((m for m in meds if m.get("name")=="Amlodipine"), None)
        low = amlod.get("low_stock", False) if amlod else False
        chk("WF8 - Low stock flag (stock=3, alert_at=5)", low,
            f"low_stock={low}" + (" - check 'low_stock' field in GET /medicines response" if not low else ""))
    except Exception as e:
        chk("WF8 - Low stock detection", False, str(e))

    # WF8: Create reminder
    try:
        r = await post("/reminders/reminders", {
            "type":"water","title":"Drink Water! ",
            "message":"Stay hydrated","schedule_time":"10:00",
            "days_of_week":[1,2,3,4,5,6,7]
        }, PAT_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        chk("WF8 - Create water reminder", ok)
    except Exception as e:
        chk("WF8 - Create reminder", False, str(e))

    # WF8: Get reminders
    try:
        r = await get("/reminders/reminders", PAT_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        rems = r.json().get("data",[]) if ok else []
        chk("WF8 - Get reminders list", ok, f"{len(rems)} reminder(s)")
    except Exception as e:
        chk("WF8 - Get reminders", False, str(e))

    # WF8: Stock refill (manual update)
    if med_id:
        try:
            r = await patch("/reminders/medicines/stock",
                {"medicine_id":med_id,"new_count":60}, PAT_TOKEN)
            ok = r.status_code==200 and r.json().get("success")
            chk("WF8 - Manual stock refill (-> 60 tablets)", ok,
                f"status={r.status_code}")
        except Exception as e:
            chk("WF8 - Stock refill", False, str(e))

    # Save state
    STATE["med_id"] = med_id or ""
    with open("test_state.json","w", encoding="utf-8") as f:
        json.dump(STATE, f)

    p = sum(1 for r in results if r["ok"])
    t = len(results)
    print(f"\n  SCORE: {p}/{t} passed ({int(p/t*100) if t else 0}%)")
    with open("test_out_t4.json","w", encoding="utf-8") as f:
        json.dump({"score": f"{p}/{t}", "results": results}, f, indent=2)

asyncio.run(run())
