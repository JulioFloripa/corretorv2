import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna a lista de nomes de sedes cadastradas em `campuses`, ordenadas.
 * Enquanto carrega, `campuses` é um array vazio e `loading` é true.
 */
export function useCampuses() {
  const [campuses, setCampuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("campuses")
      .select("name")
      .order("name")
      .then(({ data }) => {
        setCampuses((data || []).map((r: { name: string }) => r.name));
        setLoading(false);
      });
  }, []);

  return { campuses, loading };
}
