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
