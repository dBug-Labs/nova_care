# NovaCare Test — Workflow T1: Environment & Server Health
> Paste TEST_AGENT_MASTER.md first, then this file.
> Run this FIRST before any other test.
> Branch to test: all merged into `develop`

---

## What This Tests
- All ENV variables are set correctly
- API server starts and responds
- All 3 AI providers respond (Groq, OpenRouter, Google AI)
- Supabase database is reachable
- All 13 database tables exist from migrations

---

## Instructions for Agent

### Step 1 — Write and run this test script

```bash
cd services/api
source venv/bin/activate 2>/dev/null || (python -m venv venv && source venv/bin/activate && pip install -r requirements.txt -q)
```

Now write the file `/tmp/test_t1_env.py` with this exact content and run it:

```python
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
    icon = "✅ PASS" if ok else "❌ FAIL"
    print(f"  {icon} — {name}" + (f": {detail}" if detail else ""))
    results.append(ok)

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
                json={"model":"deepseek/deepseek-chat-v3-0324:free","messages":[{"role":"user","content":"Say: OK"}],"max_tokens":5})
        chk("OpenRouter API (deepseek free)", r.status_code==200, f"status={r.status_code} {r.text[:60]}")
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
    p = sum(results); t = len(results)
    print(f"\n  SCORE: {p}/{t} passed ({int(p/t*100)}%)")
    with open("/tmp/test_state.json","w") as f:
        json.dump({"env_ok": p/t >= 0.8}, f)

asyncio.run(run())
```

### Step 2 — Run it
```bash
python /tmp/test_t1_env.py
```

### Step 3 — If API server is not running, start it first:
```bash
cd services/api && uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 4
python /tmp/test_t1_env.py
```

### Step 4 — Report results
Show every PASS/FAIL line and the final score.
For each FAIL, check the relevant file and suggest the exact fix.

---

## Common Fixes

| Error | Fix |
|---|---|
| ENV var missing | Open `services/api/.env`, add the missing key |
| `relation X does not exist` | Go to Supabase → SQL Editor → run migration file 00X |
| Storage bucket not found | Supabase Dashboard → Storage → New bucket → `lab-reports` → Public ON |
| API server not running | `cd services/api && uvicorn main:app --reload` |
| Groq 401 | Wrong API key — regenerate at console.groq.com |
| OpenRouter 402 | Free model limits hit — wait until midnight UTC |
