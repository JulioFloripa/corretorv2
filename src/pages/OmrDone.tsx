import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  Calculator,
  Loader2,
  AlertCircle,
  AlertTriangle,
  FileScan,
  UserX,
  Users,
  Search,
  UserCheck,
  CircleAlert,
  CircleX,
  CircleDashed,
  FileBarChart,
  RefreshCw,
} from "lucide-react";
import { calculateSummationScore, calculateOpenNumericScore } from "@/lib/ufsc-scoring";

type StudentStatus = "approved" | "problem" | "discarded" | "missing";

interface EnrolledStudent {
  id: string;
  name: string;
  student_id: string | null;
  campus: string | null;
}

interface ScanSubmission {
  id: string;
  student_id: string | null;
  reviewed: boolean;
  discarded: boolean;
  manual_corrections: any;
  success: boolean | null;
  read_errors: string[] | null;
  student_name?: string | null;
}

interface StudentRow {
  student: EnrolledStudent;
  scan: ScanSubmission | null;
  status: StudentStatus;
  statusLabel: string;
}

const OmrDone = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const { toast } = useToast();

  const [templateName, setTemplateName] = useState("");
  const [loading, setLoading] = useState(true);
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
  const [submissions, setSubmissions] = useState<ScanSubmission[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StudentStatus>("all");

  const [calculating, setCalculating] = useState(false);
  const [calcResult, setCalcResult] = useState<{ created: number; skipped: number; updated: number } | null>(null);

  useEffect(() => {
    if (!templateId) return;
    refresh();
  }, [templateId]);

  const refresh = async () => {
    if (!templateId) return;
    setLoading(true);

    const [{ data: tpl }, { data: enrolled }, { data: subs }] = await Promise.all([
      supabase.from("templates").select("name").eq("id", templateId).maybeSingle(),
      supabase
        .from("template_students")
        .select("student_id, students(id, name, student_id, campus)")
        .eq("template_id", templateId),
      supabase
        .from("scan_submissions")
        .select("id, reviewed, discarded, manual_corrections, success, read_errors, student_id")
        .eq("template_id", templateId),
    ]);

    setTemplateName(tpl?.name || "");

    const students: EnrolledStudent[] = ((enrolled as any[]) || [])
      .map((e: any) => e.students)
      .filter(Boolean)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    setEnrolledStudents(students);
    setSubmissions((subs as any[]) || []);
    setLoading(false);
  };

  // ──── Computar status de cada aluno ────
  const studentRows = useMemo<StudentRow[]>(() => {
    const subsByStudent = new Map<string, ScanSubmission>();
    for (const sub of submissions) {
      if (sub.student_id && !sub.discarded) {
        // Se houver múltiplos scans para o mesmo aluno, priorizar o revisado
        const existing = subsByStudent.get(sub.student_id);
        if (!existing || (sub.reviewed && !existing.reviewed)) {
          subsByStudent.set(sub.student_id, sub);
        }
      }
    }

    return enrolledStudents.map((student) => {
      const scan = subsByStudent.get(student.id) || null;

      let status: StudentStatus;
      let statusLabel: string;

      if (!scan) {
        status = "missing";
        statusLabel = "Sem gabarito";
      } else if (scan.discarded) {
        status = "discarded";
        statusLabel = "Descartado";
      } else if (
        scan.success === false ||
        (Array.isArray(scan.read_errors) && scan.read_errors.length > 0) ||
        !scan.student_id
      ) {
        if (scan.reviewed) {
          status = "approved";
          statusLabel = "Corrigido manualmente";
        } else {
          status = "problem";
          statusLabel = scan.success === false
            ? "Falha na leitura"
            : (scan.read_errors?.length || 0) > 0
              ? `${scan.read_errors!.length} erro(s) de leitura`
              : "Sem aluno vinculado";
        }
      } else if (scan.reviewed) {
        status = "approved";
        statusLabel = "Revisado";
      } else {
        status = "approved";
        statusLabel = "Auto-aprovado";
      }

      return { student, scan, status, statusLabel };
    });
  }, [enrolledStudents, submissions]);

  // ──── Scans sem aluno (órfãos) ────
  const orphanScans = useMemo(() => {
    const enrolledIds = new Set(enrolledStudents.map((s) => s.id));
    return submissions.filter((sub) => !sub.discarded && (!sub.student_id || !enrolledIds.has(sub.student_id)));
  }, [submissions, enrolledStudents]);

  // ──── Contadores ────
  const counts = useMemo(() => {
    const approved = studentRows.filter((r) => r.status === "approved").length;
    const problems = studentRows.filter((r) => r.status === "problem").length;
    const missing = studentRows.filter((r) => r.status === "missing").length;
    const discarded = submissions.filter((s) => s.discarded).length;
    const total = enrolledStudents.length;
    const coverage = total > 0 ? Math.round(((total - missing) / total) * 100) : 0;

    return { approved, problems, missing, discarded, total, coverage, orphans: orphanScans.length };
  }, [studentRows, submissions, enrolledStudents, orphanScans]);

  // ──── Filtro ────
  const filteredRows = useMemo(() => {
    return studentRows.filter((row) => {
      const matchesSearch =
        !search ||
        row.student.name.toLowerCase().includes(search.toLowerCase()) ||
        (row.student.student_id || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [studentRows, search, statusFilter]);

  // ──── Calcular notas (mesmo código original) ────
  const calculateGrades = async () => {
    if (!templateId) return;
    setCalculating(true);
    setCalcResult(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const [{ data: questions }, { data: subs }] = await Promise.all([
        supabase.from("template_questions").select("*").eq("template_id", templateId).order("question_number"),
        supabase
          .from("scan_submissions")
          .select("id, student_id, detected_answers, reviewed, success, read_errors")
          .eq("template_id", templateId)
          .eq("discarded", false),
      ]);

      if (!questions || !subs || subs.length === 0) throw new Error("Nada para calcular");

      const approvedSubs = (subs as any[]).filter((s) => {
        if (!s.student_id) return false;
        if (s.reviewed) return true;
        return s.success !== false && (!s.read_errors || s.read_errors.length === 0);
      });

      const studentIds = [...new Set(approvedSubs.map((s: any) => s.student_id).filter(Boolean))];
      const { data: studs } = await supabase.from("students").select("id, name, student_id, foreign_language").in("id", studentIds);
      const studMap = new Map((studs || []).map((s: any) => [s.id, s]));

      let created = 0, skipped = 0, updated = 0;

      for (const sub of approvedSubs) {
        if (!sub.student_id) { skipped++; continue; }
        const student = studMap.get(sub.student_id);
        if (!student) { skipped++; continue; }

        const { data: existing } = await supabase
          .from("corrections")
          .select("id")
          .eq("template_id", templateId)
          .eq("student_name", student.name)
          .maybeSingle();

        const lang = student.foreign_language || "Inglês";
        const filteredQs = (questions as any[]).filter((q) => !q.language_variant || q.language_variant === lang);

        let totalScore = 0, maxScore = 0;
        const answersToInsert: any[] = [];

        for (const q of filteredQs) {
          const detected = sub.detected_answers?.[`q${q.question_number}`] ?? null;
          const points = Number(q.points) || 1;
          let isCorrect = false, pointsEarned = 0;

          if (q.question_type === "summation") {
            const studentSum = parseInt(detected || "0") || 0;
            const correctSum = parseInt(q.correct_answer || "0") || 0;
            const r = calculateSummationScore(studentSum, correctSum, q.num_propositions || 5, points);
            pointsEarned = r.score; isCorrect = pointsEarned > 0; maxScore += r.maxScore;
          } else if (q.question_type === "open_numeric") {
            const studentNum = detected != null ? parseInt(detected) : null;
            const correctNum = parseInt(q.correct_answer || "0") || 0;
            const r = calculateOpenNumericScore(studentNum, correctNum, points);
            pointsEarned = r.score; isCorrect = r.isCorrect; maxScore += r.maxScore;
          } else if (q.question_type === "discursive") {
            maxScore += points;
          } else {
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

  const statusIcon = (status: StudentStatus) => {
    switch (status) {
      case "approved": return <UserCheck className="h-4 w-4 text-emerald-600" />;
      case "problem": return <CircleAlert className="h-4 w-4 text-amber-500" />;
      case "discarded": return <CircleX className="h-4 w-4 text-muted-foreground" />;
      case "missing": return <CircleDashed className="h-4 w-4 text-destructive" />;
    }
  };

  const statusBadge = (status: StudentStatus, label: string) => {
    const variants: Record<StudentStatus, "default" | "secondary" | "destructive" | "outline"> = {
      approved: "default",
      problem: "secondary",
      discarded: "outline",
      missing: "destructive",
    };
    return <Badge variant={variants[status]} className="text-xs">{label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/omr")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Resumo da Prova</h1>
            <p className="text-sm text-muted-foreground">{templateName}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { refresh(); toast({ title: "Dados atualizados" }); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* ══════ Painel de cobertura ══════ */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Cobertura de alunos
                </CardTitle>
                <CardDescription>
                  {counts.total === 0
                    ? "Nenhum aluno matriculado nesta prova."
                    : counts.missing === 0
                      ? `Todos os ${counts.total} alunos matriculados têm gabarito processado.`
                      : `${counts.missing} de ${counts.total} aluno(s) ainda sem gabarito escaneado.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Barra de progresso */}
                {counts.total > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gabaritos recebidos</span>
                      <span className="font-medium">{counts.total - counts.missing} / {counts.total} ({counts.coverage}%)</span>
                    </div>
                    <Progress value={counts.coverage} className="h-3" />
                  </div>
                )}

                {/* Contadores */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Stat label="Matriculados" value={counts.total} icon={<Users className="h-4 w-4 text-muted-foreground" />} />
                  <Stat label="Aprovados" value={counts.approved} icon={<UserCheck className="h-4 w-4 text-emerald-600" />} accent="primary" />
                  <Stat label="Com problemas" value={counts.problems} icon={<CircleAlert className="h-4 w-4 text-amber-500" />} accent={counts.problems > 0 ? "destructive" : undefined} />
                  <Stat label="Sem gabarito" value={counts.missing} icon={<CircleDashed className="h-4 w-4 text-destructive" />} accent={counts.missing > 0 ? "destructive" : undefined} />
                  <Stat label="Descartados" value={counts.discarded} icon={<CircleX className="h-4 w-4 text-muted-foreground" />} />
                </div>

                {/* Alertas */}
                {counts.problems > 0 && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      {counts.problems} gabarito(s) precisam de atenção
                    </div>
                    <Button onClick={() => navigate(`/omr/review/${templateId}`)} variant="destructive" size="sm" className="w-full">
                      Resolver pendências
                    </Button>
                  </div>
                )}

                {counts.missing > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                      <CircleDashed className="h-4 w-4" />
                      {counts.missing} aluno(s) matriculados ainda não têm gabarito escaneado
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Verifique se todos os gabaritos foram impressos e escaneados, ou se há alunos faltantes no dia da prova.
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={() => navigate(`/omr/upload/${templateId}`)} variant="outline" size="sm">
                        Enviar mais scans
                      </Button>
                      <Button onClick={() => setStatusFilter("missing")} variant="ghost" size="sm">
                        Ver alunos faltantes
                      </Button>
                    </div>
                  </div>
                )}

                {counts.orphans > 0 && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                      <UserX className="h-4 w-4" />
                      {counts.orphans} scan(s) sem aluno vinculado
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Gabaritos escaneados que não foram associados a nenhum aluno matriculado. Revise na aba de revisão.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ══════ Raio-X por aluno ══════ */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <FileBarChart className="h-5 w-5" />
                  Raio-X por aluno
                </CardTitle>
                <CardDescription>
                  Status individual de cada aluno matriculado nesta prova.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col md:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar nome ou matrícula..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                    <SelectTrigger className="md:w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos ({counts.total})</SelectItem>
                      <SelectItem value="approved">Aprovados ({counts.approved})</SelectItem>
                      <SelectItem value="problem">Com problemas ({counts.problems})</SelectItem>
                      <SelectItem value="missing">Sem gabarito ({counts.missing})</SelectItem>
                      <SelectItem value="discarded">Descartados ({counts.discarded})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <ScrollArea className="h-[400px] border rounded-md">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Matrícula</TableHead>
                        <TableHead>Sede</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Nenhum aluno encontrado com os filtros aplicados.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRows.map((row) => (
                          <TableRow
                            key={row.student.id}
                            className={row.status === "missing" ? "bg-destructive/5" : row.status === "problem" ? "bg-amber-500/5" : ""}
                          >
                            <TableCell>{statusIcon(row.status)}</TableCell>
                            <TableCell className="font-medium">{row.student.name}</TableCell>
                            <TableCell className="text-muted-foreground">{row.student.student_id || "-"}</TableCell>
                            <TableCell className="text-muted-foreground">{row.student.campus || "-"}</TableCell>
                            <TableCell className="text-right">{statusBadge(row.status, row.statusLabel)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* ══════ Calcular notas ══════ */}
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
                    Apenas scans <strong>aprovados e não descartados</strong>, com aluno vinculado, geram notas.
                    {counts.missing > 0 && (
                      <> Atenção: <strong>{counts.missing} aluno(s)</strong> não têm gabarito — eles não receberão nota.</>
                    )}
                  </AlertDescription>
                </Alert>

                <Button onClick={calculateGrades} disabled={calculating || counts.approved === 0} size="lg" className="w-full">
                  {calculating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculando...</>
                  ) : (
                    <><Calculator className="h-4 w-4 mr-2" />Calcular notas de {counts.approved} aluno(s)</>
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

const Stat = ({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number;
  accent?: "primary" | "destructive";
  icon?: React.ReactNode;
}) => (
  <div className="border rounded-lg p-3 text-center space-y-1">
    <div className="flex justify-center">{icon}</div>
    <div className={`text-2xl font-bold ${accent === "primary" ? "text-primary" : accent === "destructive" ? "text-destructive" : ""}`}>
      {value}
    </div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

export default OmrDone;
