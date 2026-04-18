
-- Step 1: Merge duplicates - keep the most complete record per student_id
-- First, for each student_id with duplicates, update the "best" record with any missing data from others
WITH ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY student_id 
      ORDER BY 
        (CASE WHEN campus IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN foreign_language IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) DESC,
        created_at ASC
    ) as rn
  FROM students
  WHERE student_id IS NOT NULL AND student_id != ''
),
best AS (
  SELECT id, student_id FROM ranked WHERE rn = 1
),
fill_data AS (
  SELECT DISTINCT ON (r.student_id)
    b.id as target_id,
    COALESCE(
      (SELECT s.campus FROM students s WHERE s.student_id = r.student_id AND s.campus IS NOT NULL LIMIT 1),
      NULL
    ) as best_campus,
    COALESCE(
      (SELECT s.foreign_language FROM students s WHERE s.student_id = r.student_id AND s.foreign_language IS NOT NULL LIMIT 1),
      NULL
    ) as best_language,
    COALESCE(
      (SELECT s.email FROM students s WHERE s.student_id = r.student_id AND s.email IS NOT NULL LIMIT 1),
      NULL
    ) as best_email,
    COALESCE(
      (SELECT s.name FROM students s WHERE s.student_id = r.student_id AND s.campus IS NOT NULL ORDER BY created_at LIMIT 1),
      (SELECT s.name FROM students s WHERE s.student_id = r.student_id ORDER BY created_at LIMIT 1)
    ) as best_name
  FROM ranked r
  JOIN best b ON b.student_id = r.student_id
  WHERE r.rn = 1
)
UPDATE students SET
  campus = fill_data.best_campus,
  foreign_language = fill_data.best_language,
  email = fill_data.best_email,
  name = fill_data.best_name
FROM fill_data
WHERE students.id = fill_data.target_id;

-- Step 2: Delete duplicate records (keep only rn=1)
DELETE FROM students
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY student_id 
        ORDER BY 
          (CASE WHEN campus IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN foreign_language IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) DESC,
          created_at ASC
      ) as rn
    FROM students
    WHERE student_id IS NOT NULL AND student_id != ''
  ) ranked
  WHERE rn > 1
);

-- Step 3: Add unique constraint on student_id (allowing NULLs)
CREATE UNIQUE INDEX idx_students_student_id_unique ON students (student_id) WHERE student_id IS NOT NULL AND student_id != '';

-- Step 4: Update RLS - allow all authenticated users to read all students
DROP POLICY IF EXISTS "Users can view own students" ON students;
CREATE POLICY "Authenticated users can view all students" ON students
  FOR SELECT TO authenticated
  USING (true);

-- Keep insert/update/delete restricted to owner
-- (existing policies already handle this)
