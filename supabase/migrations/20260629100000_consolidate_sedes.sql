-- Consolida a lista de sedes: usa a tabela `sedes` como fonte única de verdade.
-- O painel "Acesso por Sede" em TemplateEdit e as políticas de acesso a templates
-- passam a usar `sedes.id` em vez de `campuses.id`.

-- 1. Insere na tabela sedes todas as sedes encontradas em classes.campus que ainda
--    não existem lá, garantindo uma lista unificada.
INSERT INTO public.sedes (nome)
SELECT DISTINCT campus
FROM public.classes
WHERE campus IS NOT NULL
  AND campus <> ''
  AND campus NOT IN (SELECT nome FROM public.sedes WHERE nome IS NOT NULL)
ON CONFLICT DO NOTHING;

-- 2. Recria template_campus_access referenciando sedes em vez de campuses.
--    Registros anteriores são descartados (feature acabou de ser lançada, sem dados reais).
DROP TABLE IF EXISTS public.template_campus_access;

CREATE TABLE public.template_campus_access (
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  sede_id     UUID NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, sede_id)
);

CREATE INDEX idx_tca_template ON public.template_campus_access(template_id);
CREATE INDEX idx_tca_sede     ON public.template_campus_access(sede_id);

ALTER TABLE public.template_campus_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tca_select" ON public.template_campus_access
  FOR SELECT TO authenticated USING (true);

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

-- 3. Atualiza RLS de templates: acesso via sede usa papeis/sedes diretamente,
--    sem passar por user_profiles/campuses.
--
--    Regras de acesso:
--      - Criador: leitura + edição completa do template
--      - Admin: leitura + edição completa
--      - Coordenador/Diretor com sede liberada: somente leitura
--        (edição de respostas passa por corrections/student_answers, não por templates)
--      - visibility='shared': leitura por qualquer autenticado

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
      JOIN public.papeis p ON p.sede_id = tca.sede_id
      WHERE tca.template_id = templates.id
        AND p.usuario_id = auth.uid()
        AND p.papel IN ('coordenador', 'diretor')
    )
  );

-- Somente criador e admin podem editar o template (questões, gabarito, etc.)
DROP POLICY IF EXISTS templates_campus_write ON public.templates;
CREATE POLICY templates_update ON public.templates
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_admin(auth.uid())
  );
