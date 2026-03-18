# NovaCare — Phase 1 | Agent 1
## Workflows: WF1 (Project Scaffold) + WF2 (Supabase Schema)
> Paste NOVACARE_MASTER.md into context first, then this file.
> Branch: `phase1/foundation`
> Model: Claude Opus

---

## WF1: Project Scaffold & Configuration

### Goal
Create the complete monorepo structure for NovaCare with all config files, dependencies, and environment setup. Everything else builds on this.

### Step 1 — Initialize monorepo
```bash
mkdir novacare && cd novacare
git init
git checkout -b develop
git checkout -b phase1/foundation

# Create folder structure
mkdir -p apps/mobile services/api services/ai services/notifications packages/shared supabase/migrations supabase/functions docs
```

### Step 2 — Mobile app (React Native Expo)
```bash
cd apps/mobile
npx create-expo-app@latest . --template blank-typescript
```

Install all dependencies:
```bash
npx expo install expo-router expo-notifications expo-document-picker expo-image-picker expo-file-system
npm install @supabase/supabase-js zustand @tanstack/react-query
npm install react-native-chart-kit victory-native
npm install react-native-paper react-native-safe-area-context
npm install react-hook-form zod @hookform/resolvers
npm install date-fns axios
npm install --save-dev typescript @types/react @types/react-native
```

`apps/mobile/app.json`:
```json
{
  "expo": {
    "name": "NovaCare",
    "slug": "novacare",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "novacare",
    "plugins": [
      "expo-router",
      ["expo-notifications", {
        "icon": "./assets/notification-icon.png",
        "color": "#0B8A73"
      }]
    ],
    "android": { "adaptiveIcon": { "backgroundColor": "#0B8A73" } },
    "ios": { "supportsTablet": false }
  }
}
```

`apps/mobile/app/_layout.tsx`:
```typescript
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
```

`apps/mobile/constants/colors.ts`:
```typescript
export const Colors = {
  primary: '#0B8A73',
  primaryLight: '#02C39A',
  primaryDark: '#085041',
  accent: '#E8614D',
  gold: '#F4C430',
  background: '#F0FAF8',
  card: '#FFFFFF',
  text: '#1A3C3A',
  textMuted: '#7BBFB5',
  border: '#D1EDE9',
  danger: '#E24B4A',
  warning: '#F4C430',
  success: '#02C39A',
};
```

`apps/mobile/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

`apps/mobile/lib/api.ts`:
```typescript
import axios from 'axios';
import { supabase } from './supabase';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 30000,
});

// Attach Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => Promise.reject(err.response?.data || err.message)
);

export default api;
```

### Step 3 — Backend (FastAPI)
```bash
cd services/api
python -m venv venv && source venv/bin/activate
pip install fastapi uvicorn supabase python-dotenv pydantic httpx python-multipart
pip install groq google-generativeai pillow pypdf2 python-jose
pip freeze > requirements.txt
```

`services/api/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config import settings
from routers import auth, patients, vitals, ai_nurse, lab_reports, reminders, doctors

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🚀 NovaCare API starting — env: {settings.ENV}")
    yield
    print("NovaCare API shutting down")

