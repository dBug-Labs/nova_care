import httpx, asyncio, json, os, time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("services/api/.env"))

SB_URL  = os.getenv("SUPABASE_URL","")
SB_ANON = os.getenv("SUPABASE_ANON_KEY", os.getenv("SUPABASE_SERVICE_KEY",""))
API = "http://localhost:8000"

# Use timestamps to ensure unique emails every run
TIMESTAMP = int(time.time())
PAT_EMAIL = f"patient_{TIMESTAMP}@test.novacare"
DOC_EMAIL = f"doctor_{TIMESTAMP}@test.novacare"
STATE   = {}
results = []

def chk(name, ok, detail=""):
    icon = "[PASS]" if ok else "[FAIL]"
    msg = f"{icon} - {name}" + (f": {detail}" if detail else "")
    print("  " + msg)
    results.append({"name": name, "ok": ok, "detail": detail})

async def sb_get(path, token):
    async with httpx.AsyncClient(timeout=10) as c:
        return await c.get(f"{SB_URL}/rest/v1/{path}",
            headers={"apikey":SB_ANON,"Authorization":f"Bearer {token}"})

async def sb_patch(path, token, data):
    async with httpx.AsyncClient(timeout=10) as c:
        return await c.patch(f"{SB_URL}/rest/v1/{path}",
            headers={"apikey":SB_ANON,"Authorization":f"Bearer {token}",
                     "Content-Type":"application/json","Prefer":"return=representation"},
            json=data)

async def api_post(path, data=None, token=None):
    headers = {}
    if token: headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=20) as c:
        return await c.post(f"{API}{path}", json=data, headers=headers)

async def sb_signin(email, password):
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{SB_URL}/auth/v1/token?grant_type=password",
            headers={"apikey":SB_ANON,"Content-Type":"application/json"},
            json={"email":email,"password":password})
    return r

