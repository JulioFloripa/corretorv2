-- Garante que todas as sedes visíveis na tela de Turmas existam também
-- na tabela sedes (usada no cadastro/edição de usuários).
-- Usa NOT IN para não duplicar entradas já existentes.

INSERT INTO public.sedes (nome)
SELECT unnest(ARRAY[
  'Canoas',
  'Caxias do Sul',
  'Chapecó',
  'Criciúma',
  'Curitiba',
  'Fleming Floripa',
  'Florianópolis',
  'Passo Fundo',
  'Pelotas',
  'Porto Alegre',
  'Santa Maria'
]) AS nome
WHERE unnest NOT IN (
  SELECT nome FROM public.sedes WHERE nome IS NOT NULL
);
