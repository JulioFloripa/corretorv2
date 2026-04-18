
-- Add language_variant column to template_questions
-- Values: NULL (normal question), 'Inglês', or 'Espanhol'
ALTER TABLE public.template_questions 
ADD COLUMN language_variant text DEFAULT NULL;

-- Update existing foreign language questions to be the 'Inglês' variant
UPDATE public.template_questions 
SET language_variant = 'Inglês', subject = 'Língua Estrangeira'
WHERE subject = 'Inglês';
