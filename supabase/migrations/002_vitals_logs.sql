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
