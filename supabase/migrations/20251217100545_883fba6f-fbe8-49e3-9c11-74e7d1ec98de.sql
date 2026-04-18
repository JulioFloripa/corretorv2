-- Adicionar coluna subject para disciplina em template_questions
ALTER TABLE public.template_questions 
ADD COLUMN subject TEXT;

-- Criar tipo enum para disciplinas ACAFE
COMMENT ON COLUMN public.template_questions.subject IS 'Disciplina da questão: portugues, matematica, historia, geografia, fisica, quimica, biologia, ingles';