app = FastAPI(
    title="NovaCare API",
    version="1.0.0",
    description="AI-powered universal healthcare platform",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(patients.router, prefix="/patients", tags=["patients"])
app.include_router(vitals.router, prefix="/vitals", tags=["vitals"])
app.include_router(ai_nurse.router, prefix="/ai", tags=["ai-nurse"])
app.include_router(lab_reports.router, prefix="/labs", tags=["lab-reports"])
app.include_router(reminders.router, prefix="/reminders", tags=["reminders"])
app.include_router(doctors.router, prefix="/doctors", tags=["doctors"])

@app.get("/health")
async def health(): return {"status": "ok", "service": "NovaCare API"}
```

`services/api/config.py`:
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    ENV: str = "development"
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    GROQ_API_KEY: str
    OPENROUTER_API_KEY: str
    GOOGLE_AI_API_KEY: str

    class Config:
        env_file = ".env"

settings = Settings()
```

`services/api/dependencies.py`:
```python
from fastapi import Depends, HTTPException, Header
from supabase import create_client
from config import settings

supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

async def get_current_user(authorization: str = Header(...)):
    """Verify Supabase JWT and return user_id."""
    try:
        token = authorization.replace("Bearer ", "")
        user = supabase.auth.get_user(token)
        if not user.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized")
```

### Step 4 — Shared types
`packages/shared/types.ts`:
```typescript
export type UserRole = 'patient' | 'doctor' | 'admin';
export type Specialty = 
  | 'general' | 'cardiology' | 'orthopedics' | 'gastroenterology'
  | 'urology' | 'dermatology' | 'ent' | 'ophthalmology' | 'neurology'
  | 'endocrinology' | 'pulmonology' | 'nephrology' | 'psychiatry';

export type ChronicCondition =
  | 'diabetes_type1' | 'diabetes_type2' | 'hypertension' | 'heart_disease'
  | 'thyroid' | 'asthma' | 'arthritis' | 'obesity' | 'none';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}
```

### Step 5 — Create all empty router files
```bash
cd services/api
mkdir -p routers
touch routers/__init__.py
for f in auth patients vitals ai_nurse lab_reports reminders doctors; do
  echo "from fastapi import APIRouter
router = APIRouter()
" > routers/$f.py
done
```

### Step 6 — Railway deployment config
`services/api/Procfile`:
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

`services/api/railway.toml`:
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
restartPolicyType = "ON_FAILURE"
```

### Step 7 — Root README and .gitignore
`novacare/.gitignore`:
```
node_modules/
.env
.env.local
venv/
__pycache__/
*.pyc
.expo/
dist/
build/
.DS_Store
```

### WF1 Done Checklist
- [ ] Monorepo folder structure created
- [ ] React Native Expo app initialized with all deps
- [ ] FastAPI backend initialized with all deps
- [ ] Colors, supabase client, api client configured
- [ ] All router stubs created
- [ ] Railway config ready
- [ ] Git branch `phase1/foundation` has initial commit

---

## WF2: Supabase Database Schema

### Goal
Create the complete PostgreSQL schema for NovaCare covering all entities. All migrations go in `supabase/migrations/`.

### Migration 001 — Core Users & Profiles
`supabase/migrations/001_users_profiles.sql`:
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Extend Supabase auth.users with profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
  full_name TEXT NOT NULL,
  phone TEXT,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  profile_image_url TEXT,
  language TEXT DEFAULT 'en',
  onboarding_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Doctor profiles
CREATE TABLE public.doctor_profiles (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  registration_number TEXT UNIQUE NOT NULL,
  hospital_name TEXT,
  consultation_fee DECIMAL(10,2),
  bio TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patient profiles
CREATE TABLE public.patient_profiles (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  blood_group TEXT CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  height_cm DECIMAL(5,2),
  weight_kg DECIMAL(5,2),
  bmi DECIMAL(4,2),
  chronic_conditions TEXT[] DEFAULT '{}',  -- array of ChronicCondition values
  allergies TEXT[] DEFAULT '{}',
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  primary_doctor_id UUID REFERENCES public.doctor_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Doctor-Patient relationships (many-to-many)
CREATE TABLE public.doctor_patient_links (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES public.doctor_profiles(id),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id),
  specialty TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, patient_id, specialty)
);

-- RLS policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_patient_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Patient reads own data" ON public.patient_profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Doctor reads linked patients" ON public.patient_profiles FOR SELECT
  USING (id IN (SELECT patient_id FROM public.doctor_patient_links WHERE doctor_id = auth.uid() AND active = TRUE));
```

### Migration 002 — Vitals & Daily Logs
`supabase/migrations/002_vitals_logs.sql`:
```sql
-- Daily vitals entry
CREATE TABLE public.vitals_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  -- Vital signs
  systolic_bp INTEGER,           -- blood pressure upper
  diastolic_bp INTEGER,          -- blood pressure lower
  heart_rate INTEGER,
  blood_sugar_fasting DECIMAL(6,2),
  blood_sugar_pp DECIMAL(6,2),   -- post-prandial
  spo2 INTEGER,                  -- oxygen saturation %
  temperature DECIMAL(4,2),
  weight_kg DECIMAL(5,2),
  -- Derived
  bmi DECIMAL(4,2),
  -- AI flags
  ai_analysis TEXT,
  risk_level TEXT CHECK (risk_level IN ('normal', 'watch', 'warning', 'critical')) DEFAULT 'normal',
  flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily wellness log
CREATE TABLE public.wellness_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  log_date DATE DEFAULT CURRENT_DATE,
  -- Mood
  mood_score INTEGER CHECK (mood_score BETWEEN 1 AND 5),
  mood_note TEXT,
  -- Sleep
  sleep_hours DECIMAL(3,1),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
  -- Activity
  steps_count INTEGER,
  exercise_minutes INTEGER,
  exercise_type TEXT,
  -- Water
  water_ml INTEGER,
  -- Diet
  meals_logged JSONB DEFAULT '[]', -- [{meal: "breakfast", items: [...], calories: 450}]
  diet_score INTEGER CHECK (diet_score BETWEEN 1 AND 5),
  -- AI summary
  ai_daily_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, log_date)
);

-- Indexes for fast queries
CREATE INDEX idx_vitals_patient_date ON public.vitals_logs(patient_id, logged_at DESC);
CREATE INDEX idx_wellness_patient_date ON public.wellness_logs(patient_id, log_date DESC);

-- RLS
ALTER TABLE public.vitals_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient manages own vitals" ON public.vitals_logs FOR ALL USING (patient_id = auth.uid());
CREATE POLICY "Doctor reads patient vitals" ON public.vitals_logs FOR SELECT
  USING (patient_id IN (SELECT patient_id FROM public.doctor_patient_links WHERE doctor_id = auth.uid() AND active=TRUE));
CREATE POLICY "Patient manages own wellness" ON public.wellness_logs FOR ALL USING (patient_id = auth.uid());
```

### Migration 003 — Lab Reports
`supabase/migrations/003_lab_reports.sql`:
```sql
CREATE TABLE public.lab_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,     -- 'blood_test', 'urine', 'xray', 'ecg', 'mri', 'other'
  report_date DATE,
  file_url TEXT,                 -- Supabase Storage URL
  file_name TEXT,
  -- Parsed data
  raw_text TEXT,                 -- OCR extracted text
  parsed_values JSONB,           -- {"hemoglobin": {"value": 11.2, "unit": "g/dL", "normal_range": "12-17"}}
  -- AI analysis
  ai_summary TEXT,
  ai_flags JSONB DEFAULT '[]',   -- [{"parameter": "HbA1c", "value": 8.2, "status": "high", "note": "..."}]
  overall_status TEXT CHECK (overall_status IN ('normal', 'borderline', 'abnormal', 'critical')),
  -- Meta
  uploaded_by UUID REFERENCES auth.users(id),
  doctor_reviewed BOOLEAN DEFAULT FALSE,
  doctor_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Storage bucket for lab reports (create in Supabase dashboard)
-- Bucket name: lab-reports
-- Policy: users can only read/write their own folder: patient_id/filename

CREATE INDEX idx_lab_patient ON public.lab_reports(patient_id, created_at DESC);

ALTER TABLE public.lab_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patient manages own labs" ON public.lab_reports FOR ALL USING (patient_id = auth.uid());
CREATE POLICY "Doctor reads patient labs" ON public.lab_reports FOR SELECT
  USING (patient_id IN (SELECT patient_id FROM public.doctor_patient_links WHERE doctor_id = auth.uid() AND active=TRUE));
```

### Migration 004 — Medicines & Reminders
`supabase/migrations/004_medicines_reminders.sql`:
```sql
-- Medicine list per patient
CREATE TABLE public.medicines (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dosage TEXT NOT NULL,            -- "500mg", "1 tablet"
  frequency TEXT NOT NULL,         -- "twice daily", "morning only"
  schedule_times TEXT[] NOT NULL,  -- ["08:00", "20:00"]
  prescribed_by UUID REFERENCES public.doctor_profiles(id),
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  active BOOLEAN DEFAULT TRUE,
  -- Stock management
  stock_count INTEGER DEFAULT 0,
  stock_unit TEXT DEFAULT 'tablets',
  refill_alert_at INTEGER DEFAULT 5, -- alert when stock <= this
  -- Meta
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Medicine intake logs
CREATE TABLE public.medicine_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id),
  scheduled_time TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('taken', 'missed', 'snoozed')) DEFAULT 'missed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- General reminders (water, walk, appointment, etc)
CREATE TABLE public.reminders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('water', 'walk', 'medicine', 'appointment', 'vitals', 'custom')),
  title TEXT NOT NULL,
  message TEXT,
  schedule_time TEXT NOT NULL,       -- "HH:MM"
  days_of_week INTEGER[] DEFAULT '{1,2,3,4,5,6,7}', -- 1=Mon ... 7=Sun
  active BOOLEAN DEFAULT TRUE,
  expo_push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient manages own medicines" ON public.medicines FOR ALL USING (patient_id = auth.uid());
CREATE POLICY "Patient manages own med logs" ON public.medicine_logs FOR ALL USING (patient_id = auth.uid());
CREATE POLICY "Patient manages own reminders" ON public.reminders FOR ALL USING (patient_id = auth.uid());
```

### Migration 005 — AI Conversations
`supabase/migrations/005_ai_conversations.sql`:
```sql
-- AI nurse chat sessions
CREATE TABLE public.chat_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  session_type TEXT DEFAULT 'general' CHECK (session_type IN ('general', 'health_assessment', 'symptom_check', 'report_review')),
  title TEXT,
  summary TEXT,                     -- AI-generated session summary
  mood_detected TEXT,
  health_flags JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0
);

-- Individual messages
CREATE TABLE public.chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model_used TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Health assessment questionnaires
CREATE TABLE public.health_assessments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id),
  assessment_date DATE DEFAULT CURRENT_DATE,
  responses JSONB NOT NULL,          -- [{question: "...", answer: "..."}]
  ai_analysis TEXT,
  recommendations JSONB DEFAULT '[]',
  risk_score INTEGER CHECK (risk_score BETWEEN 1 AND 10),
  follow_up_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_patient ON public.chat_sessions(patient_id, started_at DESC);
CREATE INDEX idx_messages_session ON public.chat_messages(session_id, created_at ASC);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patient owns chats" ON public.chat_sessions FOR ALL USING (patient_id = auth.uid());
CREATE POLICY "Patient owns messages" ON public.chat_messages FOR ALL
  USING (session_id IN (SELECT id FROM public.chat_sessions WHERE patient_id = auth.uid()));
CREATE POLICY "Patient owns assessments" ON public.health_assessments FOR ALL USING (patient_id = auth.uid());
```

### Migration 006 — Weekly Reports
`supabase/migrations/006_weekly_reports.sql`:
```sql
CREATE TABLE public.weekly_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  -- Summary stats
  avg_mood_score DECIMAL(3,2),
  avg_sleep_hours DECIMAL(3,1),
  avg_water_ml INTEGER,
  total_exercise_minutes INTEGER,
  medicine_adherence_pct INTEGER,     -- % of medicines taken on time
  vitals_summary JSONB,               -- aggregated vitals for the week
  -- AI content
  ai_narrative TEXT,                  -- full week summary paragraph
  highlights JSONB DEFAULT '[]',      -- ["Mood improved 30%", "BP stable"]
  concerns JSONB DEFAULT '[]',        -- ["Missed 3 medicine doses"]
  goals_next_week JSONB DEFAULT '[]', -- AI-suggested goals
  -- File
  pdf_url TEXT,                       -- Supabase Storage
  shared_with_doctor BOOLEAN DEFAULT FALSE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, week_start)
);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patient owns reports" ON public.weekly_reports FOR ALL USING (patient_id = auth.uid());
CREATE POLICY "Doctor reads shared reports" ON public.weekly_reports FOR SELECT
  USING (shared_with_doctor = TRUE AND patient_id IN (
    SELECT patient_id FROM public.doctor_patient_links WHERE doctor_id = auth.uid() AND active=TRUE
  ));
```

### Migration 007 — Triggers & Functions
`supabase/migrations/007_triggers.sql`:
```sql
-- Auto-update profile updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER patient_profiles_updated_at BEFORE UPDATE ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate BMI when height/weight changes
CREATE OR REPLACE FUNCTION calculate_bmi()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.height_cm IS NOT NULL AND NEW.weight_kg IS NOT NULL AND NEW.height_cm > 0 THEN
    NEW.bmi = ROUND((NEW.weight_kg / POWER(NEW.height_cm / 100.0, 2))::NUMERIC, 2);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_bmi ON public.patient_profiles
  BEFORE INSERT OR UPDATE OF height_cm, weight_kg
  FOR EACH ROW EXECUTE FUNCTION calculate_bmi();

-- Auto-flag critical vitals
CREATE OR REPLACE FUNCTION flag_critical_vitals()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.systolic_bp > 180 OR NEW.diastolic_bp > 120) OR
     (NEW.blood_sugar_fasting > 300) OR
     (NEW.spo2 IS NOT NULL AND NEW.spo2 < 90) OR
     (NEW.heart_rate > 150 OR NEW.heart_rate < 40) THEN
    NEW.risk_level = 'critical';
    NEW.flagged = TRUE;
  ELSIF (NEW.systolic_bp > 140 OR NEW.diastolic_bp > 90) OR
        (NEW.blood_sugar_fasting > 200) OR
        (NEW.spo2 IS NOT NULL AND NEW.spo2 < 95) THEN
    NEW.risk_level = 'warning';
    NEW.flagged = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vitals_flag BEFORE INSERT OR UPDATE ON public.vitals_logs
  FOR EACH ROW EXECUTE FUNCTION flag_critical_vitals();
```

### WF2 Done Checklist
- [ ] All 7 migration files created in `supabase/migrations/`
- [ ] Migrations applied to Supabase project (run in SQL editor)
- [ ] RLS policies verified — test with different user roles
- [ ] Storage bucket `lab-reports` created in Supabase dashboard
- [ ] Triggers tested: BMI auto-calc, vitals auto-flag
- [ ] TypeScript types generated: `npx supabase gen types typescript > apps/mobile/types/database.ts`
- [ ] Commit to branch `phase1/foundation`

---

## PR Instructions
When both WF1 and WF2 are complete:
```bash
git add .
git commit -m "feat(phase1): project scaffold + complete supabase schema"
git push origin phase1/foundation
# Create PR: phase1/foundation → develop
# Tag: @Agent3 for review before merge
```
