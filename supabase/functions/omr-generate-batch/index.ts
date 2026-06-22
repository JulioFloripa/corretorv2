import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "content-disposition, content-type, x-sheet-count",
};

interface GenerateBody {
  template_id: string;
  student_ids?: string[]; // se vazio, usa todos os matriculados em template_students
  day?: number;           // 1 ou 2 (ENEM/UFSC); omitir = dia 1
}

/**
 * Retorna as alternativas corretas para o tipo de prova.
 * Para provas personalizadas, analisa o tipo da primeira questão objetiva.
 */
function deriveAlternatives(examType: string, questions: { question_type?: string }[]): string[] {
  const lower = (examType || "").toLowerCase();
  if (lower === "acafe" || lower === "acafe_criciuma") return ["A", "B", "C", "D"];
  if (lower === "enem") return ["A", "B", "C", "D", "E"];
  if (lower === "ufsc") return [];

  // Para custom / multiple_choice: usa o tipo da primeira questão objetiva
  for (const q of questions) {
    const qt = (q.question_type || "objective").toLowerCase();
    if (qt === "true_false") return ["V", "F"];
    if (qt === "objective_2") return ["A", "B"];
    if (qt === "objective_3") return ["A", "B", "C"];
    if (qt === "objective_4") return ["A", "B", "C", "D"];
    if (qt === "objective" || qt.startsWith("objective")) return ["A", "B", "C", "D", "E"];
    // questões somatório/discursiva/numérica não determinam alternativas; continua
  }
  return ["A", "B", "C", "D", "E"]; // padrão seguro
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

    // Extrair user ID diretamente do JWT (o edge runtime já validou a assinatura via VERIFY_JWT)
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

    const body: GenerateBody = await req.json();
    const requestedDay = body.day || 1;
    if (!body.template_id) return json({ error: "template_id obrigatório" }, 400);

    // Carregar template + questões
    const { data: template, error: tplErr } = await supabase
      .from("templates")
      .select("id, name, exam_type, total_questions")
      .eq("id", body.template_id)
      .maybeSingle();
    if (tplErr || !template) return json({ error: "Prova não encontrada" }, 404);

    const { data: questions } = await supabase
      .from("template_questions")
      .select("question_number, question_type, num_propositions")
      .eq("template_id", body.template_id)
      .order("question_number");

    // Carregar alunos: se body.student_ids vier, usa; senão pega de template_students
    let studentIds = body.student_ids || [];
    if (studentIds.length === 0) {
      const { data: enrolled } = await supabase
        .from("template_students")
        .select("student_id")
        .eq("template_id", body.template_id);
      studentIds = (enrolled || []).map((r: any) => r.student_id);
    }
    if (studentIds.length === 0) {
      return json({ error: "Nenhum aluno matriculado nesta prova" }, 400);
    }

    const { data: students } = await supabase
      .from("alunos")
      .select("id, nome, matricula, campus")
      .in("id", studentIds);
    if (!students || students.length === 0) {
      return json({ error: "Alunos não encontrados" }, 404);
    }

    // Criar/upsert answer_sheets para cada aluno (gera sheet_uuid)
    const sheetsToInsert = students.map((s: any) => ({
      template_id: template.id,
      student_id: s.id,
      user_id: userId,
      status: "generated",
    }));

    // Upsert manual: tenta inserir, se já existir busca o existente
    const sheets: Array<{ id: string; sheet_uuid: string; student_id: string }> = [];
    for (const row of sheetsToInsert) {
      const { data: existing } = await supabase
        .from("answer_sheets")
        .select("id, sheet_uuid")
        .eq("template_id", row.template_id)
        .eq("student_id", row.student_id)
        .maybeSingle();
      if (existing) {
        sheets.push({ id: existing.id, sheet_uuid: existing.sheet_uuid, student_id: row.student_id });
      } else {
        const { data: created, error: insErr } = await supabase
          .from("answer_sheets")
          .insert(row)
          .select("id, sheet_uuid")
          .single();
        if (insErr || !created) {
          console.error("Erro ao criar answer_sheet:", insErr);
          continue;
        }
        sheets.push({ id: created.id, sheet_uuid: created.sheet_uuid, student_id: row.student_id });
      }
    }

    // Deriva as alternativas com base no tipo da prova e nas questões salvas
    const alternatives = deriveAlternatives(template.exam_type, questions || []);

    // Payload v6: inclui total_questions, alternatives e day para ENEM/UFSC
    const examTypeUpper = String(template.exam_type || "ACAFE").toUpperCase();
    const payload = {
      template_id: template.id,
      template_type: examTypeUpper,
      template_name: template.name,
      total_questions: template.total_questions,
      alternatives,
      day: requestedDay,
      students: sheets.map((sh) => {
        const student = students.find((s: any) => s.id === sh.student_id)!;
        return {
          id: student.matricula || student.id,
          name: student.nome,
          campus: student.campus || "",
        };
      }),
    };

    // Chamar OMR API
    const omrRes = await fetch(`${OMR_API_URL}/generate-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fleming-Token": OMR_API_TOKEN,
      },
      body: JSON.stringify(payload),
    });

    if (!omrRes.ok) {
      const errText = await omrRes.text();
      console.error("OMR API erro:", omrRes.status, errText);
      return json({ error: `OMR API retornou ${omrRes.status}: ${errText}` }, 502);
    }

    const responseContentType = omrRes.headers.get("content-type") || "";
    const normalizedContentType = responseContentType.toLowerCase();
    const responseBuffer = await omrRes.arrayBuffer();
    const responseBytes = new Uint8Array(responseBuffer.slice(0, 2));
    const isZip = responseBytes[0] === 0x50 && responseBytes[1] === 0x4b;
    const isBinaryResponse =
      normalizedContentType.includes("application/zip") ||
      normalizedContentType.includes("application/octet-stream") ||
      isZip;

    if (isBinaryResponse) {
      return new Response(responseBuffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            isZip || normalizedContentType.includes("application/zip") ? "application/zip" : "application/octet-stream",
          "Content-Disposition": `attachment; filename="gabaritos.zip"`,
          "X-Sheet-Count": String(sheets.length),
        },
      });
    }

    const result = JSON.parse(new TextDecoder().decode(responseBuffer));
    // Esperado: { zip_url, expires_at, sheet_count } ou ZIP binário direto
    return json(
      {
        success: true,
        zip_url: result.zip_url,
        expires_at: result.expires_at,
        sheet_count: result.sheet_count ?? sheets.length,
        sheets_created: sheets.length,
      },
      200,
    );
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
