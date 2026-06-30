-- As constraints originais só permitiam respostas A-E, mas o frontend já suporta
-- tipos de questão adicionados depois (summation/Somatório, true_false, open_numeric)
-- que usam respostas numéricas de 2 dígitos (00-99) ou V/F.
-- Isso bloqueava o salvamento de templates UFSC com questões de Somatório.

ALTER TABLE public.template_questions
  DROP CONSTRAINT IF EXISTS template_questions_correct_answer_check;
ALTER TABLE public.template_questions
  ADD CONSTRAINT template_questions_correct_answer_check
  CHECK (correct_answer ~ '^([A-E]|[VF]|[0-9]{1,2})$');

ALTER TABLE public.student_answers
  DROP CONSTRAINT IF EXISTS student_answers_student_answer_check;
ALTER TABLE public.student_answers
  ADD CONSTRAINT student_answers_student_answer_check
  CHECK (student_answer IS NULL OR student_answer ~ '^([A-E]|[VF]|X|[0-9]{1,2})$');
