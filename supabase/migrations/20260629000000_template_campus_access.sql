-- Tabela de acesso de sedes a simulados
CREATE TABLE public.template_campus_access (
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  campus_id   UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, campus_id)
);

CREATE INDEX idx_tca_template ON public.template_campus_access(template_id);
CREATE INDEX idx_tca_campus  ON public.template_campus_access(campus_id);

ALTER TABLE public.template_campus_access ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode ler (necessário para o RLS de templates funcionar)
CREATE POLICY "tca_select" ON public.template_campus_access
  FOR SELECT TO authenticated USING (true);

-- Só quem criou o template ou admin pode gerenciar os acessos
CREATE POLICY "tca_manage" ON public.template_campus_access
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_id AND t.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_id AND t.created_by = auth.uid()
    )
  );

-- Atualiza RLS de templates: inclui acesso por sede
DROP POLICY IF EXISTS templates_visibility ON public.templates;
CREATE POLICY templates_visibility ON public.templates
  FOR SELECT
  USING (
    visibility = 'shared'
    OR created_by = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.template_campus_access tca
      JOIN public.user_profiles up ON up.campus_id = tca.campus_id
      WHERE tca.template_id = templates.id
        AND up.user_id = auth.uid()
        AND up.role IN ('coordenador', 'diretor')
    )
  );

-- Coordenadores/diretores com acesso via sede também podem editar o template
DROP POLICY IF EXISTS templates_campus_write ON public.templates;
CREATE POLICY templates_campus_write ON public.templates
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.template_campus_access tca
      JOIN public.user_profiles up ON up.campus_id = tca.campus_id
      WHERE tca.template_id = templates.id
        AND up.user_id = auth.uid()
        AND up.role IN ('coordenador', 'diretor')
    )
  );
