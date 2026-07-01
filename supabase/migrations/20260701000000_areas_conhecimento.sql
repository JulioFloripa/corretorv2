-- Cria tabela de Áreas de Conhecimento e reorganiza disciplinas.
--
-- 1. Cria `areas_conhecimento` com as 4 áreas do ENEM
-- 2. Adiciona `area_id` em `disciplinas`
-- 3. Mapeia cada disciplina para sua área
-- 4. Remove as linhas "área" que estavam misturadas em `disciplinas`

-- ── Tabela de áreas ──────────────────────────────────────────────────────────
CREATE TABLE public.areas_conhecimento (
  id    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome  TEXT        NOT NULL UNIQUE,
  cor   TEXT,
  icone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.areas_conhecimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view areas"
  ON public.areas_conhecimento FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert areas"
  ON public.areas_conhecimento FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update areas"
  ON public.areas_conhecimento FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete areas"
  ON public.areas_conhecimento FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ── Semear as 4 áreas do ENEM ────────────────────────────────────────────────
INSERT INTO public.areas_conhecimento (id, nome, cor, icone) VALUES
  ('ac000001-0000-0000-0000-000000000001', 'Linguagens, Códigos e suas Tecnologias',    '#b45309', '📝'),
  ('ac000002-0000-0000-0000-000000000002', 'Ciências Humanas e suas Tecnologias',        '#4338ca', '🌐'),
  ('ac000003-0000-0000-0000-000000000003', 'Ciências da Natureza e suas Tecnologias',   '#0e7490', '🔬'),
  ('ac000004-0000-0000-0000-000000000004', 'Matemática e suas Tecnologias',              '#1a6040', '📐');

-- ── Adicionar FK em disciplinas ───────────────────────────────────────────────
ALTER TABLE public.disciplinas
  ADD COLUMN area_id UUID REFERENCES public.areas_conhecimento(id) ON DELETE SET NULL;

CREATE INDEX idx_disciplinas_area_id ON public.disciplinas(area_id);

-- ── Mapear disciplinas existentes ─────────────────────────────────────────────
UPDATE public.disciplinas SET area_id = 'ac000001-0000-0000-0000-000000000001'
  WHERE nome IN (
    'Língua Portuguesa', 'Literatura', 'Literatura Brasileira',
    'Arte', 'Educação Física',
    'Língua Inglesa', 'Inglês',
    'Língua Espanhola', 'Espanhol',
    'Português', 'Redação',
    'Linguagens, Códigos e suas Tecnologias'
  );

UPDATE public.disciplinas SET area_id = 'ac000002-0000-0000-0000-000000000002'
  WHERE nome IN (
    'História', 'Geografia', 'Filosofia', 'Sociologia',
    'Ciências Humanas e suas Tecnologias'
  );

UPDATE public.disciplinas SET area_id = 'ac000003-0000-0000-0000-000000000003'
  WHERE nome IN (
    'Biologia', 'Física', 'Química', 'Ciências',
    'Ciências da Natureza e suas Tecnologias'
  );

UPDATE public.disciplinas SET area_id = 'ac000004-0000-0000-0000-000000000004'
  WHERE nome IN (
    'Matemática',
    'Matemática e suas Tecnologias'
  );

-- ── Remover linhas que eram "áreas" dentro de disciplinas ────────────────────
-- Primeiro remove assuntos ligados a elas (eram apenas entradas de teste).
DELETE FROM public.assuntos
  WHERE disciplina_id IN (
    SELECT id FROM public.disciplinas
    WHERE nome IN (
      'Linguagens, Códigos e suas Tecnologias',
      'Ciências Humanas e suas Tecnologias',
      'Ciências da Natureza e suas Tecnologias',
      'Matemática e suas Tecnologias'
    )
  );

DELETE FROM public.disciplinas
  WHERE nome IN (
    'Linguagens, Códigos e suas Tecnologias',
    'Ciências Humanas e suas Tecnologias',
    'Ciências da Natureza e suas Tecnologias',
    'Matemática e suas Tecnologias'
  );
