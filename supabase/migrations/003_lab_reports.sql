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
