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
