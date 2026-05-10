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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  PenLine,
  Save,
  Loader2,
  Search,
  CheckCircle2,
  CircleDashed,
  Filter,
  FileText,
} from "lucide-react";

interface StudentEssay {
  studentId: string;
  studentName: string;
  studentMatricula: string | null;
  campus: string | null;
  correctionId: string | null;
  essayScore: number | null;
  originalScore: number | null;
  dirty: boolean;
}

const EssayScores = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [students, setStudents] = useState<StudentEssay[]>([]);
  const [search, setSearch] = useState("");
  const [campusFilter, setCampusFilter] = useState<string>("all");

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplate) loadStudents(selectedTemplate);
  }, [selectedTemplate]);

  const loadTemplates = async () => {
    const { data } = await supabase
      .from("templates")
      .select("id, name, total_questions, exam_type")
      .order("created_at", { ascending: false });
    setTemplates(data || []);
  };

  const loadStudents = async (templateId: string) => {
    setLoading(true);

    const [{ data: enrolled }, { data: corrections }] = await Promise.all([
      supabase
        .from("template_students")
        .select("student_id, students(id, name, student_id, campus)")
        .eq("template_id", templateId),
      supabase
        .from("corrections")
        .select("id, student_name, student_id, essay_score")
        .eq("template_id", templateId),
    ]);

    const corrByName = new Map<string, any>();
    const corrByMatricula = new Map<string, any>();
    for (const c of (corrections as any[]) || []) {
      if (c.student_name) corrByName.set(c.student_name, c);
      if (c.student_id) corrByMatricula.set(c.student_id, c);
    }

    const rows: StudentEssay[] = ((enrolled as any[]) || [])
      .map((e) => e.students)
      .filter(Boolean)
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
      .map((s: any) => {
        const corr =
          (s.student_id && corrByMatricula.get(s.student_id)) ||
          corrByName.get(s.name) ||
          null;

        return {
          studentId: s.id,
          studentName: s.name,
          studentMatricula: s.student_id,
          campus: s.campus,
          correctionId: corr?.id || null,
          essayScore: corr?.essay_score ?? null,
          originalScore: corr?.essay_score ?? null,
          dirty: false,
        };
      });

    setStudents(rows);
    setLoading(false);
  };

  // ── Campuses disponíveis ──
  const campuses = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      if (s.campus) set.add(s.campus);
    }
    return Array.from(set).sort();
  }, [students]);

  // ── Filtro ──
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchSearch =
        !search ||
        s.studentName.toLowerCase().includes(search.toLowerCase()) ||
        (s.studentMatricula || "").toLowerCase().includes(search.toLowerCase());
      const matchCampus = campusFilter === "all" || s.campus === campusFilter;
      return matchSearch && matchCampus;
    });
  }, [students, search, campusFilter]);

  // ── Contadores ──
  const counts = useMemo(() => {
    const filtered = campusFilter === "all" ? students : students.filter((s) => s.campus === campusFilter);
    const total = filtered.length;
    const scored = filtered.filter((s) => s.essayScore != null).length;
    const pending = total - scored;
    const dirty = filtered.filter((s) => s.dirty).length;
    const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
    return { total, scored, pending, dirty, pct };
  }, [students, campusFilter]);

  // ── Alterar nota ──
  const handleScoreChange = useCallback(
    (studentId: string, value: string) => {
      setStudents((prev) =>
        prev.map((s) => {
          if (s.studentId !== studentId) return s;
          let score: number | null = null;
          if (value !== "") {
            const parsed = parseFloat(value.replace(",", "."));
            if (!isNaN(parsed)) {
              score = Math.min(10, Math.max(0, parsed));
            }
          }
          return {
            ...s,
            essayScore: score,
            dirty: score !== s.originalScore,
          };
        })
      );
    },
    []
  );

  // ── Navegar inputs com Tab/Enter ──
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      const nextStudent = filteredStudents[index + 1];
      if (nextStudent) {
        const nextInput = inputRefs.current.get(nextStudent.studentId);
        nextInput?.focus();
        nextInput?.select();
      }
    }
  };

  // ── Salvar em lote ──
  const saveAll = async () => {
    const dirtyStudents = students.filter((s) => s.dirty);
    if (dirtyStudents.length === 0) {
      toast({ title: "Nada para salvar" });
      return;
    }

    setSaving(true);
    let saved = 0;
    let errors = 0;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Não autenticado", variant: "destructive" });
      setSaving(false);
      return;
    }

    for (const s of dirtyStudents) {
      try {
        if (s.correctionId) {
          // Atualizar correção existente
          const { error } = await supabase
            .from("corrections")
            .update({ essay_score: s.essayScore })
            .eq("id", s.correctionId);
          if (error) throw error;
        } else {
          // Criar correção parcial só com a nota de redação
          const { data: corr, error } = await supabase
            .from("corrections")
            .insert({
              user_id: user.id,
              template_id: selectedTemplate,
              student_name: s.studentName,
              student_id: s.studentMatricula,
              essay_score: s.essayScore,
              total_score: 0,
              max_score: 0,
              percentage: 0,
              status: "essay_only",
            })
            .select("id")
            .single();
          if (error) throw error;

          // Atualizar correctionId local
          setStudents((prev) =>
            prev.map((st) =>
              st.studentId === s.studentId
                ? { ...st, correctionId: corr.id }
                : st
            )
          );
        }
        saved++;
      } catch {
        errors++;
      }
    }

    // Limpar dirty flags
    setStudents((prev) =>
      prev.map((s) => ({
        ...s,
        originalScore: s.essayScore,
        dirty: false,
      }))
    );

    setSaving(false);
    toast({
      title: `${saved} nota(s) salva(s)`,
      description: errors > 0 ? `${errors} erro(s) encontrados` : undefined,
      variant: errors > 0 ? "destructive" : "default",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Notas de Redação</h1>
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

      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-4">
        {/* ══════ Seletor de prova ══════ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Selecionar prova
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a prova para digitar as notas de redação..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} — {t.exam_type} ({t.total_questions} questões)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedTemplate && !loading && (
          <>
            {/* ══════ Progresso e filtros ══════ */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                {/* Barra de progresso */}
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Notas digitadas</span>
                    <span className="font-medium">
                      {counts.scored} / {counts.total} ({counts.pct}%)
                    </span>
                  </div>
                  <Progress value={counts.pct} className="h-3" />
                </div>

                {/* Contadores */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="border rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{counts.scored}</div>
                    <div className="text-xs text-muted-foreground">Digitadas</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${counts.pending > 0 ? "text-destructive" : ""}`}>
                      {counts.pending}
                    </div>
                    <div className="text-xs text-muted-foreground">Pendentes</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${counts.dirty > 0 ? "text-amber-500" : ""}`}>
                      {counts.dirty}
                    </div>
                    <div className="text-xs text-muted-foreground">Não salvas</div>
                  </div>
                </div>

                {/* Filtros */}
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
                  <Select value={campusFilter} onValueChange={setCampusFilter}>
                    <SelectTrigger className="md:w-56">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as sedes ({students.length})</SelectItem>
                      {campuses.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c} ({students.filter((s) => s.campus === c).length})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* ══════ Tabela de digitação ══════ */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <PenLine className="h-5 w-5" />
                  Digitação
                </CardTitle>
                <CardDescription>
                  Use <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Tab</kbd> ou{" "}
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> para
                  avançar entre campos. Nota de 0 a 10 (aceita decimal).
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
                        <TableHead className="w-32 text-center">Nota (0-10)</TableHead>
                        <TableHead className="w-16 text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            Nenhum aluno encontrado.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredStudents.map((s, idx) => (
                          <TableRow
                            key={s.studentId}
                            className={
                              s.dirty
                                ? "bg-amber-500/5"
                                : s.essayScore != null
                                  ? ""
                                  : "bg-muted/30"
                            }
                          >
                            <TableCell className="text-muted-foreground text-xs">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="font-medium">{s.studentName}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {s.studentMatricula || "-"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {s.campus || "-"}
                            </TableCell>
                            <TableCell>
                              <Input
                                ref={(el) => {
                                  if (el) inputRefs.current.set(s.studentId, el);
                                }}
                                type="text"
                                inputMode="decimal"
                                placeholder="—"
                                value={s.essayScore != null ? String(s.essayScore) : ""}
                                onChange={(e) => handleScoreChange(s.studentId, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, idx)}
                                onFocus={(e) => e.target.select()}
                                className={`w-24 text-center mx-auto ${
                                  s.dirty ? "border-amber-500 ring-1 ring-amber-500/30" : ""
                                }`}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              {s.dirty ? (
                                <Badge variant="secondary" className="text-xs">
                                  editado
                                </Badge>
                              ) : s.essayScore != null ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 mx-auto" />
                              ) : (
                                <CircleDashed className="h-4 w-4 text-muted-foreground mx-auto" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>

                {counts.dirty > 0 && (
                  <div className="mt-4 flex justify-end">
                    <Button onClick={saveAll} disabled={saving} size="lg">
                      {saving ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                      ) : (
                        <><Save className="h-4 w-4 mr-2" />Salvar {counts.dirty} nota(s)</>
                      )}
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

export default EssayScores;
