# NovaCare

AI-powered universal healthcare platform — an AI Nurse for patients and a monitoring dashboard for doctors.

## Project Structure

```
nova_care/
├── apps/
│   └── mobile/              # React Native Expo app
├── services/
│   ├── api/                 # FastAPI backend
│   ├── ai/                  # AI engine (prompts, routing)
│   └── notifications/       # Push notification service
├── packages/
│   └── shared/              # Shared types, constants
├── supabase/
│   ├── migrations/          # DB schema files (001-007)
│   └── functions/           # Edge functions
└── docs/                    # Documentation
```

## Tech Stack

- **Mobile**: React Native (Expo SDK 55)
- **Backend**: FastAPI (Python 3.11+)
- **Database**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **AI**: Groq (Llama 3.3 70B), OpenRouter (Gemini, DeepSeek), Google AI Studio
- **State**: Zustand
- **Charts**: Victory Native
- **Deployment**: Railway (backend)

## Getting Started

### Backend
```bash
cd services/api
# Activate virtual environment
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp ../../.env.example .env  # fill in your keys
uvicorn main:app --reload
```

### Mobile
```bash
cd apps/mobile
npm install --legacy-peer-deps
cp ../../.env.example .env  # fill in EXPO_PUBLIC_ vars
npx expo start
```

### Supabase Migrations
Run the SQL files in `supabase/migrations/` (001 through 007) in your Supabase project's SQL Editor, in order.

## Environment Variables

See `.env.example` for all required environment variables.

## Medical Disclaimer

NovaCare provides health information and tracking assistance only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult your doctor for medical decisions.
