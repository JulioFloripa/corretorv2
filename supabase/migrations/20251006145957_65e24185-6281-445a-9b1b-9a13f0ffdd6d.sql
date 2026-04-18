-- Criar tabela de perfis de usuários
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trigger para criar perfil automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuário'),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Criar tabela de gabaritos
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  total_questions INTEGER NOT NULL,
  exam_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON public.templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create templates"
  ON public.templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON public.templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON public.templates FOR DELETE
  USING (auth.uid() = user_id);

-- Criar tabela de questões do gabarito
CREATE TABLE public.template_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  correct_answer TEXT NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D', 'E')),
  points DECIMAL(5,2) DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(template_id, question_number)
);

ALTER TABLE public.template_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view questions of own templates"
  ON public.template_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.templates
      WHERE templates.id = template_questions.template_id
      AND templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create questions for own templates"
  ON public.template_questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.templates
      WHERE templates.id = template_questions.template_id
      AND templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update questions of own templates"
  ON public.template_questions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.templates
      WHERE templates.id = template_questions.template_id
      AND templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete questions of own templates"
  ON public.template_questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.templates
      WHERE templates.id = template_questions.template_id
      AND templates.user_id = auth.uid()
    )
  );

-- Criar tabela de correções
CREATE TABLE public.corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_id TEXT,
  total_score DECIMAL(5,2),
  max_score DECIMAL(5,2),
  percentage DECIMAL(5,2),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own corrections"
  ON public.corrections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create corrections"
  ON public.corrections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own corrections"
  ON public.corrections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own corrections"
  ON public.corrections FOR DELETE
  USING (auth.uid() = user_id);

-- Criar tabela de respostas dos alunos
CREATE TABLE public.student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_id UUID NOT NULL REFERENCES public.corrections(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  student_answer TEXT CHECK (student_answer IN ('A', 'B', 'C', 'D', 'E', 'X')),
  correct_answer TEXT NOT NULL,
  is_correct BOOLEAN,
  points_earned DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(correction_id, question_number)
);

ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view answers of own corrections"
  ON public.student_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.corrections
      WHERE corrections.id = student_answers.correction_id
      AND corrections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create answers for own corrections"
  ON public.student_answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.corrections
      WHERE corrections.id = student_answers.correction_id
      AND corrections.user_id = auth.uid()
    )
  );

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers para updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_corrections_updated_at
  BEFORE UPDATE ON public.corrections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();