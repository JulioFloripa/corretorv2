import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Save, Loader2, Search, CheckCircle2, CircleDashed, Filter, Pencil, AlertCircle,
} from "lucide-react";
import { examTypeLabel } from "@/lib/exam-presets";

interface DiscursiveQuestion {
  questionNumber: number;
  points: number;
  label: string;
}

interface StudentDiscursive {
  studentId: string;
  studentName: string;
  studentMatricula: string | null;
  campus: string | null;
  correctionId: string | null;
  scores: Record<number, { earned: number | null; original: number | null; dirty: boolean }>;
}

const DiscursiveScores = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [discursiveQuestions, setDiscursiveQuestions] = useState<DiscursiveQuestion[]>([]);
  const [students, setStudents] = useState<StudentDiscursive[]>([]);
  const [search, setSearch] = useState("");
  const [campusFilter, setCampusFilter] = useState<string>("all");

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      loadDiscursiveQuestions(selectedTemplate);
      loadStudents(selectedTemplate);
    }
  }, [selectedTemplate]);

  const loadTemplates = async () => {
    const { data } = await supabase
      .from("templates")
      .select("id, name, total_questions, exam_type")
      .order("created_at", { ascending: false });
    // Só templates que têm questões discursivas (filtramos depois mas carregamos todos)
    setTemplates(data || []);
  };

  const loadDiscursiveQuestions = async (templateId: string) => {
    const { data } = await supabase
      .from("template_questions")
      .select("question_number, points")
      .eq("template_id", templateId)
      .eq("question_type", "discursive")
      .order("question_number");

    const questions: DiscursiveQuestion[] = (data || []).map((q: any, idx: number) => ({
      questionNumber: q.question_number,
      points: Number(q.points) || 10,
      label: `Q${q.question_number}`,
    }));
    setDiscursiveQuestions(questions);
  };

  const loadStudents = async (templateId: string) => {
    setLoading(true);
    try {
      // Usa corrections como fonte primária (scan + planilha + qualquer entrada)
      const [{ data: corrections }, { data: enrollments }] = await Promise.all([
        supabase
          .from("corrections")
          .select("id, student_name, student_id")
          .eq("template_id", templateId),
        supabase
          .from("template_students")
          .select("student_id")
          .eq("template_id", templateId),
      ]);

      const enrolledIds = (enrollments || []).map((e: any) => e.student_id).filter(Boolean);
      const corrNames = (corrections || []).map((c: any) => c.student_name).filter(Boolean);
      const corrIds = (corrections || []).map((c: any) => c.student_id).filter(Boolean);
      const allIds = [...new Set([...enrolledIds, ...corrIds])];

      const alunosMap = new Map<string, any>();
      const [byId, byName] = await Promise.all([
        allIds.length > 0
          ? supabase.from("alunos").select("id, nome, matricula, campus").in("id", allIds)
          : Promise.resolve({ data: [] }),
        corrNames.length > 0
          ? supabase.from("alunos").select("id, nome, matricula, campus").in("nome", corrNames)
          : Promise.resolve({ data: [] }),
      ]);
      for (const a of [...(byId.data || []), ...(byName.data || [])]) {
        if (!alunosMap.has(a.id)) alunosMap.set(a.id, a);
      }

      const findAluno = (corr: any) => {
        if (corr.student_id && alunosMap.has(corr.student_id)) return alunosMap.get(corr.student_id);
        return Array.from(alunosMap.values()).find(
          (a: any) => a.nome === corr.student_name || a.matricula === corr.student_id
        ) || null;
      };

      // Buscar notas discursivas existentes
      const correctionIds = (corrections || []).map((c: any) => c.id);
      let existingAnswers: any[] = [];
      if (correctionIds.length > 0) {
        const { data: answers } = await supabase
          .from("student_answers")
          .select("correction_id, question_number, points_earned")
          .in("correction_id", correctionIds)
          .eq("question_type" as any, "discursive"); // tentativa por tipo
        // Fallback: buscar por question_number das discursivas (mais confiável)
        existingAnswers = answers || [];
      }

      // Indexar por correction_id → question_number → points_earned
      const answersIdx = new Map<string, Map<number, number | null>>();
      for (const ans of existingAnswers) {
        if (!answersIdx.has(ans.correction_id)) answersIdx.set(ans.correction_id, new Map());
        answersIdx.get(ans.correction_id)!.set(ans.question_number, ans.points_earned);
      }

      const buildScores = (correctionId: string | null): StudentDiscursive["scores"] => {
        const scores: StudentDiscursive["scores"] = {};
        // populated after discursiveQuestions loads — returns empty for now, updated later
        return scores;
      };

      const rowMap = new Map<string, StudentDiscursive>();

      for (const corr of corrections || []) {
        const aluno = findAluno(corr);
        const qScores: StudentDiscursive["scores"] = {};
        const qMap = answersIdx.get(corr.id) || new Map();
        // will be populated in useEffect when discursiveQuestions arrive
        rowMap.set(corr.id, {
          studentId: aluno?.id || corr.student_id || corr.student_name,
          studentName: corr.student_name,
          studentMatricula: aluno?.matricula || corr.student_id || null,
          campus: aluno?.campus || null,
          correctionId: corr.id,
          scores: qScores,
          _answerMap: qMap,
        } as any);
      }

      for (const [, aluno] of alunosMap) {
        if (!enrolledIds.includes(aluno.id)) continue;
        const hasCorrEntry = (corrections || []).some(
          (c: any) => c.student_id === aluno.id || c.student_name === aluno.nome
        );
        if (!hasCorrEntry) {
          rowMap.set(`enrolled_${aluno.id}`, {
            studentId: aluno.id,
            studentName: aluno.nome,
            studentMatricula: aluno.matricula,
            campus: aluno.campus,
            correctionId: null,
            scores: {},
            _answerMap: new Map(),
          } as any);
        }
      }

      setStudents(
        Array.from(rowMap.values()).sort((a, b) => a.studentName.localeCompare(b.studentName))
      );
    } catch (err: any) {
      toast({ title: "Erro inesperado", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Quando discursiveQuestions carregar, preencher os scores de cada aluno
  useEffect(() => {
    if (discursiveQuestions.length === 0 || students.length === 0) return;
    setStudents(prev => prev.map(s => {
      const ansMap: Map<number, number | null> = (s as any)._answerMap || new Map();
      const scores: StudentDiscursive["scores"] = {};
      for (const q of discursiveQuestions) {
        const val = ansMap.has(q.questionNumber) ? ansMap.get(q.questionNumber) : null;
        scores[q.questionNumber] = { earned: val ?? null, original: val ?? null, dirty: false };
      }
      return { ...s, scores };
    }));
  }, [discursiveQuestions]);

  // ── Notas de alunos já buscadas de student_answers mais específica (fallback)
  useEffect(() => {
    if (!selectedTemplate || discursiveQuestions.length === 0 || students.length === 0) return;
    const qNumbers = discursiveQuestions.map(q => q.questionNumber);
    const corrIds = students.map(s => s.correctionId).filter(Boolean) as string[];
    if (corrIds.length === 0 || qNumbers.length === 0) return;

    supabase
      .from("student_answers")
      .select("correction_id, question_number, points_earned")
      .in("correction_id", corrIds)
      .in("question_number", qNumbers)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const idx = new Map<string, Map<number, number | null>>();
        for (const ans of data) {
          if (!idx.has(ans.correction_id)) idx.set(ans.correction_id, new Map());
          idx.get(ans.correction_id)!.set(ans.question_number, ans.points_earned);
        }
        setStudents(prev => prev.map(s => {
          if (!s.correctionId || !idx.has(s.correctionId)) return s;
          const qMap = idx.get(s.correctionId)!;
          const newScores = { ...s.scores };
          for (const q of discursiveQuestions) {
            if (qMap.has(q.questionNumber)) {
              const val = qMap.get(q.questionNumber) ?? null;
              newScores[q.questionNumber] = { earned: val, original: val, dirty: false };
            }
          }
          return { ...s, scores: newScores };
        }));
      });
  }, [selectedTemplate, discursiveQuestions, students.length]);

  // ── Filtros ──
  const campuses = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) { if (s.campus) set.add(s.campus); }
    return Array.from(set).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = !search
        || s.studentName.toLowerCase().includes(search.toLowerCase())
        || (s.studentMatricula || "").toLowerCase().includes(search.toLowerCase());
      const matchCampus = campusFilter === "all" || s.campus === campusFilter;
      return matchSearch && matchCampus;
    });
  }, [students, search, campusFilter]);

  // ── Contadores ──
  const counts = useMemo(() => {
    const target = campusFilter === "all" ? students : students.filter(s => s.campus === campusFilter);
    const total = target.length;
    const nQs = discursiveQuestions.length;
    let scored = 0, dirty = 0;
    for (const s of target) {
      const allFilled = nQs > 0 && discursiveQuestions.every(
        q => s.scores[q.questionNumber]?.earned != null
      );
      if (allFilled) scored++;
      if (Object.values(s.scores).some(sc => sc.dirty)) dirty++;
    }
    return { total, scored, pending: total - scored, dirty, pct: total > 0 ? Math.round((scored / total) * 100) : 0 };
  }, [students, discursiveQuestions, campusFilter]);

  const isDirty = (s: StudentDiscursive) => Object.values(s.scores).some(sc => sc.dirty);

  // ── Alterar nota ──
  const handleScoreChange = useCallback((studentId: string, correctionId: string | null, questionNumber: number, value: string) => {
    setStudents(prev => prev.map(s => {
      if (s.studentId !== studentId && s.correctionId !== correctionId) return s;
      if (s.studentId !== studentId) return s;
      let earned: number | null = null;
      if (value !== "") {
        const parsed = parseFloat(value.replace(",", "."));
        if (!isNaN(parsed)) earned = Math.min(10, Math.max(0, parsed));
      }
      const orig = s.scores[questionNumber]?.original ?? null;
      return {
        ...s,
        scores: {
          ...s.scores,
          [questionNumber]: { earned, original: orig, dirty: earned !== orig },
        },
      };
    }));
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      const nextCol = colIdx + 1;
      if (nextCol < discursiveQuestions.length) {
        const key = `${filteredStudents[rowIdx].studentId}_${discursiveQuestions[nextCol].questionNumber}`;
        inputRefs.current.get(key)?.focus();
        inputRefs.current.get(key)?.select();
      } else {
        const nextRow = rowIdx + 1;
        if (nextRow < filteredStudents.length) {
          const key = `${filteredStudents[nextRow].studentId}_${discursiveQuestions[0].questionNumber}`;
          inputRefs.current.get(key)?.focus();
          inputRefs.current.get(key)?.select();
        }
      }
    }
  };

  // ── Salvar ──
  const saveAll = async () => {
    const dirtyStudents = students.filter(isDirty);
    if (dirtyStudents.length === 0) { toast({ title: "Nada para salvar" }); return; }

    setSaving(true);
    let saved = 0, errors = 0;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast({ title: "Não autenticado", variant: "destructive" }); setSaving(false); return; }

    for (const s of dirtyStudents) {
      try {
        let correctionId = s.correctionId;

        // Criar correção parcial se não existir
        if (!correctionId) {
          const { data: corr, error } = await supabase
            .from("corrections")
            .insert({
              user_id: user.id,
              template_id: selectedTemplate,
              student_name: s.studentName,
              student_id: s.studentMatricula,
              total_score: 0,
              max_score: 0,
              percentage: 0,
              status: "discursive_only",
            })
            .select("id")
            .single();
          if (error) throw error;
          correctionId = corr.id;
          setStudents(prev => prev.map(st =>
            st.studentId === s.studentId ? { ...st, correctionId: corr.id } : st
          ));
        }

        // Salvar respostas discursivas (select → update ou insert)
        const dirtyScores = discursiveQuestions.filter(q => s.scores[q.questionNumber]?.dirty);
        for (const q of dirtyScores) {
          const earned = s.scores[q.questionNumber]?.earned ?? null;

          // Verificar se já existe uma linha para esta questão
          const { data: existing } = await supabase
            .from("student_answers")
            .select("id")
            .eq("correction_id", correctionId!)
            .eq("question_number", q.questionNumber)
            .maybeSingle();

          if (existing?.id) {
            const { error } = await supabase
              .from("student_answers")
              .update({ points_earned: earned, is_correct: null })
              .eq("id", existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("student_answers")
              .insert({
                correction_id: correctionId,
                question_number: q.questionNumber,
                student_answer: earned != null ? String(earned) : null,
                is_correct: null,
                points_earned: earned,
              });
            if (error) throw error;
          }
        }
        saved++;
      } catch (err) {
        console.error("Erro ao salvar nota discursiva:", err);
        errors++;
      }
    }

    setStudents(prev => prev.map(s => ({
      ...s,
      scores: Object.fromEntries(
        Object.entries(s.scores).map(([k, v]) => [k, { ...v, original: v.earned, dirty: false }])
      ),
    })));

    setSaving(false);
    toast({
      title: `${saved} aluno(s) salvo(s)`,
      description: errors > 0 ? `${errors} erro(s) encontrados` : undefined,
      variant: errors > 0 ? "destructive" : "default",
    });
  };

  const hasDiscursive = discursiveQuestions.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Notas Discursivas</h1>
            <p className="text-sm text-muted-foreground">Digitação por prova com filtro por sede</p>
          </div>
          {counts.dirty > 0 && (
            <Button onClick={saveAll} disabled={saving}>
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" />Salvar {counts.dirty} alteração(ões)</>
              )}
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl space-y-4">
        {/* Seletor de prova */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Selecionar prova
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a prova para digitar as notas discursivas..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} — {examTypeLabel(t.exam_type)} ({t.total_questions} questões)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedTemplate && !loading && !hasDiscursive && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="pt-6 pb-6 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-amber-800">Esta prova não possui questões discursivas configuradas no gabarito.</p>
            </CardContent>
          </Card>
        )}

        {selectedTemplate && !loading && hasDiscursive && (
          <>
            {/* Progresso e filtros */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Notas completas</span>
                    <span className="font-medium">{counts.scored} / {counts.total} ({counts.pct}%)</span>
                  </div>
                  <Progress value={counts.pct} className="h-3" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="border rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{counts.scored}</div>
                    <div className="text-xs text-muted-foreground">Completos</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${counts.pending > 0 ? "text-destructive" : ""}`}>{counts.pending}</div>
                    <div className="text-xs text-muted-foreground">Pendentes</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${counts.dirty > 0 ? "text-amber-500" : ""}`}>{counts.dirty}</div>
                    <div className="text-xs text-muted-foreground">Não salvas</div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar nome ou matrícula..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={campusFilter} onValueChange={setCampusFilter}>
                    <SelectTrigger className="md:w-56">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as sedes ({students.length})</SelectItem>
                      {campuses.map(c => (
                        <SelectItem key={c} value={c}>{c} ({students.filter(s => s.campus === c).length})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Tabela */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Pencil className="h-5 w-5" />
                  Digitação — {discursiveQuestions.map(q => `${q.label} (0–${q.points})`).join(" · ")}
                </CardTitle>
                <CardDescription>
                  Use <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Tab</kbd> ou{" "}
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> para avançar entre campos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] border rounded-md">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Matrícula</TableHead>
                        <TableHead>Sede</TableHead>
                        {discursiveQuestions.map(q => (
                          <TableHead key={q.questionNumber} className="text-center w-28">
                            {q.label}<br /><span className="text-xs font-normal text-muted-foreground">0–{q.points} pts</span>
                          </TableHead>
                        ))}
                        <TableHead className="text-center w-24">Total</TableHead>
                        <TableHead className="w-16 text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6 + discursiveQuestions.length} className="text-center py-8 text-muted-foreground">
                            Nenhum aluno encontrado.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredStudents.map((s, rowIdx) => {
                          const anyDirty = isDirty(s);
                          const allFilled = discursiveQuestions.length > 0 && discursiveQuestions.every(q => s.scores[q.questionNumber]?.earned != null);
                          const total = discursiveQuestions.reduce((sum, q) => sum + (s.scores[q.questionNumber]?.earned ?? 0), 0);
                          const maxTotal = discursiveQuestions.reduce((sum, q) => sum + q.points, 0);

                          return (
                            <TableRow key={s.studentId} className={anyDirty ? "bg-amber-500/5" : !allFilled ? "bg-muted/30" : ""}>
                              <TableCell className="text-muted-foreground text-xs">{rowIdx + 1}</TableCell>
                              <TableCell className="font-medium">{s.studentName}</TableCell>
                              <TableCell className="text-muted-foreground">{s.studentMatricula || "-"}</TableCell>
                              <TableCell className="text-muted-foreground">{s.campus || "-"}</TableCell>
                              {discursiveQuestions.map((q, colIdx) => {
                                const sc = s.scores[q.questionNumber];
                                const key = `${s.studentId}_${q.questionNumber}`;
                                return (
                                  <TableCell key={q.questionNumber}>
                                    <Input
                                      ref={el => { if (el) inputRefs.current.set(key, el); }}
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="—"
                                      value={sc?.earned != null ? String(sc.earned) : ""}
                                      onChange={e => handleScoreChange(s.studentId, s.correctionId, q.questionNumber, e.target.value)}
                                      onKeyDown={e => handleKeyDown(e, rowIdx, colIdx)}
                                      onFocus={e => e.target.select()}
                                      className={`w-20 text-center mx-auto ${sc?.dirty ? "border-amber-500 ring-1 ring-amber-500/30" : ""}`}
                                    />
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-center">
                                {allFilled
                                  ? <span className="font-mono font-semibold text-primary">{total.toFixed(1)}<span className="text-xs text-muted-foreground">/{maxTotal}</span></span>
                                  : <span className="text-muted-foreground text-sm">—</span>}
                              </TableCell>
                              <TableCell className="text-center">
                                {anyDirty ? (
                                  <Badge variant="secondary" className="text-xs">editado</Badge>
                                ) : allFilled ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mx-auto" />
                                ) : (
                                  <CircleDashed className="h-4 w-4 text-muted-foreground mx-auto" />
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
                {counts.dirty > 0 && (
                  <div className="mt-4 flex justify-end">
                    <Button onClick={saveAll} disabled={saving} size="lg">
                      {saving
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                        : <><Save className="h-4 w-4 mr-2" />Salvar {counts.dirty} aluno(s)</>}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </main>
    </div>
  );
};

export default DiscursiveScores;
