import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileDown, Download, Trophy, Mail, Loader2, Users } from "lucide-react";
import FlemingLogo from "@/components/FlemingLogo";
import jsPDF from "jspdf";
import {
  buildPDFForStudentUfsc,
  loadLogoBase64,
  calcUfscTotal,
  calcUfscBase100,
} from "@/lib/pdf-boletim-ufsc";

interface Correction {
  id: string;
  student_name: string;
  student_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  template_id: string;
  created_at: string;
  essay_score: number | null;
}

interface StudentAnswer {
  question_number: number;
  student_answer: string | null;
  correct_answer: string;
  is_correct: boolean | null;
  points_earned: number | null;
}

interface TemplateQuestion {
  question_number: number;
  correct_answer: string;
  points: number;
  subject: string | null;
  question_type: string;
  num_propositions: number | null;
}

interface Template {
  id: string;
  name: string;
  exam_type: string;
  total_questions: number;
}

interface StudentMeta {
  campus?: string | null;
  foreign_language?: string | null;
  email?: string | null;
}

// ===== Subject grouping (must match pdf-boletim-ufsc.ts) =====
const MAIN_SUBJECTS = ["Biologia", "Matemática", "Segunda Língua", "Primeira Língua"];
const AFTER_HUMANAS = ["Física", "Química"];
const CIENCIAS_HUMANAS_SUBGROUPS = [
  { label: "História", subjects: ["História"] },
  { label: "Geografia", subjects: ["Geografia", "Interdisciplinar"] },
  { label: "Filosofia / Sociologia", subjects: ["Filosofia", "Sociologia"] },
];
const ALL_CIENCIAS = CIENCIAS_HUMANAS_SUBGROUPS.flatMap((g) => g.subjects);
const SUBJECT_DISPLAY: Record<string, string> = {
  "Primeira Língua": "Primeira Língua (Língua Portuguesa ou Libras)",
};

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