async def run():
    # ── WF1: main.py imports all routers ─────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{API}/openapi.json")
        paths = list(r.json().get("paths",{}).keys())
        routers = {
            "auth":    any("/auth/" in p for p in paths),
            "vitals":  any("/vitals/" in p for p in paths),
            "ai_nurse":any("/ai/" in p for p in paths),
            "labs":    any("/labs/" in p for p in paths),
            "reminders":any("/reminders/" in p for p in paths),
            "doctors": any("/doctors/" in p for p in paths),
            "reports": any("/reports-export/" in p for p in paths),
        }
        missing = [k for k,v in routers.items() if not v]
        chk("WF1 - All 7 routers registered in main.py", not missing,
            f"Missing routers: {missing}" if missing else "auth,vitals,ai,labs,reminders,doctors,reports OK")
    except Exception as e:
        chk("WF1 - Routers check", False, str(e))

    # ── WF3: Patient signup ───────────────────────────────────────────
    try:
        r = await api_post("/auth/signup", {
            "email":PAT_EMAIL,"password":"Test@1234",
            "full_name":"Ramesh Kumar Test","role":"patient","phone":"9876543210"
        })
        ok = r.status_code == 200 and r.json().get("success")
        chk("WF3 - Patient /auth/signup", ok,
            f"status={r.status_code}" + (f" error={r.text[:100]}" if not ok else " created"))
    except Exception as e:
        chk("WF3 - Patient signup", False, str(e))

    # WF3: Patient signin
    try:
        r = await sb_signin(PAT_EMAIL, "Test@1234")
        ok = r.status_code == 200
        if ok:
            STATE["pat_token"] = r.json()["access_token"]
            STATE["pat_id"]    = r.json()["user"]["id"]
        chk("WF3 - Patient signin + JWT", ok,
            f"id={STATE.get('pat_id','')[:12]}..." if ok else r.text[:100])
    except Exception as e:
        chk("WF3 - Patient signin", False, str(e))

    # ── WF2: Auto BMI trigger ─────────────────────────────────────────
    if STATE.get("pat_token"):
        try:
            # Update height & weight
            r = await sb_patch(
                f"patient_profiles?id=eq.{STATE['pat_id']}",
                STATE["pat_token"],
                {"height_cm": 170, "weight_kg": 80}
            )
            await asyncio.sleep(1)
            # Read back BMI
            r2 = await sb_get(f"patient_profiles?id=eq.{STATE['pat_id']}&select=bmi", STATE["pat_token"])
            rows = r2.json()
            bmi = rows[0].get("bmi") if rows else None
            expected = round(80 / (1.70**2), 2)  # 27.68
            ok = bmi is not None and abs(float(bmi) - expected) < 0.5
            chk("WF2 - Auto BMI trigger (height=170,weight=80->BMI 27.7)", ok,
                f"got bmi={bmi}, expected={expected}" + (" - check migration 007 trigger" if not ok else ""))
        except Exception as e:
            chk("WF2 - Auto BMI trigger", False, str(e))

    # ── WF2: Auto critical vitals flag trigger ────────────────────────
    if STATE.get("pat_token") and STATE.get("pat_id"):
        try:
            # Insert a critical vitals entry directly
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.post(f"{SB_URL}/rest/v1/vitals_logs",
                    headers={"apikey":SB_ANON,"Authorization":f"Bearer {STATE['pat_token']}",
                             "Content-Type":"application/json","Prefer":"return=representation"},
                    json={"patient_id":STATE["pat_id"],"systolic_bp":190,"diastolic_bp":120,"blood_sugar_fasting":350})
            rows = r.json()
            if rows and isinstance(rows, list):
                row = rows[0]
                flagged    = row.get("flagged", False)
                risk_level = row.get("risk_level", "normal")
                ok = flagged and risk_level == "critical"
                chk("WF2 - Auto critical vitals flag trigger (BP=190/120, sugar=350)", ok,
                    f"flagged={flagged}, risk={risk_level}" + (" - check migration 007 trigger" if not ok else ""))
            else:
                chk("WF2 - Auto critical vitals flag trigger", False, f"response={r.text[:100]}")
        except Exception as e:
            chk("WF2 - Auto vitals flag trigger", False, str(e))

    # ── WF4: Patient onboarding profile ──────────────────────────────
    if STATE.get("pat_token") and STATE.get("pat_id"):
        try:
            r = await sb_patch(
                f"patient_profiles?id=eq.{STATE['pat_id']}",
                STATE["pat_token"],
                {"blood_group":"B+","chronic_conditions":["diabetes_type2","hypertension"],
                 "allergies":["penicillin"],"emergency_contact_name":"Wife Test",
                 "emergency_contact_phone":"9000000000"}
            )
            ok = r.status_code in (200, 204)
            chk("WF4 - Patient onboarding (conditions, blood group, allergies)", ok,
                f"status={r.status_code}" + (" - RLS policy blocking update" if not ok else ""))

            # Mark onboarding complete
            r2 = await sb_patch(f"profiles?id=eq.{STATE['pat_id']}",
                                  STATE["pat_token"], {"onboarding_complete": True})
            chk("WF4 - Mark onboarding_complete=true", r2.status_code in (200,204))
        except Exception as e:
            chk("WF4 - Patient onboarding", False, str(e))

    # ── WF3 & WF4: Doctor signup + profile ───────────────────────────
    try:
        r = await api_post("/auth/signup", {
            "email":DOC_EMAIL,"password":"Test@1234",
            "full_name":"Dr. Sharma Test","role":"doctor"
        })
        ok = r.status_code == 200 and r.json().get("success")
        chk("WF3 - Doctor /auth/signup", ok, f"status={r.status_code}")
    except Exception as e:
        chk("WF3 - Doctor signup", False, str(e))

    try:
        r = await sb_signin(DOC_EMAIL, "Test@1234")
        ok = r.status_code == 200
        if ok:
            STATE["doc_token"] = r.json()["access_token"]
            STATE["doc_id"]    = r.json()["user"]["id"]
        chk("WF3 - Doctor signin + JWT", ok,
            f"id={STATE.get('doc_id','')[:12]}..." if ok else r.text[:80])
    except Exception as e:
        chk("WF3 - Doctor signin", False, str(e))

    if STATE.get("doc_token") and STATE.get("doc_id"):
        try:
            r = await sb_patch(
                f"doctor_profiles?id=eq.{STATE['doc_id']}",
                STATE["doc_token"],
                {"specialty":"cardiology","registration_number":f"REG{TIMESTAMP}","hospital_name":"City Hospital"}
            )
            chk("WF4 - Doctor profile (specialty, reg number)", r.status_code in (200,204))
        except Exception as e:
            chk("WF4 - Doctor profile update", False, str(e))

    # ── RLS: patient cannot read another patient's profile ───────────
    if STATE.get("pat_token") and STATE.get("doc_id"):
        try:
            r = await sb_get(f"patient_profiles?id=eq.{STATE['doc_id']}&select=id", STATE["pat_token"])
            rows = r.json()
            # Should return empty — RLS blocks cross-patient reads
            chk("WF2 - RLS: patient cannot read other patient profile", rows == [] or r.status_code==401,
                f"Returned {len(rows) if isinstance(rows,list) else '?'} rows - should be 0 (RLS working)")
        except Exception as e:
            chk("WF2 - RLS check", False, str(e))

    # Save state for next test
    with open("test_state.json","w", encoding="utf-8") as f:
        json.dump({
            "pat_token":STATE.get("pat_token",""),
            "pat_id":STATE.get("pat_id",""),
            "doc_token":STATE.get("doc_token",""),
            "doc_id":STATE.get("doc_id","")
        }, f)

    p = sum(1 for r in results if r["ok"])
    t = len(results)
    print(f"\n  SCORE: {p}/{t} passed ({int(p/t*100) if t else 0}%)")
    with open("test_out_t2.json","w", encoding="utf-8") as f:
        json.dump({"score": f"{p}/{t}", "results": results}, f, indent=2)

asyncio.run(run())
