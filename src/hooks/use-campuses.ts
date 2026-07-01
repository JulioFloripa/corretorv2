import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna a lista de nomes de sedes cadastradas em `sedes`, ordenadas.
 * Fonte única de verdade — a tabela `campuses` foi removida.
 */
export function useCampuses() {
  const [campuses, setCampuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("sedes")
      .select("nome")
      .order("nome")
      .then(({ data }) => {
        setCampuses((data || []).map((r: { nome: string }) => r.nome));
        setLoading(false);
      });
  }, []);

  return { campuses, loading };
}
