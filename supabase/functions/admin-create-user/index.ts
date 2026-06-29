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
    let callerId: string;
    try {
      const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(b64));
      callerId = payload.sub;
      if (!callerId) throw new Error("sub ausente");
    } catch {
      return json({ error: "Sessão inválida" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { nome, email, password, sede_id, papel } = body;

    if (!nome || !email || !password || !sede_id || !papel) {
      return json({ error: "nome, email, password, sede_id e papel são obrigatórios" }, 400);
    }

    // Criar usuário no auth.users — trigger sincroniza para public.usuarios automaticamente
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (createErr) {
      return json({ error: createErr.message }, 400);
    }

    const newUserId = created.user.id;

    // Atribuir papel na sede (legado)
    const { error: papelErr } = await supabase
      .from("papeis")
      .insert({ usuario_id: newUserId, sede_id, papel });

    if (papelErr) {
      return json({ error: `Usuário criado mas erro ao atribuir papel: ${papelErr.message}` }, 500);
    }

    return json({ success: true, user_id: newUserId });
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
