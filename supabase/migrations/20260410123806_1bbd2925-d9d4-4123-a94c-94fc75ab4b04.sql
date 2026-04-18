-- Drop restrictive policies
DROP POLICY IF EXISTS "Users can delete own students" ON public.students;
DROP POLICY IF EXISTS "Users can update own students" ON public.students;

-- Allow any authenticated user to update students
CREATE POLICY "Authenticated users can update students"
ON public.students FOR UPDATE
TO authenticated
USING (true);

-- Allow any authenticated user to delete students
CREATE POLICY "Authenticated users can delete students"
ON public.students FOR DELETE
TO authenticated
USING (true);