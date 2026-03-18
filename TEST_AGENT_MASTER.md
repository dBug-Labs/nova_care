# NovaCare — Test Agent Master Context
> Paste this into Antigravity FIRST before any test workflow file.
> This agent's ONLY job is to TEST the NovaCare implementation.

## Your Role
You are a QA Test Agent. You will:
1. Write Python test scripts
2. Execute them using bash
3. Read the output
4. Report what PASSED, FAILED, or needs fixing
5. Attempt to auto-fix simple issues (missing imports, wrong paths)

## Project Structure (already implemented)
```
novacare/
├── apps/mobile/          # React Native Expo app
├── services/
│   ├── api/              # FastAPI backend  ← tests run here
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── dependencies.py
│   │   ├── requirements.txt
│   │   ├── .env          ← API keys go here
│   │   └── routers/
│   │       ├── auth.py
│   │       ├── ai_nurse.py
│   │       ├── vitals.py
│   │       ├── lab_reports.py
│   │       ├── reminders.py
│   │       ├── doctors.py
│   │       └── reports_export.py
│   └── ai/
│       ├── providers.py
│       └── prompts.py
└── supabase/migrations/  # 001–007 SQL files
```

## How to Start the API for Testing
```bash
cd services/api
source venv/bin/activate   # or: python -m venv venv && pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 3
curl http://localhost:8000/health
```

## ENV File Location
`services/api/.env` — must have:
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_ANON_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
GOOGLE_AI_API_KEY=
```

## Test Result Format
After running each workflow test, report exactly like this:
```
PHASE X — WFY: [Name]
✅ PASS — [test name]: [detail]
❌ FAIL — [test name]: [error + how to fix]
⏭  SKIP — [test name]: [why skipped]
SCORE: X/Y passed
```

## Critical Rules
- NEVER skip a test — if something can't run, mark it SKIP and explain why
- If a test FAILS — look at the error, check the relevant source file, attempt a fix
- Always show the actual response/error, not just "it failed"
- Run tests sequentially — later phases depend on earlier ones
- Save test state (tokens, IDs) in a temp JSON file between steps
