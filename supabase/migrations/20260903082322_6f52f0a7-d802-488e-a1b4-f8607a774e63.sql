ALTER TABLE public.report_settings
  ADD COLUMN cron_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex');