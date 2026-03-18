import httpx, asyncio, json, os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("services/api/.env"))
API     = "http://localhost:8000"
SB_URL  = os.getenv("SUPABASE_URL","")
SB_ANON = os.getenv("SUPABASE_ANON_KEY", os.getenv("SUPABASE_SERVICE_KEY",""))

try:
    STATE = json.loads(Path("test_state.json").read_text(encoding="utf-8"))
except:
    print("[FAIL] - No test_state.json - run T2 first"); exit(1)

PAT_TOKEN = STATE.get("pat_token","")
PAT_ID    = STATE.get("pat_id","")
DOC_TOKEN = STATE.get("doc_token","")
DOC_ID    = STATE.get("doc_id","")
results   = []

def chk(name, ok, detail=""):
    icon = "[PASS]" if ok else "[FAIL]"
    print(f"  {icon} - {name}" + (f": {detail}" if detail else ""))
    results.append({"name": name, "ok": ok, "detail": detail})

async def post(path, data, token=None):
    h = {}
    if token: h["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=45) as c:
        return await c.post(f"{API}{path}", json=data, headers=h)

async def get(path, token=None):
    h = {}
    if token: h["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=30) as c:
        return await c.get(f"{API}{path}", headers=h)

async def sb_post(path, data, token):
    async with httpx.AsyncClient(timeout=10) as c:
        return await c.post(f"{SB_URL}/rest/v1/{path}",
            headers={"apikey":SB_ANON,"Authorization":f"Bearer {token}",
                     "Content-Type":"application/json","Prefer":"return=representation"},
            json=data)

async def run():
    if not PAT_TOKEN or not DOC_TOKEN:
        print("[FAIL] - Missing tokens - run T2 first"); return

    # ── WF9: Link patient to doctor ───────────────────────────────────
    try:
        r = await sb_post("doctor_patient_links",
            {"doctor_id":DOC_ID,"patient_id":PAT_ID,"specialty":"general","active":True},
            DOC_TOKEN)
        ok = r.status_code in (200,201,409)
        chk("WF9 - Link patient to doctor",ok,
            f"status={r.status_code}" + (" (already linked)" if r.status_code==409 else ""))
    except Exception as e:
        chk("WF9 - Link patient", False, str(e))

    # ── WF9: Doctor patient list ──────────────────────────────────────
    patients = []
    try:
        r = await get("/doctors/patients", DOC_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        patients = r.json().get("data",[]) if ok else []
        chk("WF9 - Doctor patient list", ok, f"{len(patients)} patient(s)")
        if patients:
            p = patients[0]
            has_risk    = "risk_level" in p
            has_name    = bool(p.get("name"))
            has_vitals  = "latest_bp" in p or "latest_sugar" in p
            chk("WF9 - Patient card has required fields", has_risk and has_name,
                f"name={p.get('name')}, risk={p.get('risk_level')}, bp={p.get('latest_bp')}")
            # Verify sorted by risk
            risks = [p.get("risk_level","") for p in patients]
            risk_order = {"critical":0,"warning":1,"watch":2,"normal":3,"unknown":4}
            sorted_ok = all(risk_order.get(risks[i],4) <= risk_order.get(risks[i+1],4)
                           for i in range(len(risks)-1)) if len(risks) > 1 else True
            chk("WF9 - Patients sorted by risk level", sorted_ok, f"order={risks}")
    except Exception as e:
        chk("WF9 - Doctor patient list", False, str(e))

    # ── WF9: Doctor patient detail ────────────────────────────────────
    try:
        r = await get(f"/doctors/patients/{PAT_ID}", DOC_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        d  = r.json().get("data",{}) if ok else {}
        sections = {
            "profile":   "profile" in d,
            "vitals":    "vitals" in d,
            "wellness":  "wellness" in d,
            "labs":      "labs" in d,
            "medicines": "medicines" in d,
            "chats":     "chats" in d,
        }
        all_present = all(sections.values())
        chk("WF9 - Patient detail has all 6 sections", all_present,
            "  ".join(f"{k}={'Y' if v else 'N'}" for k,v in sections.items()))

        if d.get("vitals"):
            chk("WF9 - Doctor sees patient vitals data",True,
                f"{len(d['vitals'])} vitals records")
        if d.get("labs"):
            chk("WF9 - Doctor sees lab reports",True,
                f"{len(d['labs'])} reports")
    except Exception as e:
        chk("WF9 - Patient detail", False, str(e))

    # ── WF9: Access control ───────────────────────────────────────────
    try:
        r = await get("/doctors/patients", PAT_TOKEN)
        chk("WF9 - Access control (patient->doctor blocked)", r.status_code==403,
            f"got {r.status_code} - expected 403 Forbidden" + (" - add require_doctor() guard!" if r.status_code!=403 else ""))
    except Exception as e:
        chk("WF9 - Access control", False, str(e))

    # ── WF9: Doctor adds note ─────────────────────────────────────────
    try:
        r = await post("/doctors/notes", {
            "patient_id":PAT_ID,
            "note":"BP has been consistently elevated. Advised low sodium diet and increased Amlodipine to 10mg. Review in 2 weeks.",
            "note_type":"follow_up"
        }, DOC_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        chk("WF9 - Doctor adds clinical note", ok, f"status={r.status_code}")
    except Exception as e:
        chk("WF9 - Doctor note", False, str(e))

    # ── WF10: Generate weekly report ─────────────────────────────────
    weekly_report_id = None
    try:
        r = await post("/reports-export/generate-weekly", {}, PAT_TOKEN)
        ok = r.status_code==200 and r.json().get("success")
        weekly_report_id = r.json().get("data",{}).get("report_id","") if ok else ""
        chk("WF10 - Trigger weekly report generation", ok,
            f"report_id={weekly_report_id[:12] if weekly_report_id else 'none'}...")
    except Exception as e:
        chk("WF10 - Weekly report trigger", False, str(e))

    # WF10: Wait for generation
    if weekly_report_id:
        print("  I  Waiting 15s for AI weekly report generation...")
        await asyncio.sleep(15)

        try:
            r = await get("/reports-export/weekly", PAT_TOKEN)
            ok = r.status_code==200 and r.json().get("success")
            reports = r.json().get("data",[]) if ok else []
            chk("WF10 - Weekly reports list", ok, f"{len(reports)} report(s)")

            if reports:
                rep = reports[0]
                has_narrative  = bool(rep.get("ai_narrative"))
                has_highlights = bool(rep.get("highlights"))
                has_concerns   = "concerns" in rep
                has_goals      = bool(rep.get("goals_next_week"))
                has_stats      = rep.get("avg_mood_score") is not None
                has_pdf        = bool(rep.get("pdf_url"))

                chk("WF10 - AI narrative generated", has_narrative,
                    f"'{rep.get('ai_narrative','')[:60]}...'" if has_narrative else "MISSING")
                chk("WF10 - Highlights generated", has_highlights,
                    f"{rep.get('highlights',[])} " if has_highlights else "MISSING")
                chk("WF10 - Goals for next week", has_goals,
                    f"{len(rep.get('goals_next_week',[]))} goals" if has_goals else "MISSING")
                chk("WF10 - Weekly stats (mood, sleep, adherence)", has_stats,
                    f"mood={rep.get('avg_mood_score')}, sleep={rep.get('avg_sleep_hours')}h, adherence={rep.get('medicine_adherence_pct')}%")
                chk("WF10 - PDF generated + stored", has_pdf,
                    f"url={rep.get('pdf_url','')[:50]}..." if has_pdf else "PDF missing")
        except Exception as e:
            chk("WF10 - Weekly report content", False, str(e))

    # WF10: Share with doctor
    if weekly_report_id:
        try:
            r = await post(f"/reports-export/weekly/{weekly_report_id}/share-with-doctor", {}, PAT_TOKEN)
            ok = r.status_code==200 and r.json().get("success")
            chk("WF10 - Share report with doctor", ok, f"status={r.status_code}")
        except Exception as e:
            chk("WF10 - Share report", False, str(e))

    # WF10: Doctor can see shared data
    try:
        r = await get(f"/doctors/patients/{PAT_ID}", DOC_TOKEN)
        ok = r.status_code==200
        if ok:
            chats = r.json().get("data",{}).get("chats",[])
            chk("WF10 - Doctor sees patient chat history", ok,
                f"{len(chats)} conversation(s) visible to doctor")
    except Exception as e:
        chk("WF10 - Doctor sees data", False, str(e))

    # Final summary
    p = sum(1 for r in results if r["ok"])
    t = len(results)
    print(f"\n  SCORE: {p}/{t} passed ({int(p/t*100) if t else 0}%)")
    with open("test_out_t5.json","w", encoding="utf-8") as f:
        json.dump({"score": f"{p}/{t}", "results": results}, f, indent=2)

asyncio.run(run())
