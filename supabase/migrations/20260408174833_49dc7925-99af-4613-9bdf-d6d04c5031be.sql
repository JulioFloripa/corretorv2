-- Normalize student_name in corrections to match the official name in students table
-- based on matching student_id (matrícula)
UPDATE corrections c
SET student_name = s.name
FROM students s
WHERE c.student_id IS NOT NULL
  AND c.student_id != ''
  AND c.student_id = s.student_id
  AND c.student_name != s.name;