import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScanBody {
  template_id: string;
  scan_paths: string[]; // paths no bucket omr-scans
}

function deriveAlternatives(examType: string, questions: { question_type?: string }[]): string[] {
  const lower = (examType || "").toLowerCase();
  if (lower === "acafe" || lower === "acafe_criciuma") return ["A", "B", "C", "D"];
  if (lower === "enem") return ["A", "B", "C", "D", "E"];
  if (lower === "ufsc") return [];

  for (const q of questions) {
    const qt = (q.question_type || "objective").toLowerCase();
    if (qt === "true_false") return ["V", "F"];
    if (qt === "objective_2") return ["A", "B"];
    if (qt === "objective_3") return ["A", "B", "C"];
    if (qt === "objective_4") return ["A", "B", "C", "D"];
    if (qt === "objective" || qt.startsWith("objective")) return ["A", "B", "C", "D", "E"];
  }
  return ["A", "B", "C", "D", "E"];
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

    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(b64));
      userId = payload.sub;
      if (!userId) throw new Error("sub ausente");
    } catch {
      return json({ error: "Sessão inválida" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body: ScanBody = await req.json();
    if (!body.template_id || !Array.isArray(body.scan_paths) || body.scan_paths.length === 0) {
      return json({ error: "template_id e scan_paths são obrigatórios" }, 400);
    }

    const { data: template } = await supabase
      .from("templates")
      .select("id, exam_type, total_questions")
      .eq("id", body.template_id)
      .maybeSingle();
    if (!template) return json({ error: "Prova não encontrada" }, 404);

    const { data: tplQuestions } = await supabase
      .from("template_questions")
      .select("question_type")
      .eq("template_id", template.id)
      .order("question_number");
    const alternatives = deriveAlternatives(template.exam_type, tplQuestions || []);

    const scanConfig = JSON.stringify({
      exam_type: String(template.exam_type || "ACAFE").toUpperCase(),
      total_questions: template.total_questions,
      alternatives,
    });

    const submissionsToInsert: any[] = [];

    for (const path of body.scan_paths) {
      const scanId = crypto.randomUUID();
      const filename = path.split("/").pop() || `scan_${scanId}`;

      // Download da imagem via rede interna (evita Cloud Run precisar acessar URL pública)
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("omr-scans")
        .download(path);

      if (dlErr || !fileData) {
        console.error("Erro ao baixar imagem:", path, dlErr?.message);
        submissionsToInsert.push({
          user_id: userId,
          template_id: template.id,
          student_id: null,
          answer_sheet_id: null,
          scan_image_path: path,
          qr_data: { template_id: null, student_id: null, template_type: null },
          detected_answers: {},
          read_errors: [`Erro ao baixar imagem: ${dlErr?.message || "desconhecido"}`],
          success: false,
        });
        continue;
      }

      // Enviar bytes diretamente para a Cloud Run via /scan (form-data)
      const imageBytes = await fileData.arrayBuffer();
      const ext = filename.toLowerCase().endsWith(".pdf") ? "pdf" : "png";
      const mimeType = ext === "pdf" ? "application/pdf" : "image/png";

      const formData = new FormData();
      formData.append("file", new Blob([imageBytes], { type: mimeType }), `${scanId}.${ext}`);
      formData.append("config", scanConfig);

      let r: any = null;
      try {
        const omrRes = await fetch(`${OMR_API_URL}/scan`, {
          method: "POST",
          headers: { "X-Fleming-Token": OMR_API_TOKEN },
          body: formData,
        });
        if (omrRes.ok) {
          r = await omrRes.json();
        } else {
          const errText = await omrRes.text();
          console.error("OMR /scan erro:", omrRes.status, errText);
          r = { success: false, errors: [`API retornou ${omrRes.status}: ${errText}`] };
        }
      } catch (fetchErr: any) {
        console.error("Erro de rede ao chamar OMR API:", fetchErr.message);
        r = { success: false, errors: [`Erro de rede: ${fetchErr.message}`] };
      }

      // Resolver student via matricula (r.student_id é a matrícula string do QR)
      let studentDbId: string | null = null;
      let sheetDbId: string | null = null;
      if (r?.student_id) {
        const { data: stu } = await supabase
          .from("alunos")
          .select("id")
          .eq("matricula", String(r.student_id))
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

      // Normalizar detected_answers: API retorna "Q1","Q2" → "q1","q2"
      const detected: Record<string, string> = {};
      const rawAnswers = r?.detected_answers || {};
      for (const [k, v] of Object.entries(rawAnswers)) {
        if (v != null && v !== "") {
          const numStr = k.replace(/^Q/i, "");
          detected[`q${numStr}`] = String(v);
        }
      }

      submissionsToInsert.push({
        user_id: userId,
        template_id: template.id,
        student_id: studentDbId,
        answer_sheet_id: sheetDbId,
        scan_image_path: path,
        qr_data: {
          template_id: r?.template_id || null,
          student_id: r?.student_id || null,
          template_type: r?.template_type || null,
        },
        detected_answers: detected,
        read_errors: r?.errors || [],
        success: r?.success !== false,
        language: r?.language || null,
        template_type: r?.template_type || null,
      });
    }

    if (submissionsToInsert.length === 0) {
      return json({ error: "Nenhuma imagem pôde ser processada" }, 500);
    }

    const { data: inserted, error: insErr } = await supabase
      .from("scan_submissions")
      .insert(submissionsToInsert)
      .select("id");

    if (insErr) {
      console.error("Erro ao inserir submissions:", insErr);
      return json({ error: insErr.message }, 500);
    }

    const ok = submissionsToInsert.filter((s) => s.success).length;
    const failed = submissionsToInsert.filter((s) => !s.success).length;

    return json({
      success: true,
      processed: submissionsToInsert.length,
      submission_ids: (inserted || []).map((r: any) => r.id),
      summary: { total: submissionsToInsert.length, ok, failed },
    });
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
