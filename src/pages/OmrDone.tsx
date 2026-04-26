import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle2, Calculator, Loader2, AlertCircle } from "lucide-react";
import { calculateSummationScore, calculateOpenNumericScore } from "@/lib/ufsc-scoring";

const OmrDone = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const { toast } = useToast();

  const [templateName, setTemplateName] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, reviewed: 0, manual: 0, discarded: 0, pending: 0 });
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
      .select("id, reviewed, discarded, manual_corrections")
      .eq("template_id", templateId);
    const list = (subs as any[]) || [];
    setStats({
      total: list.length,
      reviewed: list.filter((s) => s.reviewed && !s.discarded).length,
      manual: list.filter((s) => s.reviewed && s.manual_corrections && Object.keys(s.manual_corrections).length > 0).length,
      discarded: list.filter((s) => s.discarded).length,
      pending: list.filter((s) => !s.reviewed && !s.discarded).length,
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
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Status dos scans
                </CardTitle>
                <CardDescription>
                  {stats.pending === 0 ? "Tudo revisado!" : `Ainda há ${stats.pending} scan(s) para revisar.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Total" value={stats.total} />
                  <Stat label="Aprovados" value={stats.reviewed} accent="primary" />
                  <Stat label="Corrigidos manualmente" value={stats.manual} />
                  <Stat label="Descartados" value={stats.discarded} />
                </div>

                {stats.pending > 0 && (
                  <Button onClick={() => navigate(`/omr/review/${templateId}`)} variant="outline" className="w-full">
                    Continuar revisão ({stats.pending} pendente(s))
                  </Button>
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
                <Button onClick={calculateGrades} disabled={calculating || stats.reviewed === 0} size="lg" className="w-full">
                  {calculating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculando...</>
                  ) : (
                    <><Calculator className="h-4 w-4 mr-2" />Calcular notas de {stats.reviewed} aluno(s)</>
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

const Stat = ({ label, value, accent }: { label: string; value: number; accent?: "primary" }) => (
  <div className="border rounded-lg p-3 text-center">
    <div className={`text-3xl font-bold ${accent === "primary" ? "text-primary" : ""}`}>{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

export default OmrDone;
