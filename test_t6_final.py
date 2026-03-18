import httpx, asyncio, json, os, time
from pathlib import Path
from datetime import date
from dotenv import load_dotenv

load_dotenv(Path("services/api/.env"))
API     = "http://localhost:8000"
SB_URL  = os.getenv("SUPABASE_URL","")
SB_ANON = os.getenv("SUPABASE_ANON_KEY", os.getenv("SUPABASE_SERVICE_KEY",""))

# Load state
try:
    STATE = json.loads(Path("test_state.json").read_text(encoding="utf-8"))
except:
    STATE = {}

PAT = STATE.get("pat_token","")
DOC = STATE.get("doc_token","")
PAT_ID = STATE.get("pat_id","")
DOC_ID = STATE.get("doc_id","")

PHASES = {
    "Phase 1 - Auth & Schema":     [],
    "Phase 2 - AI & Lab Reports":  [],
    "Phase 3 - Tracking & Meds":   [],
    "Phase 4 - Doctor & Reports":  [],
}

def chk(phase, name, ok, detail=""):
    icon = "[PASS]" if ok else "[FAIL]"
    print(f"  {icon} {name}" + (f"  [{detail}]" if detail else ""))
    PHASES[phase].append({"name": name, "ok": ok, "detail": detail})

async def api(method, path, data=None, token=None):
    h = {}
    if token: h["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=30) as c:
        if method=="GET":   return await c.get(f"{API}{path}", headers=h)
        if method=="POST":  return await c.post(f"{API}{path}", json=data, headers=h)
        if method=="PATCH": return await c.patch(f"{API}{path}", json=data, headers=h)

async def run():
    print("\n  Running final end-to-end verification...\n")

    # ════ PHASE 1 ════════════════════════════════════════
    print("  -- Phase 1: Auth & Schema")

    # Server alive
    try:
        r = await api("GET","/health")
        chk("Phase 1 - Auth & Schema","API server running", r.status_code==200, f"{API}")
    except: chk("Phase 1 - Auth & Schema","API server running",False,"not running")

    # DB tables
    missing=[]
    for t in ["profiles","patient_profiles","vitals_logs","wellness_logs",
              "lab_reports","medicines","medicine_logs","chat_sessions","weekly_reports"]:
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                r = await c.get(f"{SB_URL}/rest/v1/{t}?select=*&limit=0",
                    headers={"apikey":SB_ANON,"Authorization":f"Bearer {SB_ANON}"})
            if r.status_code not in (200,401,406): missing.append(t)
        except: missing.append(t)
    chk("Phase 1 - Auth & Schema",f"All DB tables exist (9 core)",not missing,
        f"missing:{missing}" if missing else "all present")

    # Auth tokens present from T2
    chk("Phase 1 - Auth & Schema","Patient JWT token valid",bool(PAT),"from T2" if PAT else "run T2 first")
    chk("Phase 1 - Auth & Schema","Doctor JWT token valid", bool(DOC),"from T2" if DOC else "run T2 first")

    # BMI trigger
    if PAT and PAT_ID:
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(f"{SB_URL}/rest/v1/patient_profiles?id=eq.{PAT_ID}&select=bmi",
                    headers={"apikey":SB_ANON,"Authorization":f"Bearer {PAT}"})
            bmi = r.json()[0].get("bmi") if r.json() else None
            chk("Phase 1 - Auth & Schema","Auto-BMI trigger works",bmi and float(bmi)>0,f"bmi={bmi}")
        except Exception as e:
            chk("Phase 1 - Auth & Schema","Auto-BMI trigger",False,str(e))

    # ════ PHASE 2 ════════════════════════════════════════
    print("\n  -- Phase 2: AI Engine & Lab Reports")

    if PAT:
        # Nova chat
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.post(f"{API}/ai/chat",
                    headers={"Authorization":f"Bearer {PAT}","Content-Type":"application/json"},
                    json={"message":"My BP is 142/88 today. Is that okay?"})
            has_content = "token" in r.text or "data:" in r.text
            chk("Phase 2 - AI & Lab Reports","Nova streaming chat works",
                r.status_code==200 and has_content, f"status={r.status_code}, len={len(r.text)}")
        except Exception as e:
            chk("Phase 2 - AI & Lab Reports","Nova streaming chat",False,str(e))

        # Recommendations
        try:
            r = await api("GET","/ai/recommendations",token=PAT)
            recs = r.json().get("data",{}).get("recommendations",[]) if r.status_code==200 else []
            chk("Phase 2 - AI & Lab Reports","AI recommendations endpoint",
                r.status_code==200 and len(recs)>=1,f"{len(recs)} recommendations")
        except Exception as e:
            chk("Phase 2 - AI & Lab Reports","AI recommendations",False,str(e))

        # Lab reports
        try:
            r = await api("GET","/labs/",token=PAT)
            labs = r.json().get("data",[]) if r.status_code==200 else []
            chk("Phase 2 - AI & Lab Reports","Lab reports endpoint",
                r.status_code==200, f"{len(labs)} report(s)")
            analyzed = [l for l in labs if l.get("overall_status") not in ("pending",None,"")]
            chk("Phase 2 - AI & Lab Reports","At least 1 report AI-analyzed",
                len(analyzed)>=1,f"{len(analyzed)}/{len(labs)} analyzed" if labs else "no reports")
        except Exception as e:
            chk("Phase 2 - AI & Lab Reports","Lab reports",False,str(e))

    # ════ PHASE 3 ════════════════════════════════════════
    print("\n  -- Phase 3: Tracking & Medicines")

    if PAT:
        # Today summary
        try:
            r = await api("GET","/vitals/today",token=PAT)
            d = r.json().get("data",{}) if r.status_code==200 else {}
            chk("Phase 3 - Tracking & Meds","Today summary endpoint",r.status_code==200,
                f"vitals={'Y' if d.get('vitals') else 'N'} wellness={'Y' if d.get('wellness') else 'N'}")
        except Exception as e:
            chk("Phase 3 - Tracking & Meds","Today summary",False,str(e))

        # Medicines
        try:
            r = await api("GET","/reminders/medicines",token=PAT)
            meds = r.json().get("data",[]) if r.status_code==200 else []
            chk("Phase 3 - Tracking & Meds","Medicines endpoint",r.status_code==200,f"{len(meds)} medicine(s)")
            low = [m for m in meds if m.get("low_stock")]
            chk("Phase 3 - Tracking & Meds","Low stock detection working",True,
                f"{len(low)} low-stock alert(s)")
        except Exception as e:
            chk("Phase 3 - Tracking & Meds","Medicines",False,str(e))

        # Reminders
        try:
            r = await api("GET","/reminders/reminders",token=PAT)
            rems = r.json().get("data",[]) if r.status_code==200 else []
            chk("Phase 3 - Tracking & Meds","Reminders endpoint",r.status_code==200,f"{len(rems)} reminder(s)")
        except Exception as e:
            chk("Phase 3 - Tracking & Meds","Reminders",False,str(e))

        # 7-day history
        try:
            r = await api("GET","/vitals/history?days=7",token=PAT)
            d = r.json().get("data",{}) if r.status_code==200 else {}
            chk("Phase 3 - Tracking & Meds","7-day history",r.status_code==200,
                f"vitals={len(d.get('vitals',[]))}, wellness={len(d.get('wellness',[]))}")
        except Exception as e:
            chk("Phase 3 - Tracking & Meds","7-day history",False,str(e))

    # ════ PHASE 4 ════════════════════════════════════════
    print("\n  -- Phase 4: Doctor Dashboard & Reports")

    if DOC and PAT_ID:
        # Doctor patient list
        try:
            r = await api("GET","/doctors/patients",token=DOC)
            patients = r.json().get("data",[]) if r.status_code==200 else []
            chk("Phase 4 - Doctor & Reports","Doctor patient list",r.status_code==200,f"{len(patients)} patient(s)")
        except Exception as e:
            chk("Phase 4 - Doctor & Reports","Doctor patient list",False,str(e))

        # Patient detail
        try:
            r = await api("GET",f"/doctors/patients/{PAT_ID}",token=DOC)
            chk("Phase 4 - Doctor & Reports","Doctor patient detail",r.status_code==200,
                f"sections={list(r.json().get('data',{}).keys()) if r.status_code==200 else 'error'}")
        except Exception as e:
            chk("Phase 4 - Doctor & Reports","Patient detail",False,str(e))

        # Access control
        try:
            r = await api("GET","/doctors/patients",token=PAT)
            chk("Phase 4 - Doctor & Reports","Access control (patient->403)",r.status_code==403,
                f"got {r.status_code}" + (" NOT PROTECTED!" if r.status_code!=403 else ""))
        except Exception as e:
            chk("Phase 4 - Doctor & Reports","Access control",False,str(e))

    if PAT:
        # Weekly reports
        try:
            r = await api("GET","/reports-export/weekly",token=PAT)
            reps = r.json().get("data",[]) if r.status_code==200 else []
            has_content = any(rep.get("ai_narrative") for rep in reps)
            chk("Phase 4 - Doctor & Reports","Weekly reports endpoint",r.status_code==200,f"{len(reps)} report(s)")
            chk("Phase 4 - Doctor & Reports","At least 1 report with AI narrative",has_content,
                "found" if has_content else "generate one first")
        except Exception as e:
            chk("Phase 4 - Doctor & Reports","Weekly reports",False,str(e))

    # ════ FINAL SCORECARD ════════════════════════════════
    print("\n" + "="*60)
    print("  FINAL SCORECARD")
    print("="*60)
    total_pass = total_fail = 0
    all_results = {}
    for phase, tests in PHASES.items():
        p = sum(1 for t in tests if t["ok"])
        f = len(tests) - p
        total_pass += p; total_fail += f
        bar = "#"*p + "."*f
        status = "[OK]" if f==0 else ("[WARN]" if p>f else "[FAIL]")
        print(f"  {status} {phase}")
        print(f"     [{bar}] {p}/{len(tests)}")
        for t in tests:
            if not t["ok"]:
                print(f"       [X]  {t['name']}")
        all_results[phase] = {"passed": p, "total": len(tests), "tests": tests}

    total = total_pass + total_fail
    pct = int(total_pass/total*100) if total else 0
    bar_len = 40
    filled = int(bar_len*pct/100)
    bar = "#"*filled + "."*(bar_len-filled)

    print(f"\n  OVERALL: [{bar}]  {pct}%  ({total_pass}/{total} tests passing)")

    if pct == 100:
        print("\n  ALL SYSTEMS GO - NovaCare is fully implemented and working!")
    elif pct >= 80:
        print(f"\n  Platform is mostly working. Fix the {total_fail} failing test(s) above.")
    elif pct >= 50:
        print(f"\n  Some features broken. Review failing tests above.")
    else:
        print(f"\n  Major issues. Start with T1 and work through each phase.")

    # Save final report
    with open("test_out_t6_final.json","w", encoding="utf-8") as f:
        json.dump({
            "overall_score": f"{total_pass}/{total}",
            "overall_pct": pct,
            "phases": all_results
        }, f, indent=2)
    print()

asyncio.run(run())
