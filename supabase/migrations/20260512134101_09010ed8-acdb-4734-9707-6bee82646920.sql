
-- Security definer function to check admin role without triggering RLS
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = _user_id AND role = 'admin'
  )
$$;

-- Drop recursive policies on user_profiles
DROP POLICY IF EXISTS profiles_select_own ON public.user_profiles;
DROP POLICY IF EXISTS profiles_admin_manage ON public.user_profiles;

-- Recreate using the function
CREATE POLICY profiles_select_own ON public.user_profiles
FOR SELECT
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY profiles_admin_manage ON public.user_profiles
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Also fix other policies that reference user_profiles directly
DROP POLICY IF EXISTS campuses_admin_insert ON public.campuses;
CREATE POLICY campuses_admin_insert ON public.campuses
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS students_by_campus ON public.students;
CREATE POLICY students_by_campus ON public.students
FOR SELECT
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.campus_id = students.campus_id
  )
);

DROP POLICY IF EXISTS templates_visibility ON public.templates;
CREATE POLICY templates_visibility ON public.templates
FOR SELECT
USING (
  visibility = 'shared'
  OR created_by = auth.uid()
  OR public.is_admin(auth.uid())
);
