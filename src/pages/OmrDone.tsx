import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle2, Calculator, Loader2, AlertCircle, AlertTriangle, FileScan, UserX } from "lucide-react";
import { calculateSummationScore, calculateOpenNumericScore } from "@/lib/ufsc-scoring";

const OmrDone = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const { toast } = useToast();

  const [templateName, setTemplateName] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    problems: 0,
    discarded: 0,
    unmatched: 0,
    readErrors: 0,
    apiFailed: 0,
    manuallyFixed: 0,
  });
  const [calculating, setCalculating] = useState(false);
  const [calcResult, setCalcResult] = useState<{ created: number; skipped: number; updated: number } | null>(null);

  useEffect(() => {
    if (!templateId) return;
    refresh();
  }, [templateId]);

  const refresh = async () => {
    if (!templateId) return;
    setLoading(true);
    const { data: tpl } = await supabase.from("templates").select("name").eq("id", templateId).maybeSingle();
    setTemplateName(tpl?.name || "");
    const { data: subs } = await supabase
      .from("scan_submissions")
      .select("id, reviewed, discarded, manual_corrections, success, read_errors, student_id")
      .eq("template_id", templateId);
    const list = (subs as any[]) || [];

    const hasProblem = (s: any) =>
      !s.discarded &&
      !s.reviewed &&
      (s.success === false || (Array.isArray(s.read_errors) && s.read_errors.length > 0) || !s.student_id);

    const isApproved = (s: any) => {
      if (s.discarded) return false;
      if (s.reviewed) return true; // aprovado por auditoria humana
      // auto-aprovado: lido com sucesso, sem erros e com aluno vinculado
      return s.success !== false && (!s.read_errors || s.read_errors.length === 0) && !!s.student_id;
    };

    setStats({
      total: list.length,
      approved: list.filter(isApproved).length,
      problems: list.filter(hasProblem).length,
      discarded: list.filter((s) => s.discarded).length,
      unmatched: list.filter((s) => !s.discarded && !s.student_id).length,
      readErrors: list.filter((s) => !s.discarded && Array.isArray(s.read_errors) && s.read_errors.length > 0).length,
      apiFailed: list.filter((s) => !s.discarded && s.success === false).length,
      manuallyFixed: list.filter((s) => s.reviewed && s.manual_corrections && Object.keys(s.manual_corrections).length > 0).length,
    });
    setLoading(false);
  };

  const calculateGrades = async () => {
    if (!templateId) return;
    setCalculating(true);
    setCalcResult(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // 1. Carregar questões + alunos
      const [{ data: questions }, { data: subs }] = await Promise.all([
        supabase.from("template_questions").select("*").eq("template_id", templateId).order("question_number"),
        supabase
          .from("scan_submissions")
          .select("id, student_id, detected_answers")
          .eq("template_id", templateId)
          .eq("reviewed", true)
          .eq("discarded", false),
      ]);

      if (!questions || !subs || subs.length === 0) {
        throw new Error("Nada para calcular");
      }

      const studentIds = [...new Set(subs.map((s: any) => s.student_id).filter(Boolean))];
      const { data: studs } = await supabase.from("students").select("id, name, student_id, foreign_language").in("id", studentIds);
      const studMap = new Map((studs || []).map((s: any) => [s.id, s]));

      let created = 0, skipped = 0, updated = 0;
      for (const sub of subs as any[]) {
        if (!sub.student_id) { skipped++; continue; }
        const student = studMap.get(sub.student_id);
        if (!student) { skipped++; continue; }

        // Verifica se já existe correção
        const { data: existing } = await supabase
          .from("corrections")
          .select("id")
          .eq("template_id", templateId)
          .eq("student_name", student.name)
          .maybeSingle();
        // existing check agora ocorre depois do calculo de notas

        // Filtrar questões por idioma
        const lang = student.foreign_language || "Inglês";
        const filteredQs = (questions as any[]).filter((q) => !q.language_variant || q.language_variant === lang);

        let totalScore = 0, maxScore = 0;
        const answersToInsert: any[] = [];
        for (const q of filteredQs) {
          // O banco salva detected_answers com chaves no formato "q{n}" (ex: "q21", "q22")
          const detected = sub.detected_answers?.[`q${q.question_number}`] ?? null;
          const points = Number(q.points) || 1;
          let isCorrect = false, pointsEarned = 0;

          if (q.question_type === "summation") {
            const studentSum = parseInt(detected || "0") || 0;
            const correctSum = parseInt(q.correct_answer || "0") || 0;
            const r = calculateSummationScore(studentSum, correctSum, q.num_propositions || 5, points);
            pointsEarned = r.score;
            isCorrect = pointsEarned > 0;
            maxScore += r.maxScore;
          } else if (q.question_type === "open_numeric") {
            const studentNum = detected != null ? parseInt(detected) : null;
            const correctNum = parseInt(q.correct_answer || "0") || 0;
            const r = calculateOpenNumericScore(studentNum, correctNum, points);
            pointsEarned = r.score;
            isCorrect = r.isCorrect;
            maxScore += r.maxScore;
          } else if (q.question_type === "discursive") {
            // Discursiva — não vem do OMR, fica zerada e o coordenador lança depois
            maxScore += points;
          } else {
            // Objective
            isCorrect = (detected || "").toUpperCase() === q.correct_answer.toUpperCase();
            pointsEarned = isCorrect ? points : 0;
            maxScore += points;
          }

          totalScore += pointsEarned;
          answersToInsert.push({
            question_number: q.question_number,
            student_answer: detected,
            correct_answer: q.correct_answer,
            is_correct: isCorrect,
            points_earned: pointsEarned,
          });
        }

        // UPSERT: se existe correcao, atualiza; senao, cria nova
      let correctionId: string;
      if (existing) {
        correctionId = existing.id;
        await supabase.from("student_answers").delete().eq("correction_id", correctionId);
        await supabase.from("corrections").update({
          total_score: totalScore,
          max_score: maxScore,
          percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
          status: "completed",
          student_id: student.student_id,
        }).eq("id", correctionId);
        updated++;
      } else {
        const { data: corr, error: corrErr } = await supabase
          .from("corrections")
          .insert({
            user_id: user.id,
            template_id: templateId,
            student_name: student.name,
            student_id: student.student_id,
            total_score: totalScore,
            max_score: maxScore,
            percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
            status: "completed",
          })
          .select("id")
          .single();
        if (corrErr || !corr) { skipped++; continue; }
        correctionId = corr.id;
        created++;
      }

      await supabase.from("student_answers").insert(
        answersToInsert.map((a) => ({ ...a, correction_id: correctionId }))
      );

      await supabase.from("scan_submissions").update({ correction_id: correctionId }).eq("id", sub.id);
      }

      setCalcResult({ created, skipped, updated });
      toast({ title: "Notas calculadas!", description: `${created} criadas, ${updated} atualizadas, ${skipped} ignoradas.` });
    } catch (err: any) {
      toast({ title: "Erro ao calcular", description: err.message, variant: "destructive" });
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/omr")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-xl font-bold">Resumo da Revisão</h1>
            <p className="text-sm text-muted-foreground">{templateName}</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileScan className="h-5 w-5 text-primary" />
                  Status dos gabaritos lidos
                </CardTitle>
                <CardDescription>
                  {stats.total === 0
                    ? "Nenhum gabarito enviado ainda."
                    : stats.problems === 0
                      ? `Todos os ${stats.total} gabaritos estão prontos.`
                      : `${stats.problems} gabarito(s) precisam de atenção do coordenador.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Lidos no banco" value={stats.total} />
                  <Stat label="Aprovados" value={stats.approved} accent="primary" />
                  <Stat label="Com problemas" value={stats.problems} accent={stats.problems > 0 ? "destructive" : undefined} />
                  <Stat label="Descartados" value={stats.discarded} />
                </div>

                {stats.problems > 0 && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Pendências detectadas
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                      {stats.apiFailed > 0 && <li>{stats.apiFailed} gabarito(s) falharam na leitura pela API.</li>}
                      {stats.readErrors > 0 && <li>{stats.readErrors} gabarito(s) com erros de leitura em alguma questão.</li>}
                      {stats.unmatched > 0 && (
                        <li className="flex items-center gap-1"><UserX className="h-3 w-3" />{stats.unmatched} sem aluno vinculado (matrícula não encontrada).</li>
                      )}
                    </ul>
                    <Button onClick={() => navigate(`/omr/review/${templateId}`)} variant="destructive" size="sm" className="w-full mt-2">
                      Resolver pendências ({stats.problems})
                    </Button>
                  </div>
                )}

                {stats.manuallyFixed > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {stats.manuallyFixed} gabarito(s) foram corrigidos manualmente por auditoria.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Calcular notas
                </CardTitle>
                <CardDescription>
                  Cria as correções no sistema a partir das respostas aprovadas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Apenas scans <strong>revisados e não descartados</strong>, com aluno vinculado, geram notas.
                    Alunos que já têm correção nesta prova são ignorados.
                  </AlertDescription>
                </Alert>
                <Button onClick={calculateGrades} disabled={calculating || stats.approved === 0} size="lg" className="w-full">
                  {calculating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculando...</>
                  ) : (
                    <><Calculator className="h-4 w-4 mr-2" />Calcular notas de {stats.approved} aluno(s)</>
                  )}
                </Button>

                {calcResult && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <AlertTitle>Concluído</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <div className="flex gap-2">
                        <Badge variant="default">{calcResult.created} novas, {calcResult.updated} atualizadas</Badge>
                        {calcResult.skipped > 0 && <Badge variant="secondary">{calcResult.skipped} ignoradas</Badge>}
                      </div>
                      <Button size="sm" onClick={() => navigate("/history")}>Ver histórico</Button>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

const Stat = ({ label, value, accent }: { label: string; value: number; accent?: "primary" | "destructive" }) => (
  <div className="border rounded-lg p-3 text-center">
    <div className={`text-3xl font-bold ${accent === "primary" ? "text-primary" : accent === "destructive" ? "text-destructive" : ""}`}>{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

export default OmrDone;
