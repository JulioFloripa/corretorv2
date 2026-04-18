-- template_students
DROP POLICY IF EXISTS "Authenticated users can update template_students" ON public.template_students;
DROP POLICY IF EXISTS "Authenticated users can delete template_students" ON public.template_students;

CREATE POLICY "Authenticated users can update template_students"
  ON public.template_students FOR UPDATE
  TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete template_students"
  ON public.template_students FOR DELETE
  TO authenticated USING (auth.uid() IS NOT NULL);

-- answer_sheets
DROP POLICY IF EXISTS "Authenticated users can update answer_sheets" ON public.answer_sheets;
DROP POLICY IF EXISTS "Authenticated users can delete answer_sheets" ON public.answer_sheets;

CREATE POLICY "Authenticated users can update answer_sheets"
  ON public.answer_sheets FOR UPDATE
  TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete answer_sheets"
  ON public.answer_sheets FOR DELETE
  TO authenticated USING (auth.uid() IS NOT NULL);

-- scan_submissions
DROP POLICY IF EXISTS "Authenticated users can update scan_submissions" ON public.scan_submissions;
DROP POLICY IF EXISTS "Authenticated users can delete scan_submissions" ON public.scan_submissions;

CREATE POLICY "Authenticated users can update scan_submissions"
  ON public.scan_submissions FOR UPDATE
  TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete scan_submissions"
  ON public.scan_submissions FOR DELETE
  TO authenticated USING (auth.uid() IS NOT NULL);

-- storage objects do bucket omr-scans
DROP POLICY IF EXISTS "Authenticated users can update omr-scans" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from omr-scans" ON storage.objects;

CREATE POLICY "Authenticated users can update omr-scans"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'omr-scans' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete from omr-scans"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'omr-scans' AND auth.uid() IS NOT NULL);