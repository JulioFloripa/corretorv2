-- Corrige a migração anterior (sintaxe inválida com unnest no WHERE).
-- Insere na tabela sedes todas as sedes que ainda não existem lá,
-- incluindo as que estão em classes.campus (fonte de verdade do Turmas).

-- Parte 1: sedes conhecidas fixas
INSERT INTO public.sedes (nome)
SELECT t.nome
FROM (VALUES
  ('Canoas'),
  ('Caxias do Sul'),
  ('Chapecó'),
  ('Criciúma'),
  ('Curitiba'),
  ('Fleming Floripa'),
  ('Florianópolis'),
  ('Passo Fundo'),
  ('Pelotas'),
  ('Porto Alegre'),
  ('Santa Maria')
) AS t(nome)
WHERE t.nome NOT IN (
  SELECT nome FROM public.sedes WHERE nome IS NOT NULL
);

-- Parte 2: qualquer sede presente em classes.campus que ainda não esteja em sedes
INSERT INTO public.sedes (nome)
SELECT DISTINCT c.campus
FROM public.classes c
WHERE c.campus IS NOT NULL
  AND c.campus <> ''
  AND c.campus NOT IN (
    SELECT nome FROM public.sedes WHERE nome IS NOT NULL
  );
