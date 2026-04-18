-- Normalize campus values to uppercase standard
UPDATE students SET campus = 'CRICIÚMA' WHERE campus = 'Criciúma';
UPDATE students SET campus = UPPER(TRIM(campus)) WHERE campus IS NOT NULL;