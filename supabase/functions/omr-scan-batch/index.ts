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

    // Carregar template + número de questões para construir o config esperado pela API OMR
    const { data: template } = await supabase
      .from("templates")
      .select("id, exam_type")
      .eq("id", body.template_id)
      .maybeSingle();
    if (!template) return json({ error: "Prova não encontrada" }, 404);

    const { data: questions } = await supabase
      .from("template_questions")
      .select("question_number")
      .eq("template_id", body.template_id);

    const totalQuestions = (questions && questions.length > 0) ? questions.length : 63;
    const alternatives = ["A", "B", "C", "D"];

    // Baixar bytes das imagens do Storage para enviar como multipart
    const scanFiles: Array<{ scan_id: string; filename: string; blob: Blob; path: string }> = [];
    for (const path of body.scan_paths) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("omr-scans")
        .download(path);
      if (dlErr || !blob) {
        console.error("Erro ao baixar imagem:", path, dlErr);
        continue;
      }
      const filename = path.split("/").pop() || `scan_${crypto.randomUUID()}.jpg`;
      scanFiles.push({
        scan_id: crypto.randomUUID(),
        filename,
        blob,
        path,
      });
    }

    if (scanFiles.length === 0) {
      return json({ error: "Não foi possível baixar nenhuma imagem" }, 500);
    }

    // Montar multipart/form-data: files[] + config (JSON no formato que a API OMR espera)
    // Schema confirmado via teste com curl: { total_questions, alternatives, scans }
    // O template_id real é lido do QR Code pela própria API, não precisa enviar.
    const formData = new FormData();
    for (const s of scanFiles) {
      formData.append("files", s.blob, s.filename);
    }
    const apiConfig = {
      total_questions: totalQuestions,
      alternatives: alternatives,
      scans: scanFiles.map((s) => ({ scan_id: s.scan_id, filename: s.filename })),
    };
    formData.append("config", JSON.stringify(apiConfig));

    // POST para a API OMR (endpoint /scan-batch, multipart)
    // NÃO setar Content-Type manualmente - fetch monta com boundary correto
    const omrRes = await fetch(`${OMR_API_URL}/scan-batch`, {
      method: "POST",
      headers: {
        "X-Fleming-Token": OMR_API_TOKEN,
      },
      body: formData,
    });

    if (!omrRes.ok) {
      const errText = await omrRes.text();
      console.error("OMR API erro:", omrRes.status, errText);
      return json({ error: `OMR API retornou ${omrRes.status}: ${errText}` }, 502);
    }

    const result = await omrRes.json();
    const apiResults: any[] = result.results || [];

    // Mapear resultados de volta pros paths e gravar scan_submissions
    // A API retorna filename (e talvez scan_id); usamos filename como chave principal.
    const filenameToScan = new Map(scanFiles.map((s) => [s.filename, s]));
    const submissionsToInsert: any[] = [];
    for (const r of apiResults) {
      const matched = filenameToScan.get(r.filename) ||
        scanFiles.find((s) => s.scan_id === r.scan_id);
      if (!matched) continue;

      // Resolver student_id e answer_sheet_id via QR (se a API retornou template_id/student_id, usamos)
      let studentDbId: string | null = null;
      let sheetDbId: string | null = null;
      const sheetUuid = r.qr_data?.sheet_uuid || r.sheet_uuid || null;
      if (sheetUuid) {
        const { data: sheet } = await supabase
          .from("answer_sheets")
          .select("id, student_id")
          .eq("sheet_uuid", sheetUuid)
          .maybeSingle();
        if (sheet) {
          sheetDbId = sheet.id;
          studentDbId = sheet.student_id;
        }
      }

      // Normalizar respostas: API retorna array [{question_number, answer}]; gravamos como objeto {q1: "A", q2: "B", ...}
      const detected: Record<string, string> = {};
      const answersArr = Array.isArray(r.answers) ? r.answers : [];
      for (const a of answersArr) {
        if (a && a.question_number != null && a.answer != null) {
          detected[`q${a.question_number}`] = a.answer;
        }
      }

      submissionsToInsert.push({
        user_id: userId,
        template_id: template.id,
        student_id: studentDbId,
        answer_sheet_id: sheetDbId,
        scan_image_path: matched.path,
        qr_data: r.qr_data || (r.template_id ? { template_id: r.template_id, student_id: r.student_id } : null),
        detected_answers: detected,
        read_errors: r.errors || r.read_errors || [],
        success: r.success !== false,
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
