import httpx, asyncio, json, os, time, io
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("services/api/.env"))
API = "http://localhost:8000"

# Load state from T2
try:
    STATE = json.loads(Path("test_state.json").read_text(encoding="utf-8"))
except:
    print("[FAIL] - No test_state.json - run T2 first")
    exit(1)

PAT_TOKEN = STATE.get("pat_token","")
PAT_ID    = STATE.get("pat_id","")
results   = []

def chk(name, ok, detail=""):
    icon = "[PASS]" if ok else "[FAIL]"
    msg = f"{icon} - {name}" + (f": {detail}" if detail else "")
    print("  " + msg)
    results.append({"name": name, "ok": ok, "detail": detail})

async def api_post(path, data=None, token=None):
    headers = {}
    if token: headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=45) as c:
        return await c.post(f"{API}{path}", json=data, headers=headers)

async def api_get(path, token=None):
    headers = {}
    if token: headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=30) as c:
        return await c.get(f"{API}{path}", headers=headers)

async def run():
    if not PAT_TOKEN:
        print("[FAIL] - No patient token - run T2 first")
        return

    # ── WF5: Nova streaming chat ──────────────────────────────────────
    session_id = None
    try:
        async with httpx.AsyncClient(timeout=45) as c:
            r = await c.post(f"{API}/ai/chat",
                headers={"Authorization":f"Bearer {PAT_TOKEN}","Content-Type":"application/json"},
                json={"message":"Hello Nova, I feel a bit tired today. My BP was 148/92 this morning."})

        ok = r.status_code == 200
        content = r.text
        has_tokens = "token" in content or "data:" in content
        # Extract session_id
        for line in content.split("\n"):
            if line.startswith("data:"):
                try:
                    chunk = json.loads(line[5:].strip())
                    if chunk.get("session_id"): session_id = chunk["session_id"]
                except: pass
        chk("WF5 - Nova streaming chat (SSE)", ok and has_tokens,
            f"session_id={session_id[:12] if session_id else 'not found'}... response_len={len(content)}")
    except Exception as e:
        chk("WF5 - Nova streaming chat", False, str(e))

    # ── WF5: Verify chat saved to DB ─────────────────────────────────
    if session_id:
        try:
            SB_URL  = os.getenv("SUPABASE_URL","")
            SB_ANON = os.getenv("SUPABASE_ANON_KEY", os.getenv("SUPABASE_SERVICE_KEY",""))
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(f"{SB_URL}/rest/v1/chat_messages?session_id=eq.{session_id}&select=role,content",
                    headers={"apikey":SB_ANON,"Authorization":f"Bearer {PAT_TOKEN}"})
            msgs = r.json()
            has_user = any(m.get("role")=="user" for m in msgs)
            has_asst = any(m.get("role")=="assistant" for m in msgs)
            chk("WF5 - Chat messages saved to DB", has_user and has_asst,
                f"{len(msgs)} messages (user={'Y' if has_user else 'N'}, assistant={'Y' if has_asst else 'N'})")
        except Exception as e:
            chk("WF5 - Chat saved to DB", False, str(e))

    # ── WF5: Crisis detection ─────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=45) as c:
            r = await c.post(f"{API}/ai/chat",
                headers={"Authorization":f"Bearer {PAT_TOKEN}","Content-Type":"application/json"},
                json={"message":"I have severe chest pain and I cannot breathe at all, feeling very dizzy"})

        content = r.text.lower()
        full_reply = ""
        for line in content.split("\n"):
            if line.startswith("data:"):
                try:
                    chunk = json.loads(line[5:].strip())
                    full_reply += chunk.get("token","")
                except: pass

        crisis_words = ["112","emergency","urgent","immediately","call","hospital","ambulance"]
        triggered = any(w in full_reply.lower() for w in crisis_words)
        chk("WF5 - Crisis detection (chest pain -> emergency response)", triggered,
            f"Response snippet: '{full_reply[:100]}...'" if full_reply else "No response content found")
    except Exception as e:
        chk("WF5 - Crisis detection", False, str(e))

    # ── WF5: Health assessment ────────────────────────────────────────
    try:
        r = await api_post("/ai/start-assessment", token=PAT_TOKEN)
        ok = r.status_code == 200 and r.json().get("success")
        question = r.json().get("data",{}).get("question","") if ok else ""
        asmt_session = r.json().get("data",{}).get("session_id","") if ok else ""
        chk("WF5 - Start health assessment", ok and bool(question),
            f"First question: '{question[:60]}...'" if question else "No question returned")
    except Exception as e:
        chk("WF5 - Health assessment", False, str(e))

    # WF5: Submit one assessment answer
    try:
        if 'asmt_session' in locals() and asmt_session:
            r = await api_post("/ai/assessment-respond",
                {"response":"I feel about 6 out of 10. A bit tired but managing.","session_id":asmt_session,"question_index":0},
                token=PAT_TOKEN)
            ok = r.status_code == 200 and r.json().get("success")
            next_q = r.json().get("data",{}).get("question","") if ok else ""
            chk("WF5 - Assessment respond -> next question", ok and bool(next_q),
                f"Next Q: '{next_q[:60]}...'" if next_q else str(r.text[:80]))
    except Exception as e:
        chk("WF5 - Assessment respond", False, str(e))

    # ── WF5: AI recommendations ───────────────────────────────────────
    try:
        r = await api_get("/ai/recommendations", token=PAT_TOKEN)
        ok = r.status_code == 200 and r.json().get("success")
        recs = r.json().get("data",{}).get("recommendations",[]) if ok else []
        chk("WF5 - AI recommendations endpoint", ok and len(recs) >= 1,
            f"{len(recs)} recs -> '{recs[0].get('title','') if recs else 'none'}'" )
        if recs:
            has_type = all(r.get("type") for r in recs)
            has_priority = all(r.get("priority") for r in recs)
            chk("WF5 - Recommendation fields (type, priority)", has_type and has_priority,
                f"types={[r.get('type') for r in recs]}")
    except Exception as e:
        chk("WF5 - AI recommendations", False, str(e))

    # ── WF6: Lab report upload ────────────────────────────────────────
    report_id = None
    try:
        lab_content = b"""BLOOD TEST REPORT
Patient: Ramesh Kumar Test
Date: 2026-03-18

Hemoglobin: 11.2 g/dL    (Ref: 12.0-17.0) LOW
WBC: 7.5 K/uL
Platelets: 215 K/uL
Blood Glucose Fasting: 185 mg/dL   (Ref: 70-99) HIGH
HbA1c: 8.2 %   (Ref: 4.0-5.6) HIGH
Total Cholesterol: 210 mg/dL   (Ref: <200) BORDERLINE
HDL: 38 mg/dL   (Ref: >40) LOW
LDL: 132 mg/dL  (Ref: <100) HIGH
TSH: 3.1 uIU/mL (Ref: 0.4-4.0) Normal
Vitamin D: 18 ng/mL  (Ref: 30-100) LOW
Vitamin B12: 285 pg/mL
Creatinine: 0.9 mg/dL"""

        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{API}/labs/upload",
                headers={"Authorization":f"Bearer {PAT_TOKEN}"},
                data={"report_type":"blood_test","report_date":"2026-03-18"},
                files={"file":("blood_test.txt", lab_content, "text/plain")})

        ok = r.status_code == 200 and r.json().get("success")
        report_id = r.json().get("data",{}).get("report_id","") if ok else ""
        chk("WF6 - Lab report upload", ok,
            f"report_id={report_id[:12] if report_id else 'none'}...")
    except Exception as e:
        chk("WF6 - Lab report upload", False, str(e))

    # WF6: Get reports list
    try:
        r = await api_get("/labs/", token=PAT_TOKEN)
        ok = r.status_code == 200 and r.json().get("success")
        reports = r.json().get("data",[]) if ok else []
        chk("WF6 - Lab reports list endpoint", ok, f"{len(reports)} report(s) in list")
    except Exception as e:
        chk("WF6 - Lab reports list", False, str(e))

    # WF6: Wait for AI analysis
    if report_id:
        print(f"  I  Waiting 10s for background AI lab analysis...")
        await asyncio.sleep(10)
        try:
            r = await api_get(f"/labs/{report_id}", token=PAT_TOKEN)
            ok = r.status_code == 200 and r.json().get("success")
            rep = r.json().get("data",{}) if ok else {}
            status   = rep.get("overall_status","pending")
            summary  = rep.get("ai_summary","")
            flags    = rep.get("ai_flags",[])
            parsed   = rep.get("parsed_values",{})

            chk("WF6 - AI lab analysis completed", status != "pending" and bool(summary),
                f"status={status}, summary_len={len(summary)}, flags={len(flags)}" +
                (" - still pending, AI may be slow, check again in 30s" if status=="pending" else ""))

            if parsed:
                # Check HbA1c flagged as high
                hba1c = parsed.get("hba1c",{})
                hba1c_flagged = hba1c.get("status") in ("high","critical")
                chk("WF6 - HbA1c=8.2% flagged as HIGH", hba1c_flagged,
                    f"hba1c={hba1c}" + (" - regex parser missed it, check parse_lab_values()" if not hba1c_flagged else ""))

                glucose = parsed.get("glucose_fasting",{})
                glucose_flagged = glucose.get("status") in ("high","critical")
                chk("WF6 - Blood glucose=185 flagged as HIGH", glucose_flagged,
                    f"glucose={glucose}")

                vitd = parsed.get("vitamin_d",{})
                vitd_flagged = vitd.get("status") == "low"
                chk("WF6 - Vitamin D=18 flagged as LOW", vitd_flagged,
                    f"vit_d={vitd}")
            else:
                chk("WF6 - Parsed values exist", False, "parsed_values empty - check extract_text() and parse_lab_values()")

        except Exception as e:
            chk("WF6 - AI lab analysis", False, str(e))

    # Save updated state
    STATE["session_id"] = session_id or ""
    STATE["lab_report_id"] = report_id or ""
    with open("test_state.json","w", encoding="utf-8") as f:
        json.dump(STATE, f)

    p = sum(1 for r in results if r["ok"])
    t = len(results)
    print(f"\n  SCORE: {p}/{t} passed ({int(p/t*100) if t else 0}%)")
    with open("test_out_t3.json","w", encoding="utf-8") as f:
        json.dump({"score": f"{p}/{t}", "results": results}, f, indent=2)
    print("  State saved to test_state.json")

asyncio.run(run())
