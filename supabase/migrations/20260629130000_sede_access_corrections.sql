-- Permite que coordenadores/diretores com acesso de sede ao template
-- também vejam as correções e respostas dos alunos daquele template.
-- (As políticas originais continuam ativas para o criador: uid() = user_id)

CREATE POLICY "Sede access can view corrections"
  ON public.corrections FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.template_campus_access tca
      JOIN public.papeis p ON p.sede_id = tca.sede_id
      WHERE tca.template_id = corrections.template_id
        AND p.usuario_id = auth.uid()
        AND p.papel IN ('coordenador', 'diretor')
    )
  );

CREATE POLICY "Sede access can view student_answers"
  ON public.student_answers FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.corrections c
      JOIN public.template_campus_access tca ON tca.template_id = c.template_id
      JOIN public.papeis p ON p.sede_id = tca.sede_id
      WHERE c.id = student_answers.correction_id
        AND p.usuario_id = auth.uid()
        AND p.papel IN ('coordenador', 'diretor')
    )
  );
