-- Tabela de acesso de sedes a simulados (M:N entre templates e sedes)
-- Nota: este arquivo foi superado por 20260629100000_consolidate_sedes.sql
-- que recriou a tabela com sede_id → sedes em vez de campus_id → campuses.
-- Mantido apenas como histórico da intenção original.

CREATE TABLE IF NOT EXISTS public.template_campus_access (
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  sede_id     UUID NOT NULL REFERENCES public.sedes(id)    ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, sede_id)
);

CREATE INDEX IF NOT EXISTS idx_tca_template ON public.template_campus_access(template_id);
CREATE INDEX IF NOT EXISTS idx_tca_sede     ON public.template_campus_access(sede_id);

ALTER TABLE public.template_campus_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tca_select" ON public.template_campus_access
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tca_manage" ON public.template_campus_access
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS templates_visibility ON public.templates;
CREATE POLICY templates_visibility ON public.templates
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.template_campus_access tca
      JOIN public.papeis p ON p.sede_id = tca.sede_id
      WHERE tca.template_id = templates.id
        AND p.usuario_id = auth.uid()
        AND p.papel IN ('coordenador', 'diretor')
    )
  );

DROP POLICY IF EXISTS templates_campus_write ON public.templates;
DROP POLICY IF EXISTS templates_update       ON public.templates;
CREATE POLICY templates_update ON public.templates
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
  );
