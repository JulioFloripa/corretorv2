
-- Create students table
CREATE TABLE public.students (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  student_id text, -- matrícula
  campus text, -- sede
  foreign_language text, -- língua estrangeira
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own students" ON public.students FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create students" ON public.students FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own students" ON public.students FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own students" ON public.students FOR DELETE USING (auth.uid() = user_id);

-- Unique constraint on student_id per user
CREATE UNIQUE INDEX idx_students_user_student_id ON public.students (user_id, student_id) WHERE student_id IS NOT NULL;

-- Timestamp trigger
CREATE TRIGGER update_students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
