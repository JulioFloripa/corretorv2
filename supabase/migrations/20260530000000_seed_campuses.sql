-- Popula sedes faltantes na tabela campuses
INSERT INTO campuses (name)
VALUES
  ('CHAPECÓ'),
  ('CRICIÚMA'),
  ('ON-LINE'),
  ('PORTO ALEGRE')
ON CONFLICT (name) DO NOTHING;
