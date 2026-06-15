import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const token = authHeader.replace("Bearer ", "");
    try {
      const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(b64));
      if (!payload.sub) throw new Error("sub ausente");
    } catch {
      return json({ error: "Sessão inválida" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { action, user_id, email, password } = body;

    if (!user_id) return json({ error: "user_id é obrigatório" }, 400);

    if (action === "update") {
      const updates: Record<string, string> = {};
      if (email?.trim()) updates.email = email.trim();
      if (password?.trim()) updates.password = password.trim();

      if (Object.keys(updates).length === 0) {
        return json({ error: "Informe email ou senha para atualizar" }, 400);
      }

      const { error } = await supabase.auth.admin.updateUserById(user_id, updates);
      if (error) return json({ error: error.message }, 400);

      // Sincronizar email em public.usuarios se foi alterado
      if (updates.email) {
        await supabase.from("usuarios").update({ email: updates.email }).eq("id", user_id);
      }

      return json({ success: true });
    }

    if (action === "delete") {
      const { error } = await supabase.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 400);

      // Limpar dados relacionados (cascade via FK ou manualmente)
      await supabase.from("papeis").delete().eq("usuario_id", user_id);
      await supabase.from("usuarios").delete().eq("id", user_id);

      return json({ success: true });
    }

    return json({ error: "action inválida. Use: update ou delete" }, 400);
  } catch (err: any) {
    return json({ error: err.message || "Erro interno" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
