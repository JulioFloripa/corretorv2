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
    const { action, user_id, email, password, sede_id, papel, nome } = body;

    if (!user_id) return json({ error: "user_id é obrigatório" }, 400);

    if (action === "update") {
      const authUpdates: Record<string, string> = {};
      if (email?.trim()) authUpdates.email = email.trim();
      if (password?.trim()) authUpdates.password = password.trim();

      if (Object.keys(authUpdates).length > 0) {
        const { error } = await supabase.auth.admin.updateUserById(user_id, authUpdates);
        if (error) return json({ error: error.message }, 400);

        if (authUpdates.email) {
          await supabase.from("usuarios").update({ email: authUpdates.email }).eq("id", user_id);
        }
      }

      // Atualizar sede e papel se informados
      if (sede_id && papel) {
        // Legado: substitui papel na tabela papeis
        await supabase.from("papeis").delete().eq("usuario_id", user_id);
        await supabase.from("papeis").insert({ usuario_id: user_id, sede_id, papel });

        // Sincronizar user_profiles com campus_id para controle de acesso
        const { data: sedeRow } = await supabase
          .from("sedes")
          .select("nome")
          .eq("id", sede_id)
          .maybeSingle();

        if (sedeRow?.nome) {
          const { data: campusRow } = await supabase
            .from("campuses")
            .select("id")
            .eq("name", sedeRow.nome)
            .maybeSingle();

          if (campusRow?.id) {
            await supabase.from("user_profiles").upsert(
              { user_id, campus_id: campusRow.id, role: papel, display_name: nome || null },
              { onConflict: "user_id" }
            );
          }
        }
      }

      return json({ success: true });
    }

    if (action === "delete") {
      const { error } = await supabase.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 400);

      // Limpar dados relacionados (cascade via FK ou manualmente)
      await supabase.from("papeis").delete().eq("usuario_id", user_id);
      await supabase.from("user_profiles").delete().eq("user_id", user_id);
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
