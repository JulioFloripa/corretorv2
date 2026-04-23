import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GenerateBody {
  template_id: string;
  student_ids?: string[]; // se vazio, usa todos os matriculados em template_students
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

    // Validar JWT do usuário
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);
    const userId = userData.user.id;

    const body: GenerateBody = await req.json();
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
      .from("students")
      .select("id, name, student_id, campus")
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

    // Montar payload no contrato esperado pela OMR API
    const payload = {
      template_id: template.id,
      template_name: template.name,
      exam_type: String(template.exam_type || "").toUpperCase(),
      template_type: String(template.exam_type || "").toUpperCase(),
      total_questions: template.total_questions,
      alternatives: ["A", "B", "C", "D", "E"],
      questions: (questions || []).map((q: any) => ({
        question_number: q.question_number,
        question_type: q.question_type,
        num_propositions: q.num_propositions,
      })),
      students: sheets.map((sh) => {
        const student = students.find((s: any) => s.id === sh.student_id)!;
        return {
          id: student.id,
          student_id: student.student_id || "",
          sheet_uuid: sh.sheet_uuid,
          name: student.name,
          matricula: student.student_id || "",
          sede: student.campus || "",
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

    const result = await omrRes.json();
    // Esperado: { zip_url, expires_at, sheet_count }
    return json({
      success: true,
      zip_url: result.zip_url,
      expires_at: result.expires_at,
      sheet_count: result.sheet_count ?? sheets.length,
      sheets_created: sheets.length,
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