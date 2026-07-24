
ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_duration_check
  CHECK (duration_minutes IN (15, 30, 45, 60));

ALTER TABLE public.interview_session_state
  ALTER COLUMN turn_state SET DEFAULT 'listening'::turn_state;

ALTER TABLE public.reports
  ALTER COLUMN overall_score TYPE numeric,
  ALTER COLUMN communication_score TYPE numeric;
