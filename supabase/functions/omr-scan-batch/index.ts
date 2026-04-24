import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ScanBody {
  template_id: string;
  scan_paths: string[]; // paths no bucket omr-scans
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OMR_API_URL = Deno.env.get("OMR_API_URL");
    const OMR_API_TOKEN = Deno.env.get("OMR_API_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!OMR_API_URL || !OMR_API_TOKEN) {
      return json({ error: "OMR_API_URL ou OMR_API_TOKEN não configurados" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);
    const userId = userData.user.id;

    const body: ScanBody = await req.json();
    if (!body.template_id || !Array.isArray(body.scan_paths) || body.scan_paths.length === 0) {
      return json({ error: "template_id e scan_paths são obrigatórios" }, 400);
    }

    // Carregar template + questões pra mandar ao OMR
    const { data: template } = await supabase
      .from("templates")
      .select("id, exam_type")
      .eq("id", body.template_id)
      .maybeSingle();
    if (!template) return json({ error: "Prova não encontrada" }, 404);

    const { data: questions } = await supabase
      .from("template_questions")
      .select("question_number, question_type, num_propositions")
      .eq("template_id", body.template_id)
      .order("question_number");

    // Gerar URLs assinadas (1h) pra cada scan
    const signedScans: Array<{ scan_id: string; image_url: string; path: string }> = [];
    for (const path of body.scan_paths) {
      const { data: signed, error: signErr } = await supabase.storage
        .from("omr-scans")
        .createSignedUrl(path, 3600);
      if (signErr || !signed) {
        console.error("Erro ao assinar URL:", path, signErr);
        continue;
      }
      signedScans.push({
        scan_id: crypto.randomUUID(),
        image_url: signed.signedUrl,
        path,
      });
    }

    if (signedScans.length === 0) {
      return json({ error: "Não foi possível assinar nenhuma imagem" }, 500);
    }

    // Chamar OMR API
    const omrPayload = {
      template: {
        id: template.id,
        questions: (questions || []).map((q: any) => ({
          question_number: q.question_number,
          question_type: q.question_type,
          num_propositions: q.num_propositions,
        })),
      },
      scans: signedScans.map((s) => ({ scan_id: s.scan_id, image_url: s.image_url })),
    };

    const omrRes = await fetch(`${OMR_API_URL}/scan-batch-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fleming-Token": OMR_API_TOKEN,
      },
      body: JSON.stringify(omrPayload),
    });

    if (!omrRes.ok) {
      const errText = await omrRes.text();
      console.error("OMR API erro:", omrRes.status, errText);
      return json({ error: `OMR API retornou ${omrRes.status}: ${errText}` }, 502);
    }

    const result = await omrRes.json();
    const apiResults: any[] = result.results || [];

    // Mapear resultados de volta pros paths e gravar scan_submissions
    const scanIdToPath = new Map(signedScans.map((s) => [s.scan_id, s.path]));
    const submissionsToInsert: any[] = [];
    for (const r of apiResults) {
      const path = scanIdToPath.get(r.scan_id);
      if (!path) continue;

      // Tentar resolver student_id e answer_sheet_id via QR
      let studentDbId: string | null = null;
      let sheetDbId: string | null = null;
      if (r.qr_data?.sheet_uuid) {
        const { data: sheet } = await supabase
          .from("answer_sheets")
          .select("id, student_id")
          .eq("sheet_uuid", r.qr_data.sheet_uuid)
          .maybeSingle();
        if (sheet) {
          sheetDbId = sheet.id;
          studentDbId = sheet.student_id;
        }
      }

      submissionsToInsert.push({
        user_id: userId,
        template_id: template.id,
        student_id: studentDbId,
        answer_sheet_id: sheetDbId,
        scan_image_path: path,
        qr_data: r.qr_data || null,
        detected_answers: r.detected_answers || {},
        read_errors: r.read_errors || [],
        success: r.success !== false,
      });
    }

    const { data: inserted, error: insErr } = await supabase
      .from("scan_submissions")
      .insert(submissionsToInsert)
      .select("id");

    if (insErr) {
      console.error("Erro ao inserir submissions:", insErr);
      return json({ error: insErr.message }, 500);
    }

    return json({
      success: true,
      processed: submissionsToInsert.length,
      submission_ids: (inserted || []).map((r: any) => r.id),
      summary: {
        total: apiResults.length,
        ok: apiResults.filter((r: any) => r.success !== false).length,
        failed: apiResults.filter((r: any) => r.success === false).length,
      },
    }, 200);
  } catch (err: any) {
    console.error("Erro inesperado:", err);
    return json({ error: err.message || "Erro interno" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
