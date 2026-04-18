ALTER TABLE public.template_questions 
ADD COLUMN question_type text NOT NULL DEFAULT 'objective',
ADD COLUMN num_propositions integer NULL;