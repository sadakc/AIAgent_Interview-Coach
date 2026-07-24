
-- Enums
CREATE TYPE public.session_status AS ENUM ('in_progress','completed','abandoned');
CREATE TYPE public.turn_type AS ENUM ('question','follow_up','answer');
CREATE TYPE public.turn_state AS ENUM ('idle','listening','thinking','speaking','ended');
CREATE TYPE public.theme_preference AS ENUM ('light','dark','system');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  font_scale NUMERIC NOT NULL DEFAULT 1.0,
  push_to_talk_default BOOLEAN NOT NULL DEFAULT false,
  theme_preference public.theme_preference NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Interview sessions
CREATE TABLE public.interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_description_raw TEXT NOT NULL,
  job_description_parsed JSONB,
  duration_minutes INTEGER NOT NULL,
  status public.session_status NOT NULL DEFAULT 'in_progress',
  role_title TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_sessions TO authenticated;
GRANT ALL ON public.interview_sessions TO service_role;
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.interview_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.interview_sessions (user_id, started_at DESC);

-- Turns
CREATE TABLE public.turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  question_index INTEGER,
  type public.turn_type NOT NULL,
  text TEXT NOT NULL,
  audio_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.turns TO authenticated;
GRANT ALL ON public.turns TO service_role;
ALTER TABLE public.turns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own turns" ON public.turns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = turns.session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = turns.session_id AND s.user_id = auth.uid()));
CREATE INDEX ON public.turns (session_id, sequence_number);

-- Reports
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  overall_score INTEGER NOT NULL,
  communication_score INTEGER NOT NULL,
  per_question_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_improvements JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reports" ON public.reports FOR ALL
  USING (EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = reports.session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = reports.session_id AND s.user_id = auth.uid()));

-- Live session state
CREATE TABLE public.interview_session_state (
  session_id UUID PRIMARY KEY REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  question_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  follow_up_count INTEGER NOT NULL DEFAULT 0,
  turn_state public.turn_state NOT NULL DEFAULT 'idle',
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_session_state TO authenticated;
GRANT ALL ON public.interview_session_state TO service_role;
ALTER TABLE public.interview_session_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own state" ON public.interview_session_state FOR ALL
  USING (EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = interview_session_state.session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = interview_session_state.session_id AND s.user_id = auth.uid()));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.interview_session_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.turns;
