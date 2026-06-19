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
import { ArrowLeft, Trophy, TrendingUp, Users } from "lucide-react";
import FlemingLogo from "@/components/FlemingLogo";

// ── Campus weight configuration ──────────────────────────────────────────────

interface CampusConfig {
  id: string;
  name: string;
  course: string;
  weights: Record<string, number>; // subject → weight (default = 1)
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

// Ordem das disciplinas na prova (somente objetivas entram na fórmula PObj)
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
interface Correction { id: string; student_name: string; student_id: string | null; total_score: number | null; max_score: number | null; percentage: number | null; language_variant: string | null; essay_score: number | null }
interface TemplateQuestion { question_number: number; subject: string | null; language_variant: string | null; question_type: string; points: number | null }
interface StudentAnswer { question_number: number; is_correct: boolean | null; points_earned: number | null }

const fmt = (n: number) => n.toFixed(2).replace(".", ",");
const pct = (s: number, m: number) => m > 0 ? `${((s / m) * 100).toFixed(1)}%` : "—";

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
      .select("question_number, subject, language_variant, question_type, points")
      .eq("template_id", selectedTemplate)
      .order("question_number");
    setTemplateQuestions(data || []);
  };

  const loadStudentAnswers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("student_answers")
      .select("question_number, is_correct, points_earned")
      .eq("correction_id", selectedCorrection);
    setStudentAnswers(data || []);
    setLoading(false);
  };

  // ── Per-subject correct count for selected student ────────────────────────
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

    const best = campusScores.reduce((a, b) => (b.score / b.maxScore > a.score / a.maxScore ? b : a));

    // Discursive totals
    const discursiveEarned = discursiveQuestions.reduce((s, q) => s + (answerMap.get(q.question_number)?.points_earned ?? 0), 0);
    const discursiveMax = discursiveQuestions.reduce((s, q) => s + (q.points ?? 5), 0);
    const discursiveCount = discursiveQuestions.length;

    return { corr, bySubject, disciplineCorrects, campusScores, best, discursiveEarned, discursiveMax, discursiveCount };
  }, [selectedCorrection, studentAnswers, corrections, templateQuestions]);

  // ── All-students ranking per campus ──────────────────────────────────────
  const [allAnswers, setAllAnswers] = useState<Record<string, StudentAnswer[]>>({});

  useEffect(() => {
    if (corrections.length === 0 || !selectedTemplate) return;
    const fetchAll = async () => {
      const result: Record<string, StudentAnswer[]> = {};
      for (const c of corrections) {
        const { data } = await supabase
          .from("student_answers")
          .select("question_number, is_correct")
          .eq("correction_id", c.id);
        result[c.id] = data || [];
      }
      setAllAnswers(result);
    };
    fetchAll();
  }, [corrections, selectedTemplate]);

  const rankingData = useMemo(() => {
    if (corrections.length === 0 || Object.keys(allAnswers).length === 0) return [];

    return corrections.map(corr => {
      const answers = allAnswers[corr.id] || [];
      const answerMap = new Map(answers.map(a => [a.question_number, a.is_correct ?? false]));
      const lang = corr.language_variant;

      const activeQuestions = templateQuestions.filter(q => {
        if (q.question_type === "discursive") return false; // não entra no PObj
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/boletins")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FlemingLogo size="sm" />
          <div>
            <h1 className="text-xl font-bold">Boletim UFPR</h1>
            <p className="text-xs text-muted-foreground">Comparativo de campus por disciplina</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Selectors */}
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
            <TabsList className="mb-4">
              <TabsTrigger value="individual">Aluno Individual</TabsTrigger>
              <TabsTrigger value="ranking">Ranking por Campus</TabsTrigger>
            </TabsList>

            {/* ── TAB: Individual ── */}
            <TabsContent value="individual">
              {!selectedCorrection && (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Selecione um aluno para ver o comparativo de campus</p>
                </div>
              )}
              {selectedCorrection && loading && (
                <div className="text-center py-12 text-muted-foreground animate-pulse">Carregando...</div>
              )}
              {correctionData && !loading && (
                <div className="space-y-6">
                  {/* Campus comparison summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {correctionData.campusScores.map(({ campus, score, maxScore }) => {
                      const isBest = campus.id === correctionData.best.campus.id;
                      return (
                        <Card key={campus.id} className={isBest ? "border-2 border-primary shadow-md" : ""}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">{campus.course}</CardTitle>
                              {isBest && (
                                <Badge className="gap-1">
                                  <Trophy className="h-3 w-3" /> Melhor campus
                                </Badge>
                              )}
                            </div>
                            <CardDescription>
                              Pesos: {Object.entries(campus.weights).map(([s, w]) => `${s} ×${w}`).join(", ")}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="text-3xl font-bold">{fmt(score)}<span className="text-base font-normal text-muted-foreground"> / {maxScore}</span></div>
                            <div className="text-sm text-muted-foreground mt-1">{pct(score, maxScore)} de aproveitamento</div>
                            <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${maxScore > 0 ? (score / maxScore) * 100 : 0}%` }} />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Per-discipline breakdown */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Desempenho por Disciplina</CardTitle>
                      <CardDescription>Acertos × peso para cada campus</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Disciplina</TableHead>
                            <TableHead className="text-center">Acertos</TableHead>
                            <TableHead className="text-center">Total</TableHead>
                            <TableHead className="text-center">%</TableHead>
                            {UFPR_CAMPUSES.map(c => (
                              <TableHead key={c.id} className="text-center">{c.name} (Pts)</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {UFPR_SUBJECTS_ORDER.map(subject => {
                            const stats = correctionData.bySubject[subject] || { correct: 0, total: SUBJECT_TOTALS[subject] || 0 };
                            return (
                              <TableRow key={subject}>
                                <TableCell className="font-medium">{subject}</TableCell>
                                <TableCell className="text-center">{stats.correct}</TableCell>
                                <TableCell className="text-center">{stats.total}</TableCell>
                                <TableCell className="text-center">{pct(stats.correct, stats.total)}</TableCell>
                                {UFPR_CAMPUSES.map(c => {
                                  const w = getWeight(c, subject);
                                  const pts = stats.correct * w;
                                  return (
                                    <TableCell key={c.id} className="text-center">
                                      <span className="font-mono">{fmt(pts)}</span>
                                      {w > 1 && <span className="text-xs text-muted-foreground ml-1">(×{w})</span>}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <tfoot>
                          <tr className="border-t-2 font-bold bg-muted/30">
                            <td className="px-4 py-3">Total</td>
                            <td className="px-4 py-3 text-center">
                              {Object.values(correctionData.bySubject).reduce((s, v) => s + v.correct, 0)}
                            </td>
                            <td className="px-4 py-3 text-center">80</td>
                            <td className="px-4 py-3 text-center">
                              {pct(
                                Object.values(correctionData.bySubject).reduce((s, v) => s + v.correct, 0),
                                80
                              )}
                            </td>
                            {correctionData.campusScores.map(({ campus, score, maxScore }) => (
                              <td key={campus.id} className="px-4 py-3 text-center">
                                <span className="text-primary font-bold">{fmt(score)}</span>
                                <span className="text-xs text-muted-foreground">/{maxScore}</span>
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Prova Discursiva + Redação */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Discursivas */}
                    {correctionData.discursiveCount > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Questões Discursivas</CardTitle>
                          <CardDescription>{correctionData.discursiveCount} questão(ões) — corrigidas manualmente</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {correctionData.discursiveMax > 0 ? (
                            <>
                              <div className="text-3xl font-bold">
                                {fmt(correctionData.discursiveEarned)}
                                <span className="text-base font-normal text-muted-foreground"> / {correctionData.discursiveMax}</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                {pct(correctionData.discursiveEarned, correctionData.discursiveMax)} de aproveitamento
                              </div>
                              <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-full transition-all"
                                  style={{ width: `${correctionData.discursiveMax > 0 ? (correctionData.discursiveEarned / correctionData.discursiveMax) * 100 : 0}%` }} />
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Aguardando correção manual</p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Redação */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Redação</CardTitle>
                        <CardDescription>Nota lançada em Lançar Notas de Redação</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {correctionData.corr.essay_score != null ? (
                          <>
                            <div className="text-3xl font-bold">
                              {fmt(correctionData.corr.essay_score)}
                              <span className="text-base font-normal text-muted-foreground"> pts</span>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">Nota registrada</div>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Aguardando lançamento</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── TAB: Ranking ── */}
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

                    return (
                      <Card key={campus.id}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-amber-500" />
                            {campus.course}
                          </CardTitle>
                          <CardDescription>
                            Pesos: {Object.entries(campus.weights).map(([s, w]) => `${s} ×${w}`).join(", ")} · Máx: {sorted[0]?.maxScore ?? 0} pts
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-8">#</TableHead>
                                <TableHead>Aluno</TableHead>
                                <TableHead className="text-right">Pts</TableHead>
                                <TableHead className="text-right">%</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sorted.map((row, idx) => (
                                <TableRow key={idx} className={idx === 0 ? "bg-amber-50/40" : ""}>
                                  <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                                  <TableCell>
                                    <div>{row.name}</div>
                                    {row.id && <div className="text-xs text-muted-foreground">{row.id}</div>}
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-medium">{fmt(row.score)}</TableCell>
                                  <TableCell className="text-right text-muted-foreground">{pct(row.score, row.maxScore)}</TableCell>
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
