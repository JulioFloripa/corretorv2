-- ============================================================
-- TABELA: template_students (matrícula explícita aluno x prova)
-- ============================================================
CREATE TABLE public.template_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL,
  student_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(template_id, student_id)
);

CREATE INDEX idx_template_students_template ON public.template_students(template_id);
CREATE INDEX idx_template_students_student ON public.template_students(student_id);

ALTER TABLE public.template_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view template_students"
  ON public.template_students FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert template_students"
  ON public.template_students FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update template_students"
  ON public.template_students FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete template_students"
  ON public.template_students FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- TABELA: answer_sheets (PDFs gerados de gabaritos)
-- ============================================================
CREATE TABLE public.answer_sheets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL,
  student_id UUID NOT NULL,
  user_id UUID NOT NULL,
  sheet_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  pdf_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(template_id, student_id)
);

CREATE INDEX idx_answer_sheets_template ON public.answer_sheets(template_id);
CREATE INDEX idx_answer_sheets_student ON public.answer_sheets(student_id);
CREATE INDEX idx_answer_sheets_status ON public.answer_sheets(status);
CREATE INDEX idx_answer_sheets_uuid ON public.answer_sheets(sheet_uuid);

ALTER TABLE public.answer_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view answer_sheets"
  ON public.answer_sheets FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert answer_sheets"
  ON public.answer_sheets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update answer_sheets"
  ON public.answer_sheets FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete answer_sheets"
  ON public.answer_sheets FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- TABELA: scan_submissions (imagens escaneadas + leituras OMR)
-- ============================================================
CREATE TABLE public.scan_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL,
  student_id UUID,
  answer_sheet_id UUID,
  user_id UUID NOT NULL,

  scan_image_path TEXT NOT NULL,
  qr_data JSONB,
  detected_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_errors TEXT[] DEFAULT ARRAY[]::TEXT[],
  success BOOLEAN NOT NULL DEFAULT true,

  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  manual_corrections JSONB DEFAULT '{}'::jsonb,
  discarded BOOLEAN NOT NULL DEFAULT false,

  correction_id UUID,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_scan_submissions_template ON public.scan_submissions(template_id);
CREATE INDEX idx_scan_submissions_student ON public.scan_submissions(student_id);
CREATE INDEX idx_scan_submissions_pending ON public.scan_submissions(reviewed) WHERE NOT reviewed AND NOT discarded;

ALTER TABLE public.scan_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scan_submissions"
  ON public.scan_submissions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert scan_submissions"
  ON public.scan_submissions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update scan_submissions"
  ON public.scan_submissions FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete scan_submissions"
  ON public.scan_submissions FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- Triggers de updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_answer_sheets_updated_at
  BEFORE UPDATE ON public.answer_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_scan_submissions_updated_at
  BEFORE UPDATE ON public.scan_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Storage bucket para scans
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('omr-scans', 'omr-scans', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can read omr-scans"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'omr-scans');

CREATE POLICY "Authenticated users can upload to omr-scans"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'omr-scans');

CREATE POLICY "Authenticated users can update omr-scans"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'omr-scans');

CREATE POLICY "Authenticated users can delete from omr-scans"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'omr-scans');