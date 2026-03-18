import httpx, os, asyncio, json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("services/api/.env"))

SUPABASE_URL        = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY= os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_ANON_KEY   = os.getenv("SUPABASE_ANON_KEY", SUPABASE_SERVICE_KEY)
GROQ_KEY            = os.getenv("GROQ_API_KEY", "")
OPENROUTER_KEY      = os.getenv("OPENROUTER_API_KEY", "")
GOOGLE_KEY          = os.getenv("GOOGLE_AI_API_KEY", "")

results = []

def chk(name, ok, detail=""):
    icon = "[PASS]" if ok else "[FAIL]"
    msg = f"{icon} - {name}" + (f": {detail}" if detail else "")
    print("  " + msg)
    results.append({"name": name, "ok": ok, "detail": detail})

async def run():
    # 1. ENV vars
    for var, val in [
        ("SUPABASE_URL",         SUPABASE_URL),
        ("SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY),
        ("GROQ_API_KEY",         GROQ_KEY),
        ("OPENROUTER_API_KEY",   OPENROUTER_KEY),
        ("GOOGLE_AI_API_KEY",    GOOGLE_KEY),
    ]:
        chk(f"ENV {var} set", bool(val), val[:20]+"..." if val else "MISSING — add to services/api/.env")

    # 2. API server health
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get("http://localhost:8000/health")
        ok = r.status_code == 200 and r.json().get("status") == "ok"
        chk("API /health endpoint", ok, r.text[:80])
    except Exception as e:
        chk("API /health endpoint", False, f"Server not running — start with: uvicorn main:app --reload | Error: {e}")

    # 3. OpenAPI routes registered
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get("http://localhost:8000/openapi.json")
        paths = list(r.json().get("paths", {}).keys())
        needed = ["/auth/signup", "/vitals/log", "/vitals/today", "/vitals/wellness",
                  "/vitals/history", "/ai/chat", "/ai/recommendations", "/ai/start-assessment",
                  "/labs/upload", "/labs/", "/reminders/medicines", "/reminders/reminders",
                  "/doctors/patients", "/reports-export/generate-weekly", "/reports-export/weekly"]
        missing = [p for p in needed if not any(p in x for x in paths)]
        chk(f"All {len(needed)} API routes registered", not missing,
            f"Missing: {missing}" if missing else f"{len(paths)} total routes found")
    except Exception as e:
        chk("API routes check", False, str(e))

    # 4. Groq
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post("https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_KEY}"},
                json={"model":"llama-3.1-8b-instant","messages":[{"role":"user","content":"Say: OK"}],"max_tokens":5})
        reply = r.json().get("choices",[{}])[0].get("message",{}).get("content","")
        chk("Groq API (llama-3.1-8b-instant)", r.status_code==200, f"reply='{reply.strip()}' status={r.status_code}")
    except Exception as e:
        chk("Groq API", False, str(e))

    # 5. OpenRouter
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post("https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization":f"Bearer {OPENROUTER_KEY}","HTTP-Referer":"https://novacare.health"},
                json={"model":"google/gemini-2.0-flash-exp:free","messages":[{"role":"user","content":"Say: OK"}],"max_tokens":5})
        chk("OpenRouter API (gemini free)", r.status_code==200, f"status={r.status_code} {r.text[:60]}")
    except Exception as e:
        chk("OpenRouter API", False, str(e))

    # 6. Google AI
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GOOGLE_KEY}",
                json={"contents":[{"parts":[{"text":"Say: OK"}]}]})
        chk("Google AI (gemini-2.0-flash)", r.status_code==200, f"status={r.status_code}")
    except Exception as e:
        chk("Google AI", False, str(e))

    # 7. Supabase reachable
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{SUPABASE_URL}/rest/v1/profiles?select=id&limit=1",
                headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {SUPABASE_ANON_KEY}"})
        chk("Supabase DB reachable", r.status_code in (200,401,406), f"status={r.status_code}")
    except Exception as e:
        chk("Supabase reachable", False, str(e))

    # 8. All 13 DB tables exist
    tables = ["profiles","patient_profiles","doctor_profiles","doctor_patient_links",
              "vitals_logs","wellness_logs","lab_reports","medicines","medicine_logs",
              "reminders","chat_sessions","chat_messages","health_assessments","weekly_reports"]
    missing_tables = []
    for t in tables:
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(f"{SUPABASE_URL}/rest/v1/{t}?select=*&limit=0",
                    headers={"apikey":SUPABASE_ANON_KEY,"Authorization":f"Bearer {SUPABASE_ANON_KEY}"})
            if r.status_code not in (200,401,406): missing_tables.append(t)
        except: missing_tables.append(t)
    chk(f"All {len(tables)} DB tables exist (migrations 001–007)", not missing_tables,
        f"MISSING TABLES: {missing_tables} — run migrations in Supabase SQL Editor" if missing_tables else "All present")

    # 9. Storage bucket
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{SUPABASE_URL}/storage/v1/bucket/lab-reports",
                headers={"apikey":SUPABASE_ANON_KEY,"Authorization":f"Bearer {SUPABASE_ANON_KEY}"})
        chk("Supabase Storage bucket 'lab-reports'", r.status_code==200,
            "NOT FOUND — create it in Supabase Dashboard → Storage → New bucket → name: lab-reports → Public ON" if r.status_code!=200 else "exists")
    except Exception as e:
        chk("Storage bucket", False, str(e))

    # Summary
    p = sum(1 for r in results if r["ok"])
    t = len(results)
    print(f"\n  SCORE: {p}/{t} passed ({int(p/t*100)}%)")
    with open("test_out.json","w", encoding="utf-8") as f:
        json.dump({"score": f"{p}/{t}", "results": results}, f, indent=2)

asyncio.run(run())
