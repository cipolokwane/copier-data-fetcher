CREATE TABLE public.report_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  smtp_host TEXT NOT NULL DEFAULT '',
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_secure BOOLEAN NOT NULL DEFAULT false,
  smtp_username TEXT NOT NULL DEFAULT '',
  smtp_password TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT 'Canon Fleet Reports',
  to_emails TEXT[] NOT NULL DEFAULT ARRAY['sales1@telnetoffice.co.za']::TEXT[],
  cc_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  subject_prefix TEXT NOT NULL DEFAULT 'Canon Copier Fleet Report',
  daily_enabled BOOLEAN NOT NULL DEFAULT true,
  send_hour_utc INTEGER NOT NULL DEFAULT 5,
  send_minute_utc INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_settings_singleton CHECK (id = 1)
);

GRANT ALL ON public.report_settings TO service_role;
ALTER TABLE public.report_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'running',
  device_count INTEGER,
  recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  provider TEXT,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.report_runs TO service_role;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX report_runs_created_at_idx ON public.report_runs (created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_report_settings()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER report_settings_touch
BEFORE UPDATE ON public.report_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_report_settings();

INSERT INTO public.report_settings (id) VALUES (1);