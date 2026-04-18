-- Allow users to update their own student answers
CREATE POLICY "Users can update answers of own corrections"
ON public.student_answers
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM corrections
  WHERE corrections.id = student_answers.correction_id
  AND corrections.user_id = auth.uid()
));

-- Allow users to delete their own student answers
CREATE POLICY "Users can delete answers of own corrections"
ON public.student_answers
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM corrections
  WHERE corrections.id = student_answers.correction_id
  AND corrections.user_id = auth.uid()
));