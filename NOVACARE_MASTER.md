# NovaCare — Master Project Context
> Read this file at the start of EVERY session. Never lose this context.

## What is NovaCare?
NovaCare is a universal AI-powered healthcare platform that acts as an **AI Nurse** for patients and a **monitoring dashboard** for doctors. It bridges the transparency gap between doctors and patients across ALL medical specialties.

## Core Vision
- Patient gets an AI nurse available 24/7 — tracks health, gives reminders, answers questions
- Doctor sees all their patients' daily status in one dashboard
- Universal: works for ALL specialties — cardiology, orthopedics, gastro, urology, dermatology, ENT, ophthalmology, neurology, general medicine, etc.
- Primary target: ages 40–60 with chronic conditions (Diabetes, Hypertension, Heart disease, Thyroid)
- Long-term goal: help patients reduce medicine dependency and heal naturally

## What NovaCare Does
1. **Lab Report Analysis** — upload PDF/image of blood reports, get AI interpretation
2. **BMI & Vitals Tracking** — enter BMI, BP, sugar, weight, SpO2 etc daily
3. **AI Health Conversation** — structured Q&A with AI nurse, personalized suggestions
4. **Daily Health Tracking** — diet, physical activity, mental wellness, water, sleep
5. **Smart Alerts & Reminders** — medicines, water, walk, doctor appointments
6. **Medicine Stock Management** — track stock, get refill alerts
7. **Doctor Dashboard** — doctor sees all patients, flags, vitals trends
8. **Weekly AI Health Report** — auto-generated PDF for patient + shareable with doctor
9. **Mood & Mental Wellness** — integrated mental health tracking
10. **Universal Specialty Support** — any doctor type can onboard their patients

## Tech Stack
| Layer | Technology |
|---|---|
| Mobile App | React Native (Expo) |
| Backend API | FastAPI (Python 3.11) |
| Database | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Primary AI | Groq API — llama-3.3-70b-versatile (free) |
| Fast AI | Groq API — llama-3.1-8b-instant (free) |
| Vision AI | OpenRouter — google/gemini-2.0-flash-exp:free |
| Reasoning AI | OpenRouter — deepseek/deepseek-chat-v3-0324:free |
| Fallback AI | Google AI Studio — gemini-2.0-flash (free, 60 RPM) |
| State Management | Zustand |
| Charts | Victory Native |
| Notifications | Expo Notifications |
| File Storage | Supabase Storage |
| Deployment | Railway (backend) |

## AI Provider Config
```python
# config/ai_providers.py
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# Primary routing logic
MODELS = {
    "nurse_chat": "llama-3.3-70b-versatile",        # Groq — main AI nurse
    "quick_analysis": "llama-3.1-8b-instant",        # Groq — fast checks
    "lab_report": "google/gemini-2.0-flash-exp:free", # OpenRouter — vision/PDF
    "deep_reasoning": "deepseek/deepseek-chat-v3-0324:free", # OpenRouter
    "fallback": "gemini-2.0-flash",                  # Google AI Studio
}
```

## Git Repository Structure
```
novacare/
├── apps/
│   └── mobile/          # React Native Expo app
├── services/
│   ├── api/             # FastAPI backend
│   ├── ai/              # AI engine (prompts, routing)
│   └── notifications/   # Push notification service
├── packages/
│   └── shared/          # Shared types, constants
├── supabase/
│   ├── migrations/      # DB schema files
│   └── functions/       # Edge functions
└── docs/
    └── *.md             # All agent markdown files
```

## Git Branches
| Branch | Owner | Purpose |
|---|---|---|
| `main` | — | Production only, protected |
| `develop` | — | Integration branch, all PRs merge here |
| `phase1/foundation` | Agent 1 | Project setup, Supabase schema, config |
| `phase1/auth` | Agent 2 | Auth flows, user profiles, onboarding |
| `phase2/ai-engine` | Agent 1 | AI nurse, Groq/OpenRouter integration |
| `phase2/lab-reports` | Agent 2 | Lab report upload, analysis, OCR |
| `phase3/patient-tracking` | Agent 1 | Daily vitals, mood, activity, diet |
| `phase3/alerts-reminders` | Agent 2 | Medicine reminders, stock, notifications |
| `phase4/doctor-dashboard` | Agent 1 | Doctor portal, patient list, analytics |
| `phase4/reports-export` | Agent 2 | Weekly PDF reports, sharing, history |

## Agent Assignments
| Agent | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| **Agent 1** | WF1: Project scaffold + Supabase | WF3: AI Engine | WF5: Patient tracking | WF7: Doctor dashboard |
| **Agent 2** | WF2: Auth + User profiles | WF4: Lab report analysis | WF6: Alerts & reminders | WF8: Reports & export |
| **Agent 3** | — | Reviews + integrates WF3+WF4 | Reviews + integrates WF5+WF6 | Reviews + integrates WF7+WF8 + Final PPT |

## Supabase Project
- Project URL: [SET YOUR SUPABASE_URL]
- Anon Key: [SET YOUR SUPABASE_ANON_KEY]
- Service Key: [SET YOUR SUPABASE_SERVICE_KEY]

## Environment Variables (all agents must use these exact names)
```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# AI Providers
GROQ_API_KEY=
OPENROUTER_API_KEY=
GOOGLE_AI_API_KEY=

# App
EXPO_PROJECT_ID=
RAILWAY_URL=
```

## Code Style Rules (Claude Opus must follow)
- Python: FastAPI, async/await everywhere, Pydantic v2 models
- TypeScript: strict mode, no `any`
- All API responses: `{ success: bool, data: any, error: str | null }`
- All DB operations: use Supabase client, never raw SQL unless migration
- All AI calls: wrap in try/except with fallback model logic
- Comments: explain WHY not WHAT
- File naming: snake_case for Python, camelCase for TS, kebab-case for files

## Medical Disclaimer (must appear in all AI outputs to users)
"NovaCare provides health information and tracking assistance only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult your doctor for medical decisions."
