ALTER TABLE public.scan_submissions
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS template_type text;