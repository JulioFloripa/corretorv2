import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trophy, TrendingUp, Users, BookOpen, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import FlemingLogo from "@/components/FlemingLogo";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from "recharts";

// ── Campus weight configuration ──────────────────────────────────────────────

interface CampusConfig {
  id: string;
  name: string;
  course: string;
  weights: Record<string, number>;
}

const UFPR_CAMPUSES: CampusConfig[] = [
  {
    id: "curitiba_medicina",
    name: "Curitiba",
    course: "Medicina — Curitiba",
    weights: { "Biologia": 2, "Língua Portuguesa": 2 },
  },
  {
    id: "toledo_medicina",
    name: "Toledo",
    course: "Medicina — Toledo",
    weights: { "Biologia": 2, "Química": 2 },
  },
];

const UFPR_SUBJECTS_ORDER = [
  "Língua Estrangeira",
  "Biologia",
  "Física",
  "Geografia",
  "História",
  "Matemática",
  "Química",
  "Literatura Brasileira",
  "Filosofia",
  "Sociologia",
  "Língua Portuguesa",
];

const SUBJECT_TOTALS: Record<string, number> = {
  "Língua Estrangeira": 7,
  "Biologia": 8,
  "Física": 8,
  "Geografia": 8,
  "História": 8,
  "Matemática": 8,
  "Química": 8,
  "Literatura Brasileira": 5,
  "Filosofia": 5,
  "Sociologia": 5,
  "Língua Portuguesa": 10,
};

const SUBJECT_SHORT: Record<string, string> = {
  "Língua Estrangeira": "LE",
  "Biologia": "Bio",
  "Física": "Fís",
  "Geografia": "Geo",
  "História": "Hist",
  "Matemática": "Mat",
  "Química": "Quím",
  "Literatura Brasileira": "Lit.",
  "Filosofia": "Fil",
  "Sociologia": "Soc",
  "Língua Portuguesa": "LP",
};

function getWeight(campus: CampusConfig, subject: string): number {
  return campus.weights[subject] ?? 1;
}

