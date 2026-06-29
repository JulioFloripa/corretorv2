-- Fix: usuários com acesso de sede não conseguiam ver template_questions
-- e portanto o boletim mostrava todos os scores como 0.
-- A policy original só permite user_id = auth.uid() (criador).
-- Esta migração adiciona acesso via sede usando funções SECURITY DEFINER
-- para evitar recursão de RLS.

-- Garante que as funções SECURITY DEFINER existam (idempotente)
CREATE OR REPLACE FUNCTION public.can_access_template_as_sede(_template_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.template_campus_access tca
    JOIN public.papeis p ON p.sede_id = tca.sede_id
    WHERE tca.template_id = _template_id
      AND p.usuario_id = _user_id
      AND p.papel IN ('coordenador', 'diretor')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_correction_as_sede(_correction_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.corrections c
    JOIN public.template_campus_access tca ON tca.template_id = c.template_id
    JOIN public.papeis p ON p.sede_id = tca.sede_id
    WHERE c.id = _correction_id
      AND p.usuario_id = _user_id
      AND p.papel IN ('coordenador', 'diretor')
  )
$$;

-- Permite que coordenadores/diretores com acesso de sede leiam as questões
DROP POLICY IF EXISTS "Sede access can view template_questions" ON public.template_questions;
CREATE POLICY "Sede access can view template_questions"
  ON public.template_questions FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.can_access_template_as_sede(template_questions.template_id, auth.uid())
  );

-- Recria políticas de corrections e student_answers com SECURITY DEFINER
DROP POLICY IF EXISTS "Sede access can view corrections" ON public.corrections;
CREATE POLICY "Sede access can view corrections"
  ON public.corrections FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.can_access_template_as_sede(template_id, auth.uid())
  );

DROP POLICY IF EXISTS "Sede access can view student_answers" ON public.student_answers;
CREATE POLICY "Sede access can view student_answers"
  ON public.student_answers FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.can_access_correction_as_sede(correction_id, auth.uid())
  );
