
-- Drop the unique constraint that prevents dual language variants per question
ALTER TABLE public.template_questions DROP CONSTRAINT IF EXISTS template_questions_template_id_question_number_key;

-- Add a new unique constraint that includes language_variant
-- This allows two rows per question (one per language) but prevents true duplicates
CREATE UNIQUE INDEX template_questions_unique_variant 
ON public.template_questions (template_id, question_number, COALESCE(language_variant, '__none__'));
