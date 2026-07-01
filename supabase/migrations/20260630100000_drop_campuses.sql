-- Remove a tabela legada `campuses`.
-- A tabela `sedes` é a única fonte de verdade para sedes/campus.
-- O hook useCampuses() já foi atualizado para ler de `sedes.nome`.
-- A normalização de campus em importações de planilha também usa `sedes`.

DROP TABLE IF EXISTS public.campuses;