const BoletimUfsc = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [selectedCorrection, setSelectedCorrection] = useState<string>("");
  const [selectedCampus, setSelectedCampus] = useState<string>("all");
  const [studentAnswers, setStudentAnswers] = useState<StudentAnswer[]>([]);
  const [templateQuestions, setTemplateQuestions] = useState<TemplateQuestion[]>([]);
  const [allCorrections, setAllCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingAllEmails, setSendingAllEmails] = useState(false);
  const [studentsMetaMap, setStudentsMetaMap] = useState<Record<string, StudentMeta>>({});

  useEffect(() => {
    checkAuth();
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
    if (allCorrections.length > 0) loadStudentsMeta();
  }, [allCorrections]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) navigate("/auth");
  };

  const loadTemplates = async () => {
    const { data } = await supabase.from("templates").select("*").order("created_at", { ascending: false });
    setTemplates(data || []);
  };

  const loadCorrections = async () => {
    const { data, error } = await supabase
      .from("corrections")
      .select("*")
      .eq("template_id", selectedTemplate)
      .eq("status", "completed")
      .order("student_name");
    if (error) { toast({ title: "Erro ao carregar correções", variant: "destructive" }); return; }
    setCorrections(data || []);
    setAllCorrections(data || []);
  };

  const loadTemplateQuestions = async () => {
    const { data } = await supabase
      .from("template_questions")
      .select("*")
      .eq("template_id", selectedTemplate)
      .order("question_number");
    setTemplateQuestions(
      (data || []).map((q: any) => ({
        ...q,
        question_type: q.question_type ?? "objective",
        num_propositions: q.num_propositions ?? null,
      }))
    );
  };

  const loadStudentAnswers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("student_answers")
      .select("*")
      .eq("correction_id", selectedCorrection)
      .order("question_number");
    setStudentAnswers(data || []);
    setLoading(false);
  };

  const loadStudentsMeta = async () => {
    const names = [...new Set(allCorrections.map((c) => c.student_name))];
    if (names.length === 0) return;
    const { data } = await supabase.from("students").select("name, campus, foreign_language, email").in("name", names);
    if (data) {
      const map: Record<string, StudentMeta> = {};
      data.forEach((s: any) => { map[s.name] = { campus: s.campus, foreign_language: s.foreign_language, email: s.email }; });
      setStudentsMetaMap(map);
    }
  };

  const loadAnswersForCorrection = async (correctionId: string): Promise<StudentAnswer[]> => {
    const { data } = await supabase.from("student_answers").select("*").eq("correction_id", correctionId).order("question_number");
    return data || [];
  };

  // ===== Score calculations =====

  const sumPoints = (subjectNames: string[], answers: StudentAnswer[]): number => {
    let score = 0;
    for (const a of answers) {
      const q = templateQuestions.find((tq) => tq.question_number === a.question_number);
      if (q?.subject && subjectNames.includes(q.subject) && q.question_type !== "discursive") {
        score += a.points_earned ?? 0;
      }
    }
    return Math.round(score * 100) / 100;
  };

  const sumDiscursive = (answers: StudentAnswer[]): number => {
    let score = 0;
    for (const a of answers) {
      const q = templateQuestions.find((tq) => tq.question_number === a.question_number);
      if (q?.question_type === "discursive") score += a.points_earned ?? 0;
    }
    return Math.round(score * 100) / 100;
  };

  const getUfscBase100 = (corr: Correction) =>
    calcUfscBase100(calcUfscTotal(corr.total_score ?? 0, corr.essay_score ?? 0));

  const calculateRankingFor = (correctionId: string): number => {
    if (allCorrections.length === 0) return 0;
    const sorted = [...allCorrections].sort((a, b) => getUfscBase100(b) - getUfscBase100(a));
    return sorted.findIndex((c) => c.id === correctionId) + 1;
  };

  const maxClassScore = allCorrections.reduce((max, c) => {
    const s = getUfscBase100(c);
    return s > max ? s : max;
  }, 0);

  const avgClassScore =
    allCorrections.length > 0
      ? allCorrections.reduce((s, c) => s + getUfscBase100(c), 0) / allCorrections.length
      : 0;

  // ===== Current student data =====

  const filteredCorrections = selectedCampus === "all"
    ? corrections
    : corrections.filter((c) => studentsMetaMap[c.student_name]?.campus === selectedCampus);

  const availableCampuses = [...new Set(
    corrections.map((c) => studentsMetaMap[c.student_name]?.campus).filter(Boolean)
  )] as string[];

  const selectedStudent = filteredCorrections.find((c) => c.id === selectedCorrection);
  const ranking = selectedCorrection ? calculateRankingFor(selectedCorrection) : 0;

  const essayScore = selectedStudent?.essay_score ?? 0;
  const discursiveScore = sumDiscursive(studentAnswers);
  const cienciasScore = sumPoints(ALL_CIENCIAS, studentAnswers);
  const totalWithWeight = calcUfscTotal((selectedStudent?.total_score ?? 0), essayScore);
  const base100 = calcUfscBase100(totalWithWeight);

  interface ScoreRow { label: string; score: number; bold?: boolean; amber?: boolean; sub?: boolean }
  const scoreRows: ScoreRow[] = [
    ...MAIN_SUBJECTS.map((s) => ({
      label: SUBJECT_DISPLAY[s] ?? s,
      score: sumPoints([s], studentAnswers),
      amber: true,
    })),
    { label: "Ciências Humanas e Sociais*", score: cienciasScore, amber: true },
    ...AFTER_HUMANAS.map((s) => ({ label: s, score: sumPoints([s], studentAnswers), amber: true })),
    { label: "Redação (peso 1)**", score: essayScore, amber: true },
    { label: "Discursivas", score: discursiveScore, amber: true },
    { label: "Total (com peso 1,5 para Redação)", score: totalWithWeight, bold: true },
  ];

  // ===== PDF =====

  const generatePDF = async (correction: Correction, answers: StudentAnswer[]): Promise<jsPDF> => {
    const doc = new jsPDF();
    const logoData = await loadLogoBase64();
    const templateObj = templates.find((t) => t.id === selectedTemplate);
    buildPDFForStudentUfsc({
      doc,
      student: correction,
      answers,
      templateQuestions,
      allCorrections,
      studentRanking: calculateRankingFor(correction.id),
      isFirst: true,
      logoData,
      studentMeta: studentsMetaMap[correction.student_name],
      templateName: templateObj?.name,
    });
    return doc;
  };

  const handleGeneratePDF = async () => {
    if (!selectedStudent) return;
    const doc = await generatePDF(selectedStudent, studentAnswers);
    doc.save(`boletim_${selectedStudent.student_name.replace(/\s+/g, "_")}_UFSC.pdf`);
    toast({ title: "PDF gerado com sucesso!" });
  };

  const handleGenerateAll = async () => {
    if (allCorrections.length === 0) return;
    setGeneratingAll(true);
    try {
      const doc = new jsPDF();
      const logoData = await loadLogoBase64();
      const sorted = [...allCorrections].sort((a, b) => getUfscBase100(b) - getUfscBase100(a));
      const templateObj = templates.find((t) => t.id === selectedTemplate);
      for (let i = 0; i < allCorrections.length; i++) {
        const corr = allCorrections[i];
        const answers = await loadAnswersForCorrection(corr.id);
        buildPDFForStudentUfsc({
          doc,
          student: corr,
          answers,
          templateQuestions,
          allCorrections,
          studentRanking: sorted.findIndex((c) => c.id === corr.id) + 1,
          isFirst: i === 0,
          logoData,
          studentMeta: studentsMetaMap[corr.student_name],
          templateName: templateObj?.name,
        });
      }
      doc.save(`boletins_UFSC_todos.pdf`);
      toast({ title: `${allCorrections.length} boletins gerados!` });
    } catch {
      toast({ title: "Erro ao gerar PDFs", variant: "destructive" });
    } finally {
      setGeneratingAll(false);
    }
  };

  const handleGenerateRanking = async () => {
    if (allCorrections.length === 0) return;
    const doc = new jsPDF();
    const logoData = await loadLogoBase64();
    const sorted = [...allCorrections].sort((a, b) => getUfscBase100(b) - getUfscBase100(a));
    const templateObj = templates.find((t) => t.id === selectedTemplate);
    const pageW = doc.internal.pageSize.getWidth();

    if (logoData) doc.addImage(logoData, "PNG", 14, 8, 28, 28);
    doc.setFontSize(16).setFont("helvetica", "bold").setTextColor(30, 30, 30);
    doc.text("Classificação Geral — UFSC", pageW / 2, 16, { align: "center" });
    doc.setFontSize(11).setFont("helvetica", "normal");
    doc.text(templateObj?.name || "Simulado", pageW / 2, 24, { align: "center" });
    doc.text(`Total de alunos: ${sorted.length}   |   Data: ${new Date().toLocaleDateString("pt-BR")}`, pageW / 2, 30, { align: "center" });

    doc.setDrawColor(0, 60, 130).setLineWidth(0.5).line(14, 36, pageW - 14, 36);

    let y = 46;
    const cols = { pos: 18, name: 32, campus: 120, score: 150, pct: 178 };

    const drawHeader = () => {
      doc.setFillColor(0, 60, 130).rect(14, y - 5, pageW - 28, 8, "F");
      doc.setTextColor(255, 255, 255).setFontSize(9).setFont("helvetica", "bold");
      doc.text("Pos.", cols.pos, y);
      doc.text("Aluno", cols.name, y);
      doc.text("Sede", cols.campus, y);
      doc.text("Total", cols.score, y);
      doc.text("Base 100", cols.pct, y);
      doc.setTextColor(0, 0, 0);
      y += 8;
    };

    drawHeader();
    doc.setFontSize(9).setFont("helvetica", "normal");

    for (let i = 0; i < sorted.length; i++) {
      if (y > 275) { doc.addPage(); y = 20; drawHeader(); }
      const c = sorted[i];
      const meta = studentsMetaMap[c.student_name];
      if (i % 2 === 0) { doc.setFillColor(248, 248, 248).rect(14, y - 4, pageW - 28, 7, "F"); }
      doc.setFont("helvetica", i < 3 ? "bold" : "normal");
      doc.text(`${i + 1}º`, cols.pos, y);
      const name = c.student_name.length > 42 ? c.student_name.substring(0, 42) + "…" : c.student_name;
      doc.text(name, cols.name, y);
      doc.text(meta?.campus || "-", cols.campus, y);
      const cTotal = calcUfscTotal(c.total_score ?? 0, c.essay_score ?? 0);
      doc.text(fmt(cTotal), cols.score, y);
      const cBase100 = calcUfscBase100(cTotal);
      const pct = cBase100;
      if (pct >= 70) doc.setTextColor(0, 60, 130);
      else if (pct >= 50) doc.setTextColor(200, 150, 0);
      else doc.setTextColor(200, 50, 50);
      doc.text(fmt(pct), cols.pct, y);
      doc.setTextColor(0, 0, 0).setFont("helvetica", "normal");
      y += 7;
    }

    doc.save(`classificacao_UFSC_${(templateObj?.name || "simulado").replace(/\s+/g, "_")}.pdf`);
    toast({ title: "Classificação gerada!" });
  };

  const generatePDFBase64 = async (correction: Correction, answers: StudentAnswer[]): Promise<string> => {
    const doc = await generatePDF(correction, answers);
    return doc.output("datauristring").split(",")[1];
  };

  const sendEmailToStudent = async () => {
    if (!selectedStudent) return;
    const meta = studentsMetaMap[selectedStudent.student_name];
    if (!meta?.email) {
      toast({ title: "E-mail não cadastrado", description: "Cadastre o e-mail do aluno na página de Alunos.", variant: "destructive" });
      return;
    }
    setSendingEmail(true);
    try {
      const pdfBase64 = await generatePDFBase64(selectedStudent, studentAnswers);
      const templateName = templates.find((t) => t.id === selectedTemplate)?.name || "Simulado";
      const { data, error } = await supabase.functions.invoke("send-boletim-email", {
        body: { to: meta.email, studentName: selectedStudent.student_name, templateName, pdfBase64 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "E-mail enviado!", description: `Boletim enviado para ${meta.email}` });
    } catch (err: unknown) {
      toast({ title: "Erro ao enviar e-mail", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  const sendEmailToAll = async () => {
    setSendingAllEmails(true);
    let sent = 0; let failed = 0;
    const templateName = templates.find((t) => t.id === selectedTemplate)?.name || "Simulado";
    try {
      for (const correction of allCorrections) {
        const meta = studentsMetaMap[correction.student_name];
        if (!meta?.email) { failed++; continue; }
        try {
          const answers = await loadAnswersForCorrection(correction.id);
          const pdfBase64 = await generatePDFBase64(correction, answers);
          const { data, error } = await supabase.functions.invoke("send-boletim-email", {
            body: { to: meta.email, studentName: correction.student_name, templateName, pdfBase64 },
          });
          if (error || data?.error) failed++; else sent++;
        } catch { failed++; }
      }
      toast({ title: "Envio concluído", description: `${sent} enviado(s), ${failed} falha(s) ou sem e-mail.` });
    } finally {
      setSendingAllEmails(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/boletins")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <FlemingLogo size="sm" />
            <h1 className="text-xl font-bold">Boletim de Desempenho UFSC</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {allCorrections.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleGenerateRanking}>
                <Trophy className="h-4 w-4 mr-2" />
                Classificação
              </Button>
            )}
            {allCorrections.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleGenerateAll} disabled={generatingAll}>
                <Download className="h-4 w-4 mr-2" />
                {generatingAll ? "Gerando..." : `Todos (${allCorrections.length})`}
              </Button>
            )}
            {allCorrections.length > 0 && (
              <Button variant="outline" size="sm" onClick={sendEmailToAll} disabled={sendingAllEmails}>
                {sendingAllEmails ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                {sendingAllEmails ? "Enviando..." : "Enviar Todos"}
              </Button>
            )}
            {selectedStudent && (
              <Button size="sm" onClick={handleGeneratePDF}>
                <FileDown className="h-4 w-4 mr-2" />
                Gerar PDF
              </Button>
            )}
            {selectedStudent && (
              <Button variant="outline" size="sm" onClick={sendEmailToStudent} disabled={sendingEmail}>
                {sendingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                {sendingEmail ? "Enviando..." : "Enviar E-mail"}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Seleção */}
          <Card>
            <CardHeader>
              <CardTitle>Selecionar Aluno</CardTitle>
              <CardDescription>Escolha o simulado UFSC e o aluno para visualizar o boletim</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Simulado / Prova</label>
                <Select value={selectedTemplate} onValueChange={(v) => { setSelectedTemplate(v); setSelectedCorrection(""); setSelectedCampus("all"); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a prova" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.total_questions} q)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Sede</label>
                <Select value={selectedCampus} onValueChange={(v) => { setSelectedCampus(v); setSelectedCorrection(""); }} disabled={!selectedTemplate}>
                  <SelectTrigger><SelectValue placeholder="Todas as sedes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as sedes</SelectItem>
                    {availableCampuses.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Aluno</label>
                <Select value={selectedCorrection} onValueChange={setSelectedCorrection} disabled={!selectedTemplate}>
                  <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
                  <SelectContent>
                    {filteredCorrections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.student_name} — {fmt(calcUfscBase100(calcUfscTotal(c.total_score ?? 0, c.essay_score ?? 0)))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {templates.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">Nenhum template encontrado. Crie um template do tipo UFSC primeiro.</p>
                <Button onClick={() => navigate("/templates")}>Criar Template</Button>
              </CardContent>
            </Card>
          )}

          {selectedStudent && !loading && (
            <>
              {/* Resumo executivo */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardContent className="pt-6 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Pontuação Final</p>
                    <p className="text-4xl font-bold text-blue-700">{fmt(base100)}</p>
                    <p className="text-xs text-muted-foreground">base 100</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total (c/ peso Redação)</p>
                    <p className="text-3xl font-bold">{fmt(totalWithWeight)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Ranking</p>
                    <p className="text-3xl font-bold">
                      {ranking}º <span className="text-sm font-normal text-muted-foreground">de {allCorrections.length}</span>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Maior Nota Turma</p>
                    <p className="text-3xl font-bold text-amber-600">{fmt(maxClassScore)}</p>
                    <p className="text-xs text-muted-foreground">Média: {fmt(avgClassScore)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Boletim preview */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Performance table */}
                <Card>
                  <CardHeader className="bg-amber-500 rounded-t-lg py-3">
                    <CardTitle className="text-white text-center text-base">Desempenho do candidato</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Disciplina</TableHead>
                          <TableHead className="text-center">Pontuação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scoreRows.map((row, i) => (
                          <TableRow key={i} className={row.bold ? "bg-muted font-bold" : ""}>
                            <TableCell className={row.bold ? "font-bold" : ""}>{row.label}</TableCell>
                            <TableCell className={`text-center font-semibold ${row.bold ? "" : "text-amber-600"}`}>
                              {fmt(row.score)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  {/* Pontuação final box */}
                  <Card className="border-blue-300 bg-blue-50">
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm font-semibold text-blue-700">Pontuação final</p>
                      <p className="text-sm text-blue-600">(base 100)</p>
                      <p className="text-5xl font-bold text-blue-800 mt-2">{fmt(base100)}</p>
                    </CardContent>
                  </Card>

                  {/* Ciências Humanas detail */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Detalhamento Ciências Humanas e Sociais</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            {CIENCIAS_HUMANAS_SUBGROUPS.map((g) => (
                              <TableHead key={g.label} className="text-center text-xs">{g.label}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            {CIENCIAS_HUMANAS_SUBGROUPS.map((g) => (
                              <TableCell key={g.label} className="text-center font-semibold text-amber-600">
                                {fmt(sumPoints(g.subjects, studentAnswers))}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Student info */}
                  <Card>
                    <CardContent className="pt-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground font-medium">Nome do Candidato</span>
                        <span className="font-semibold">{selectedStudent.student_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground font-medium">Sede</span>
                        <span>{studentsMetaMap[selectedStudent.student_name]?.campus || "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground font-medium">ID FLEMING</span>
                        <span>{selectedStudent.student_id || "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground font-medium">Redação</span>
                        <span className="font-semibold text-amber-600">{fmt(essayScore)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default BoletimUfsc;
