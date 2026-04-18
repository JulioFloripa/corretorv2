
-- Tabela de disciplinas
CREATE TABLE public.disciplines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.disciplines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own disciplines" ON public.disciplines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create disciplines" ON public.disciplines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own disciplines" ON public.disciplines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own disciplines" ON public.disciplines FOR DELETE USING (auth.uid() = user_id);

-- Tabela de tópicos/conteúdos vinculados a disciplinas
CREATE TABLE public.discipline_topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  discipline_id UUID NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.discipline_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own topics" ON public.discipline_topics FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.disciplines WHERE disciplines.id = discipline_topics.discipline_id AND disciplines.user_id = auth.uid()));
CREATE POLICY "Users can create topics" ON public.discipline_topics FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.disciplines WHERE disciplines.id = discipline_topics.discipline_id AND disciplines.user_id = auth.uid()));
CREATE POLICY "Users can update own topics" ON public.discipline_topics FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.disciplines WHERE disciplines.id = discipline_topics.discipline_id AND disciplines.user_id = auth.uid()));
CREATE POLICY "Users can delete own topics" ON public.discipline_topics FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.disciplines WHERE disciplines.id = discipline_topics.discipline_id AND disciplines.user_id = auth.uid()));

-- Índice único para evitar disciplinas duplicadas por usuário
CREATE UNIQUE INDEX idx_disciplines_user_name ON public.disciplines(user_id, name);
-- Índice único para evitar tópicos duplicados por disciplina
CREATE UNIQUE INDEX idx_topics_discipline_name ON public.discipline_topics(discipline_id, name);
