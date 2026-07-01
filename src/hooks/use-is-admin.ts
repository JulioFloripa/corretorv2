import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna true se o usuário logado tiver is_admin = true em `usuarios`.
 * null = ainda carregando, false = não é admin ou não está em `usuarios`.
 */
export function useIsAdmin(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setIsAdmin(false);
        return;
      }
      supabase
        .from("usuarios")
        .select("is_admin")
        .eq("id", session.user.id)
        .maybeSingle()
        .then(({ data }) => setIsAdmin(data?.is_admin ?? false));
    });
  }, []);

  return isAdmin;
}
