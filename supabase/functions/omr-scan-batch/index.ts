import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { data: template } = await supabase
      .from("templates")
      .select("id, exam_type")
      .eq("id", body.template_id)
      .maybeSingle();
    if (!template) return json({ error: "Prova não encontrada" }, 404);

    // v5: gerar signed URLs para cada scan e enviar via /scan-batch-url
    const scanFiles: Array<{ scan_id: string; filename: string; path: string; image_url: string }> = [];
    for (const path of body.scan_paths) {
      const { data: signed, error: sErr } = await supabase.storage
        .from("omr-scans")
        .createSignedUrl(path, 3600);
      if (sErr || !signed) {
        console.error("Erro ao gerar signed URL:", path, sErr);
        continue;
      }
      const filename = path.split("/").pop() || `scan_${crypto.randomUUID()}.jpg`;
      scanFiles.push({
        scan_id: crypto.randomUUID(),
        filename,
        path,
        image_url: signed.signedUrl,
      });
    }

    if (scanFiles.length === 0) {
      return json({ error: "Não foi possível preparar nenhuma imagem" }, 500);
    }

    const omrRes = await fetch(`${OMR_API_URL}/scan-batch-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fleming-Token": OMR_API_TOKEN,
      },
      body: JSON.stringify({
        template: { template_type: String(template.exam_type || "ACAFE").toUpperCase() },
        scans: scanFiles.map((s) => ({ scan_id: s.scan_id, image_url: s.image_url })),
      }),
    });

    if (!omrRes.ok) {
      const errText = await omrRes.text();
      console.error("OMR API erro:", omrRes.status, errText);
      return json({ error: `OMR API retornou ${omrRes.status}: ${errText}` }, 502);
    }

    const result = await omrRes.json();
    const apiResults: any[] = result.results || [];

    // v5: API retorna scan_id pra mapear de volta ao path original
    const scanIdToFile = new Map(scanFiles.map((s) => [s.scan_id, s]));
    const submissionsToInsert: any[] = [];
    for (const r of apiResults) {
      const matched = scanIdToFile.get(r.scan_id);
      if (!matched) continue;

      // v5: resolver student via matricula (r.student_id é a matrícula string)
      let studentDbId: string | null = null;
      let sheetDbId: string | null = null;
      if (r.student_id) {
        const { data: stu } = await supabase
          .from("students")
          .select("id")
          .eq("student_id", String(r.student_id))
          .maybeSingle();
        if (stu) {
          studentDbId = stu.id;
          const { data: sheet } = await supabase
            .from("answer_sheets")
            .select("id")
            .eq("template_id", template.id)
            .eq("student_id", stu.id)
            .maybeSingle();
          if (sheet) sheetDbId = sheet.id;
        }
      }

      // v5: detected_answers vem como { "1": "A", "2": "C", ... } — normalizar para "q1", "q2"
      const detected: Record<string, string> = {};
      const rawAnswers = r.detected_answers || {};
      for (const [k, v] of Object.entries(rawAnswers)) {
        if (v != null && v !== "") detected[`q${k}`] = String(v);
      }

      submissionsToInsert.push({
        user_id: userId,
        template_id: template.id,
        student_id: studentDbId,
        answer_sheet_id: sheetDbId,
        scan_image_path: matched.path,
        qr_data: {
          template_id: r.template_id || null,
          student_id: r.student_id || null,
          template_type: r.template_type || null,
        },
        detected_answers: detected,
        read_errors: r.errors || [],
        success: r.success !== false,
        language: r.language || null,
        template_type: r.template_type || null,
      });
    }

    if (submissionsToInsert.length === 0) {
      return json({ error: "API OMR não retornou resultados válidos", raw: result }, 502);
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