function calcCampusScore(
  campus: CampusConfig,
  disciplineCorrects: Record<string, number>
): { score: number; maxScore: number } {
  let score = 0;
  let maxScore = 0;
  for (const [subject, total] of Object.entries(SUBJECT_TOTALS)) {
    const w = getWeight(campus, subject);
    const correct = disciplineCorrects[subject] ?? 0;
    score += correct * w;
    maxScore += total * w;
  }
  return { score, maxScore };
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Template { id: string; name: string; exam_type: string; total_questions: number }
interface Correction {
  id: string; student_name: string; student_id: string | null;
  total_score: number | null; max_score: number | null; percentage: number | null;
  language_variant: string | null; essay_score: number | null
}
interface TemplateQuestion {
  question_number: number; subject: string | null; language_variant: string | null;
  question_type: string; points: number | null; topic: string | null;
  correct_answer: string | null;
}
interface StudentAnswer {
  question_number: number; student_answer: string | null;
  is_correct: boolean | null; points_earned: number | null
}

const fmt = (n: number) => n.toFixed(2).replace(".", ",");
const pct = (s: number, m: number) => m > 0 ? `${((s / m) * 100).toFixed(1)}%` : "—";
const pctNum = (s: number, m: number) => m > 0 ? Math.round((s / m) * 100) : 0;

const UFPR_LOGO_SIZES = { sm: 40, md: 56, lg: 80 };

const UfprLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => (
  <img
    src="/Logo_oficial_da_UFPR_(sem_fundo).png"
    alt="UFPR"
    style={{ height: UFPR_LOGO_SIZES[size], width: "auto", objectFit: "contain" }}
  />
);

const BoletimUfpr = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [selectedCorrection, setSelectedCorrection] = useState<string>("");
  const [templateQuestions, setTemplateQuestions] = useState<TemplateQuestion[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<StudentAnswer[]>([]);
  const [loading, setLoading] = useState(false);
  const [allAnswers, setAllAnswers] = useState<Record<string, StudentAnswer[]>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
    });
    loadTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      loadCorrections();
      loadTemplateQuestions();
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (selectedCorrection) loadStudentAnswers();
  }, [selectedCorrection]);

  useEffect(() => {
    if (corrections.length === 0 || !selectedTemplate) return;
    const fetchAll = async () => {
      const result: Record<string, StudentAnswer[]> = {};
      for (const c of corrections) {
        const { data } = await supabase
          .from("student_answers")
          .select("question_number, student_answer, is_correct, points_earned")
          .eq("correction_id", c.id);
        result[c.id] = data || [];
      }
      setAllAnswers(result);
    };
    fetchAll();
  }, [corrections, selectedTemplate]);

  const loadTemplates = async () => {
    const { data } = await supabase
      .from("templates")
      .select("id, name, exam_type, total_questions")
      .eq("exam_type", "ufpr")
      .order("created_at", { ascending: false });
    setTemplates(data || []);
    if (data && data.length === 1) setSelectedTemplate(data[0].id);
  };

  const loadCorrections = async () => {
    const { data, error } = await supabase
      .from("corrections")
      .select("id, student_name, student_id, total_score, max_score, percentage, language_variant, essay_score")
      .eq("template_id", selectedTemplate)
      .eq("status", "completed")
      .order("student_name");
    if (error) { toast({ title: "Erro ao carregar correções", variant: "destructive" }); return; }
    setCorrections(data || []);
  };

  const loadTemplateQuestions = async () => {
    const { data } = await supabase
      .from("template_questions")
      .select("question_number, subject, language_variant, question_type, points, topic, correct_answer")
      .eq("template_id", selectedTemplate)
      .order("question_number");
    setTemplateQuestions(data || []);
  };

  const loadStudentAnswers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("student_answers")
      .select("question_number, student_answer, is_correct, points_earned")
      .eq("correction_id", selectedCorrection)
      .order("question_number");
    setStudentAnswers(data || []);
    setLoading(false);
  };

  // ── Per-subject data for selected student ─────────────────────────────────
  const correctionData = useMemo(() => {
    if (!selectedCorrection || studentAnswers.length === 0) return null;
    const corr = corrections.find(c => c.id === selectedCorrection);
    if (!corr) return null;

    const answerMap = new Map(studentAnswers.map(a => [a.question_number, a]));
    const lang = corr.language_variant;

    const activeQuestions = templateQuestions.filter(q => {
      if (!q.language_variant) return true;
      return q.language_variant === (lang || "Inglês");
    });

    const objectiveQuestions = activeQuestions.filter(q => q.question_type !== "discursive");
    const discursiveQuestions = activeQuestions.filter(q => q.question_type === "discursive");

    const bySubject: Record<string, { correct: number; total: number }> = {};
    for (const q of objectiveQuestions) {
      const subject = q.subject || "—";
      if (!bySubject[subject]) bySubject[subject] = { correct: 0, total: 0 };
      bySubject[subject].total++;
      if (answerMap.get(q.question_number)?.is_correct) bySubject[subject].correct++;
    }

    const disciplineCorrects: Record<string, number> = {};
    for (const [subject, stats] of Object.entries(bySubject)) {
      disciplineCorrects[subject] = stats.correct;
    }

    const campusScores = UFPR_CAMPUSES.map(campus => ({
      campus,
      ...calcCampusScore(campus, disciplineCorrects),
    }));

    const best = campusScores.reduce((a, b) =>
      b.score / b.maxScore > a.score / a.maxScore ? b : a
    );

    const totalCorrect = Object.values(bySubject).reduce((s, v) => s + v.correct, 0);
    const totalObj = 80;

    const discursiveEarned = discursiveQuestions.reduce(
      (s, q) => s + (answerMap.get(q.question_number)?.points_earned ?? 0), 0
    );
    const discursiveMax = discursiveQuestions.reduce((s, q) => s + (Number(q.points) || 5), 0);
    const discursiveCount = discursiveQuestions.length;

    const wrongQuestions = objectiveQuestions
      .filter(q => !answerMap.get(q.question_number)?.is_correct)
      .map(q => ({
        number: q.question_number,
        subject: q.subject || "—",
        topic: q.topic || "",
        studentAnswer: answerMap.get(q.question_number)?.student_answer || "—",
        correctAnswer: q.correct_answer || "—",
      }));

    return {
      corr, bySubject, disciplineCorrects, campusScores, best,
      totalCorrect, totalObj,
      discursiveEarned, discursiveMax, discursiveCount,
      wrongQuestions,
    };
  }, [selectedCorrection, studentAnswers, corrections, templateQuestions]);

  // ── Class average per discipline (for bar chart) ──────────────────────────
  const classAvgBySubject = useMemo(() => {
    if (Object.keys(allAnswers).length === 0 || templateQuestions.length === 0) return {};

    const subjectAgg: Record<string, { totalCorrect: number; totalQs: number }> = {};

    for (const [corrId, answers] of Object.entries(allAnswers)) {
      const corr = corrections.find(c => c.id === corrId);
      const lang = corr?.language_variant;
      const answerMap = new Map(answers.map(a => [a.question_number, a]));

      const activeQs = templateQuestions.filter(q => {
        if (q.question_type === "discursive") return false;
        if (!q.language_variant) return true;
        return q.language_variant === (lang || "Inglês");
      });

      for (const q of activeQs) {
        const subj = q.subject || "—";
        if (!subjectAgg[subj]) subjectAgg[subj] = { totalCorrect: 0, totalQs: 0 };
        subjectAgg[subj].totalQs++;
        if (answerMap.get(q.question_number)?.is_correct) subjectAgg[subj].totalCorrect++;
      }
    }

    const result: Record<string, number> = {};
    for (const [subj, agg] of Object.entries(subjectAgg)) {
      result[subj] = agg.totalQs > 0 ? Math.round((agg.totalCorrect / agg.totalQs) * 100) : 0;
    }
    return result;
  }, [allAnswers, templateQuestions, corrections]);

  // ── Ranking per campus ────────────────────────────────────────────────────
  const rankingData = useMemo(() => {
    if (corrections.length === 0 || Object.keys(allAnswers).length === 0) return [];

    return corrections.map(corr => {
      const answers = allAnswers[corr.id] || [];
      const answerMap = new Map(answers.map(a => [a.question_number, a.is_correct ?? false]));
      const lang = corr.language_variant;

      const activeQuestions = templateQuestions.filter(q => {
        if (q.question_type === "discursive") return false;
        if (!q.language_variant) return true;
        return q.language_variant === (lang || "Inglês");
      });

      const disciplineCorrects: Record<string, number> = {};
      for (const q of activeQuestions) {
        const subj = q.subject || "—";
        if (!disciplineCorrects[subj]) disciplineCorrects[subj] = 0;
        if (answerMap.get(q.question_number)) disciplineCorrects[subj]++;
      }

      const campusScores = UFPR_CAMPUSES.map(campus => ({
        campusId: campus.id,
        ...calcCampusScore(campus, disciplineCorrects),
      }));

      return { corr, campusScores };
    });
  }, [corrections, allAnswers, templateQuestions]);

  // ── Ranking position for selected student ─────────────────────────────────
  const studentRanking = useMemo(() => {
    if (!correctionData || rankingData.length === 0) return null;
    const bestCampusId = correctionData.best.campus.id;
    const sorted = [...rankingData]
      .map(r => ({ id: r.corr.id, score: r.campusScores.find(x => x.campusId === bestCampusId)?.score ?? 0 }))
      .sort((a, b) => b.score - a.score);
    const pos = sorted.findIndex(r => r.id === selectedCorrection) + 1;
    return { pos, total: sorted.length };
  }, [correctionData, rankingData, selectedCorrection]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!correctionData) return [];
    return UFPR_SUBJECTS_ORDER.map(subject => {
      const stats = correctionData.bySubject[subject] || { correct: 0, total: SUBJECT_TOTALS[subject] || 0 };
      return {
        label: SUBJECT_SHORT[subject] || subject,
        aluno: pctNum(stats.correct, stats.total),
        turma: classAvgBySubject[subject] ?? 0,
        corretosAluno: stats.correct,
        totalQs: stats.total,
      };
    });
  }, [correctionData, classAvgBySubject]);

  const templateName = templates.find(t => t.id === selectedTemplate)?.name || "Simulado UFPR";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* ── Header ── */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/boletins")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <FlemingLogo size="sm" />
            <div className="h-8 w-px bg-border" />
            <UfprLogo size="sm" />
            <div>
              <h1 className="text-lg font-bold leading-none">Boletim UFPR</h1>
              <p className="text-xs text-muted-foreground">Comparativo de campus por disciplina</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ── Selectors ── */}
        <Card className="mb-6">
          <CardContent className="pt-4 flex flex-wrap gap-4">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-muted-foreground mb-1 block">Simulado</label>
              <Select value={selectedTemplate} onValueChange={v => { setSelectedTemplate(v); setSelectedCorrection(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione o simulado..." /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-48">
              <label className="text-xs text-muted-foreground mb-1 block">Aluno</label>
              <Select value={selectedCorrection} onValueChange={setSelectedCorrection} disabled={!selectedTemplate}>
                <SelectTrigger><SelectValue placeholder="Selecione o aluno..." /></SelectTrigger>
                <SelectContent>
                  {corrections.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.student_name}{c.student_id ? ` (${c.student_id})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!selectedTemplate && (
          <div className="text-center py-16 text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Selecione um simulado UFPR para começar</p>
          </div>
        )}

        {selectedTemplate && (
          <Tabs defaultValue="individual">
            <TabsList className="mb-6">
              <TabsTrigger value="individual">Aluno Individual</TabsTrigger>
              <TabsTrigger value="ranking">Ranking por Campus</TabsTrigger>
            </TabsList>

            {/* ═══════════════════════════════════════════════════════════════
                TAB: INDIVIDUAL
            ════════════════════════════════════════════════════════════════ */}
            <TabsContent value="individual">
              {!selectedCorrection && (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Selecione um aluno para ver o boletim individual</p>
                </div>
              )}
              {selectedCorrection && loading && (
                <div className="text-center py-12 text-muted-foreground animate-pulse">Carregando dados...</div>
              )}

              {correctionData && !loading && (() => {
                const { corr, bySubject, campusScores, best, totalCorrect, totalObj,
                  discursiveEarned, discursiveMax, discursiveCount, wrongQuestions } = correctionData;

                return (
                  <div className="space-y-6">

                    {/* ── Cabeçalho do boletim ── */}
                    <Card className="bg-gradient-to-r from-blue-50 to-primary/5 border-blue-200">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <div className="flex items-center gap-6">
                            <FlemingLogo size="md" showText={false} />
                            <div className="h-12 w-px bg-blue-200" />
                            <UfprLogo size="md" />
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold">{corr.student_name}</p>
                            <p className="text-sm text-muted-foreground">{templateName}</p>
                            <p className="text-xs text-muted-foreground">
                              {corr.language_variant ? `Língua Estrangeira: ${corr.language_variant}` : ""}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* ── Cards de resumo ── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="pt-5 pb-5 text-center">
                          <p className="text-xs text-muted-foreground mb-1">Acertos Objetivas</p>
                          <p className="text-3xl font-bold text-primary">{totalCorrect}<span className="text-base font-normal text-muted-foreground">/80</span></p>
                          <p className="text-sm font-medium text-primary mt-1">{pct(totalCorrect, totalObj)}</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="pt-5 pb-5 text-center">
                          <p className="text-xs text-muted-foreground mb-1">Melhor Campus</p>
                          <p className="text-lg font-bold">{best.campus.name}</p>
                          <p className="text-2xl font-bold mt-1">{fmt(best.score)}</p>
                          <p className="text-xs text-muted-foreground">/{best.maxScore} pts</p>
                        </CardContent>
                      </Card>

                      {studentRanking && (
                        <Card>
                          <CardContent className="pt-5 pb-5 text-center">
                            <p className="text-xs text-muted-foreground mb-1">Ranking</p>
                            <p className="text-3xl font-bold">{studentRanking.pos}º</p>
                            <p className="text-sm text-muted-foreground">de {studentRanking.total} alunos</p>
                          </CardContent>
                        </Card>
                      )}

                      <Card className="border-destructive/20">
                        <CardContent className="pt-5 pb-5 text-center">
                          <p className="text-xs text-muted-foreground mb-1">Para Revisar</p>
                          <p className="text-3xl font-bold text-destructive">{wrongQuestions.length}</p>
                          <p className="text-sm text-muted-foreground">questões</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* ── Tabela dupla: disciplinas | campus scores ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

                      {/* Coluna esquerda: acertos por disciplina */}
                      <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Acertos por Disciplina</CardTitle>
                          <CardDescription>Questões objetivas (80 total)</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Disciplina</TableHead>
                                <TableHead className="text-center">Acertos</TableHead>
                                <TableHead className="text-center">%</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {UFPR_SUBJECTS_ORDER.map(subject => {
                                const stats = bySubject[subject] || { correct: 0, total: SUBJECT_TOTALS[subject] || 0 };
                                const p = pctNum(stats.correct, stats.total);
                                return (
                                  <TableRow key={subject}>
                                    <TableCell className="text-sm font-medium py-2">{subject}</TableCell>
                                    <TableCell className="text-center py-2">
                                      <span className="font-mono font-semibold">{stats.correct}</span>
                                      <span className="text-muted-foreground text-xs">/{stats.total}</span>
                                    </TableCell>
                                    <TableCell className="text-center py-2">
                                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                        p >= 70 ? "bg-green-100 text-green-800" :
                                        p >= 50 ? "bg-yellow-100 text-yellow-800" :
                                        "bg-red-100 text-red-800"
                                      }`}>
                                        {p}%
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                            <tfoot>
                              <tr className="border-t-2 bg-muted/30">
                                <td className="px-4 py-2 font-bold text-sm">Total</td>
                                <td className="px-4 py-2 text-center font-bold font-mono">{totalCorrect}/80</td>
                                <td className="px-4 py-2 text-center font-bold text-sm">
                                  {pct(totalCorrect, 80)}
                                </td>
                              </tr>
                            </tfoot>
                          </Table>
                        </CardContent>
                      </Card>

                      {/* Coluna direita: pontuação ponderada por campus */}
                      <Card className="lg:col-span-3">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Pontuação por Campus</CardTitle>
                          <CardDescription>PObj = Σ(Ai × pi) — pesos aplicados por disciplina</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Disciplina</TableHead>
                                {campusScores.map(({ campus }) => (
                                  <TableHead key={campus.id} className="text-center">
                                    <div className="font-semibold">{campus.name}</div>
                                    <div className="text-xs font-normal text-muted-foreground">
                                      {Object.entries(campus.weights).map(([s, w]) =>
                                        `${SUBJECT_SHORT[s] ?? s}×${w}`
                                      ).join(", ")}
                                    </div>
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {UFPR_SUBJECTS_ORDER.map(subject => {
                                const stats = bySubject[subject] || { correct: 0, total: SUBJECT_TOTALS[subject] || 0 };
                                return (
                                  <TableRow key={subject}>
                                    <TableCell className="text-sm py-2">{subject}</TableCell>
                                    {campusScores.map(({ campus }) => {
                                      const w = getWeight(campus, subject);
                                      const pts = stats.correct * w;
                                      const maxPts = stats.total * w;
                                      return (
                                        <TableCell key={campus.id} className="text-center py-2">
                                          <span className="font-mono font-semibold">{pts}</span>
                                          <span className="text-xs text-muted-foreground">/{maxPts}</span>
                                          {w > 1 && (
                                            <span className="ml-1 text-xs text-blue-600 font-medium">(×{w})</span>
                                          )}
                                        </TableCell>
                                      );
                                    })}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                            <tfoot>
                              <tr className="border-t-2 bg-muted/30">
                                <td className="px-4 py-3 font-bold text-sm">PObj Total</td>
                                {campusScores.map(({ campus, score, maxScore }) => {
                                  const isBest = campus.id === best.campus.id;
                                  return (
                                    <td key={campus.id} className="px-4 py-3 text-center">
                                      <div className={`font-bold text-lg font-mono ${isBest ? "text-primary" : ""}`}>
                                        {fmt(score)}
                                      </div>
                                      <div className="text-xs text-muted-foreground">/{maxScore} pts</div>
                                      <div className="text-xs mt-0.5">{pct(score, maxScore)}</div>
                                      {isBest && (
                                        <Badge variant="default" className="text-xs mt-1 gap-1">
                                          <Trophy className="h-2.5 w-2.5" /> Melhor
                                        </Badge>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            </tfoot>
                          </Table>
                        </CardContent>
                      </Card>
                    </div>

                    {/* ── Barra de progresso por campus ── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {campusScores.map(({ campus, score, maxScore }) => {
                        const isBest = campus.id === best.campus.id;
                        const percent = maxScore > 0 ? (score / maxScore) * 100 : 0;
                        return (
                          <Card key={campus.id} className={isBest ? "border-2 border-primary" : ""}>
                            <CardContent className="pt-4 pb-4">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <p className="font-semibold">{campus.course}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Pesos: {Object.entries(campus.weights).map(([s, w]) => `${s} ×${w}`).join(", ")}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-2xl font-bold font-mono">{fmt(score)}</p>
                                  <p className="text-xs text-muted-foreground">de {maxScore} pts</p>
                                </div>
                              </div>
                              <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${isBest ? "bg-primary" : "bg-slate-400"}`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <p className="text-right text-xs text-muted-foreground mt-1">{pct(score, maxScore)} de aproveitamento</p>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    {/* ── Discursiva + Redação ── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {discursiveCount > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-amber-500" />
                              Questões Discursivas
                            </CardTitle>
                            <CardDescription>{discursiveCount} questão(ões) — corrigidas manualmente</CardDescription>
                          </CardHeader>
                          <CardContent>
                            {discursiveMax > 0 ? (
                              <>
                                <div className="text-3xl font-bold font-mono">
                                  {fmt(discursiveEarned)}
                                  <span className="text-base font-normal text-muted-foreground"> / {discursiveMax} pts</span>
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {pct(discursiveEarned, discursiveMax)} de aproveitamento
                                </div>
                                <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden">
                                  <div
                                    className="h-full bg-amber-500 rounded-full transition-all"
                                    style={{ width: `${discursiveMax > 0 ? (discursiveEarned / discursiveMax) * 100 : 0}%` }}
                                  />
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">Aguardando correção manual</p>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-blue-500" />
                            Redação
                          </CardTitle>
                          <CardDescription>Nota lançada em Notas de Redação</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {corr.essay_score != null ? (
                            <>
                              <div className="text-3xl font-bold font-mono">
                                {fmt(corr.essay_score)}
                                <span className="text-base font-normal text-muted-foreground"> pts</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">Nota registrada</div>
                              <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{ width: `${Math.min((corr.essay_score / 100) * 100, 100)}%` }}
                                />
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Aguardando lançamento</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* ── Pontuação total (PObj + Discursiva + Redação) ── */}
                    {(discursiveMax > 0 || corr.essay_score != null) && (
                      <Card className="bg-muted/30">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Pontuação Total por Campus</CardTitle>
                          <CardDescription>PObj + Discursiva + Redação</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-6">
                            {campusScores.map(({ campus, score }) => {
                              const disc = discursiveMax > 0 ? discursiveEarned : 0;
                              const essay = corr.essay_score ?? 0;
                              const total = score + disc + essay;
                              const isBest = campus.id === best.campus.id;
                              return (
                                <div key={campus.id} className={`rounded-lg p-4 border ${isBest ? "border-primary bg-primary/5" : "border-border bg-background"}`}>
                                  <p className="font-semibold text-sm mb-2">{campus.course}</p>
                                  <div className="space-y-1 text-sm text-muted-foreground">
                                    <div className="flex justify-between">
                                      <span>PObj</span>
                                      <span className="font-mono font-medium text-foreground">{fmt(score)}</span>
                                    </div>
                                    {discursiveMax > 0 && (
                                      <div className="flex justify-between">
                                        <span>Discursiva</span>
                                        <span className="font-mono font-medium text-foreground">{fmt(disc)}</span>
                                      </div>
                                    )}
                                    {corr.essay_score != null && (
                                      <div className="flex justify-between">
                                        <span>Redação</span>
                                        <span className="font-mono font-medium text-foreground">{fmt(essay)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between border-t pt-1 mt-1">
                                      <span className="font-bold text-foreground">Total</span>
                                      <span className={`font-bold font-mono text-lg ${isBest ? "text-primary" : "text-foreground"}`}>{fmt(total)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* ── Gráfico de barras: aluno vs turma ── */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Desempenho por Disciplina vs Turma</CardTitle>
                        <CardDescription>
                          Comparativo do seu aproveitamento (%) com a média dos {corrections.length} participantes
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={320}>
                          <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                            <Tooltip
                              formatter={(value: number, name: string) => [`${value}%`, name === "aluno" ? "Você" : "Turma"]}
                              labelFormatter={label => {
                                const item = chartData.find(d => d.label === label);
                                return item ? `${label} (${item.corretosAluno}/${item.totalQs})` : label;
                              }}
                            />
                            <Legend formatter={v => v === "aluno" ? "Você" : "Média da turma"} />
                            <Bar dataKey="aluno" name="aluno" fill="#16a34a" radius={[3, 3, 0, 0]}>
                              <LabelList
                                dataKey="aluno"
                                position="top"
                                formatter={(v: number) => v > 0 ? `${v}%` : ""}
                                style={{ fontSize: 10, fill: "#16a34a", fontWeight: 600 }}
                              />
                            </Bar>
                            <Bar dataKey="turma" name="turma" fill="#94a3b8" radius={[3, 3, 0, 0]}>
                              <LabelList
                                dataKey="turma"
                                position="top"
                                formatter={(v: number) => v > 0 ? `${v}%` : ""}
                                style={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* ── Questões para revisar ── */}
                    {wrongQuestions.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive" />
                            <span className="text-destructive">Questões para Revisar</span>
                          </CardTitle>
                          <CardDescription>
                            {wrongQuestions.length} questões erradas — use o conteúdo para direcionar seus estudos
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">Questão</TableHead>
                                <TableHead>Disciplina</TableHead>
                                <TableHead>Conteúdo / Tópico</TableHead>
                                <TableHead className="text-center w-20">Resposta</TableHead>
                                <TableHead className="text-center w-20">Gabarito</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {wrongQuestions.map(q => (
                                <TableRow key={q.number} className="hover:bg-destructive/5">
                                  <TableCell className="font-bold">Q{q.number}</TableCell>
                                  <TableCell className="text-sm">{q.subject}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {q.topic || <span className="italic opacity-50">Sem tópico cadastrado</span>}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <span className="inline-flex items-center gap-1 justify-center">
                                      <XCircle className="h-3 w-3 text-destructive" />
                                      <span className="font-mono font-semibold text-destructive">{q.studentAnswer}</span>
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <span className="font-mono font-semibold text-primary">{q.correctAnswer}</span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    )}

                    {wrongQuestions.length === 0 && (
                      <Card className="border-green-200 bg-green-50/50">
                        <CardContent className="pt-6 pb-6 text-center">
                          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-600" />
                          <p className="text-green-800 font-semibold">Parabéns! Nenhuma questão errada.</p>
                        </CardContent>
                      </Card>
                    )}

                  </div>
                );
              })()}
            </TabsContent>

            {/* ═══════════════════════════════════════════════════════════════
                TAB: RANKING
            ════════════════════════════════════════════════════════════════ */}
            <TabsContent value="ranking">
              {rankingData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma correção encontrada para este simulado</p>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {UFPR_CAMPUSES.map(campus => {
                    const sorted = [...rankingData]
                      .map(r => {
                        const cs = r.campusScores.find(x => x.campusId === campus.id)!;
                        return { name: r.corr.student_name, id: r.corr.student_id, score: cs.score, maxScore: cs.maxScore };
                      })
                      .sort((a, b) => b.score - a.score);

                    const avg = sorted.length > 0
                      ? sorted.reduce((s, r) => s + r.score, 0) / sorted.length
                      : 0;

                    return (
                      <Card key={campus.id}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-amber-500" />
                            {campus.course}
                          </CardTitle>
                          <CardDescription>
                            Pesos: {Object.entries(campus.weights).map(([s, w]) => `${s} ×${w}`).join(", ")} · Máx: {sorted[0]?.maxScore ?? 0} pts · Média: {fmt(avg)}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="overflow-x-auto p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-10 pl-4">#</TableHead>
                                <TableHead>Aluno</TableHead>
                                <TableHead className="text-right">PObj</TableHead>
                                <TableHead className="text-right pr-4">%</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sorted.map((row, idx) => (
                                <TableRow
                                  key={idx}
                                  className={[
                                    idx === 0 ? "bg-amber-50" : "",
                                    idx === 1 ? "bg-slate-50" : "",
                                    idx === 2 ? "bg-orange-50/40" : "",
                                  ].join(" ")}
                                >
                                  <TableCell className="pl-4">
                                    <span className={`font-bold ${idx === 0 ? "text-amber-600" : idx === 1 ? "text-slate-600" : idx === 2 ? "text-orange-600" : "text-muted-foreground"}`}>
                                      {idx + 1}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{row.name}</div>
                                    {row.id && <div className="text-xs text-muted-foreground">{row.id}</div>}
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-semibold">{fmt(row.score)}</TableCell>
                                  <TableCell className="text-right text-muted-foreground pr-4">{pct(row.score, row.maxScore)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default BoletimUfpr;
