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
