-- Tabela de turmas
CREATE TABLE public.classes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campus TEXT NOT NULL,
  name TEXT NOT NULL,
  year INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (campus, name, year)
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view classes"
  ON public.classes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert classes"
  ON public.classes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update classes"
  ON public.classes FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete classes"
  ON public.classes FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_classes_updated_at
  BEFORE UPDATE ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_classes_campus ON public.classes(campus);

-- Vincular aluno a turma
ALTER TABLE public.students
  ADD COLUMN class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

CREATE INDEX idx_students_class_id ON public.students(class_id);