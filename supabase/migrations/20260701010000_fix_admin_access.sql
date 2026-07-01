-- Corrige acesso de administrador.
--
-- Problema: is_admin() consultava `user_profiles` que está vazia,
-- então retornava false para todos, incluindo o admin.
--
-- Solução:
--   1. Adiciona is_admin à tabela `usuarios`
--   2. Reescreve is_admin() para consultar `usuarios`
--   3. Adiciona bypass de admin nas tabelas que ainda não têm
--   4. Garante que admin pode escrever (update/delete) em todas as tabelas

-- ── 1. Campo is_admin em usuarios ────────────────────────────────────────────
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.usuarios
  SET is_admin = TRUE
  WHERE email = 'admin@flemingfloripa.com.br';

-- ── 2. Reescrever is_admin() ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.usuarios WHERE id = _user_id),
    false
  )
$$;

-- ── 3. disciplines: adicionar bypass de admin ─────────────────────────────────
DROP POLICY IF EXISTS "Users can view own disciplines"   ON public.disciplines;
DROP POLICY IF EXISTS "Users can create disciplines"     ON public.disciplines;
DROP POLICY IF EXISTS "Users can update own disciplines" ON public.disciplines;
DROP POLICY IF EXISTS "Users can delete own disciplines" ON public.disciplines;

CREATE POLICY "disciplines_select" ON public.disciplines FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "disciplines_insert" ON public.disciplines FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "disciplines_update" ON public.disciplines FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "disciplines_delete" ON public.disciplines FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- ── 4. discipline_topics: adicionar bypass de admin ───────────────────────────
DROP POLICY IF EXISTS "Users can view own topics"   ON public.discipline_topics;
DROP POLICY IF EXISTS "Users can create topics"     ON public.discipline_topics;
DROP POLICY IF EXISTS "Users can update own topics" ON public.discipline_topics;
DROP POLICY IF EXISTS "Users can delete own topics" ON public.discipline_topics;

CREATE POLICY "topics_select" ON public.discipline_topics FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.disciplines d
      WHERE d.id = discipline_topics.discipline_id AND d.user_id = auth.uid()
    )
  );
CREATE POLICY "topics_insert" ON public.discipline_topics FOR INSERT
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.disciplines d
      WHERE d.id = discipline_topics.discipline_id AND d.user_id = auth.uid()
    )
  );
CREATE POLICY "topics_update" ON public.discipline_topics FOR UPDATE
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.disciplines d
      WHERE d.id = discipline_topics.discipline_id AND d.user_id = auth.uid()
    )
  );
CREATE POLICY "topics_delete" ON public.discipline_topics FOR DELETE
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.disciplines d
      WHERE d.id = discipline_topics.discipline_id AND d.user_id = auth.uid()
    )
  );

-- ── 5. corrections: admin pode editar/excluir qualquer correção ───────────────
DROP POLICY IF EXISTS "Users can update own corrections" ON public.corrections;
DROP POLICY IF EXISTS "Users can delete own corrections" ON public.corrections;

CREATE POLICY "corrections_update" ON public.corrections FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "corrections_delete" ON public.corrections FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- ── 6. templates: admin pode excluir qualquer template ───────────────────────
DROP POLICY IF EXISTS "Users can delete own templates" ON public.templates;
CREATE POLICY "templates_delete" ON public.templates FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- ── 7. profiles: admin pode ver todos os perfis ──────────────────────────────
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- ── 8. usuarios: admin pode ver e gerir todos ────────────────────────────────
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_delete" ON public.usuarios;

CREATE POLICY "usuarios_select" ON public.usuarios FOR SELECT
  TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "usuarios_update" ON public.usuarios FOR UPDATE
  TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "usuarios_delete" ON public.usuarios FOR DELETE
  TO authenticated USING (public.is_admin(auth.uid()));
