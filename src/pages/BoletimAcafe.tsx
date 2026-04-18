import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileDown, Users, Download, Trophy, Mail, Loader2 } from "lucide-react";
import FlemingLogo from "@/components/FlemingLogo";
import { getSubjectLabel, getSubjectColor } from "@/lib/acafe-subjects";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";
import jsPDF from "jspdf";
import { buildPDFForStudent, loadLogoBase64 } from "@/lib/pdf-boletim-acafe";

interface Correction {
  id: string;
  student_name: string;
  student_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  template_id: string;
  created_at: string;
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
  topic: string | null;
}

interface Template {
  id: string;
  name: string;
  exam_type: string;
  total_questions: number;
}

interface SubjectStats {
  subject: string;
  label: string;
  correct: number;
  total: number;
  percentage: number;
  color: string;
}

interface ClassStats {
  subject: string;
  label: string;
  studentPercentage: number;
  classAverage: number;
  studentCorrect: number;
  studentTotal: number;
  classCorrect: number;
  classTotalQuestions: number;
  color: string;
}

interface StudentMeta {
  campus?: string | null;
  foreign_language?: string | null;
  email?: string | null;
}

const BoletimAcafe = () => {
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
  const [allStudentAnswersMap, setAllStudentAnswersMap] = useState<Map<string, StudentAnswer[]>>(new Map());

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
    if (selectedCorrection) {
      loadStudentAnswers();
    }
  }, [selectedCorrection]);

  // Load student metadata (campus, foreign_language) for all students in corrections
  useEffect(() => {
    if (allCorrections.length > 0) {
      loadStudentsMeta();
      loadAllStudentAnswers();
    }
  }, [allCorrections]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) navigate("/auth");
  };

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar templates", variant: "destructive" });
      return;
    }
    setTemplates(data || []);
  };

  const loadCorrections = async () => {
    const { data, error } = await supabase
      .from("corrections")
      .select("*")
      .eq("template_id", selectedTemplate)
      .eq("status", "completed")
      .order("student_name");

    if (error) {
      toast({ title: "Erro ao carregar correções", variant: "destructive" });
      return;
    }
    setCorrections(data || []);
    setAllCorrections(data || []);
  };

  const loadTemplateQuestions = async () => {
    const { data, error } = await supabase
      .from("template_questions")
      .select("*")
      .eq("template_id", selectedTemplate)
      .order("question_number");

    if (error) {
      toast({ title: "Erro ao carregar questões", variant: "destructive" });
      return;
    }
    setTemplateQuestions(data || []);
  };

  const loadStudentAnswers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("student_answers")
      .select("*")
      .eq("correction_id", selectedCorrection)
      .order("question_number");

    if (error) {
      toast({ title: "Erro ao carregar respostas", variant: "destructive" });
    }
    setStudentAnswers(data || []);
    setLoading(false);
  };

  const loadStudentsMeta = async () => {
    const names = [...new Set(allCorrections.map((c) => c.student_name))];
    if (names.length === 0) return;

    const { data } = await supabase
      .from("students")
      .select("name, campus, foreign_language, email")
      .in("name", names);

    if (data) {
      const map: Record<string, StudentMeta> = {};
      data.forEach((s: { name: string; campus: string | null; foreign_language: string | null; email: string | null }) => {
        map[s.name] = { campus: s.campus, foreign_language: s.foreign_language, email: s.email };
      });
      setStudentsMetaMap(map);
    }
  };

  const loadAllStudentAnswers = async () => {
    const map = new Map<string, StudentAnswer[]>();
    for (const corr of allCorrections) {
      const answers = await loadAnswersForCorrection(corr.id);
      map.set(corr.id, answers);
    }
    setAllStudentAnswersMap(map);
  };

  const loadAnswersForCorrection = async (correctionId: string): Promise<StudentAnswer[]> => {
    const { data } = await supabase
      .from("student_answers")
      .select("*")
      .eq("correction_id", correctionId)
      .order("question_number");
    return data || [];
  };

  const calculateSubjectStatsFromAnswers = (answers: StudentAnswer[]): SubjectStats[] => {
    const stats: Record<string, { correct: number; total: number }> = {};
    answers.forEach((answer) => {
      const question = templateQuestions.find((q) => q.question_number === answer.question_number);
      const subject = question?.subject || "sem_disciplina";
      if (!stats[subject]) stats[subject] = { correct: 0, total: 0 };
      stats[subject].total++;
      if (answer.is_correct) stats[subject].correct++;
    });

    return Object.entries(stats)
      .filter(([subject]) => subject !== "sem_disciplina")
      .map(([subject, data]) => ({
        subject,
        label: getSubjectLabel(subject),
        correct: data.correct,
        total: data.total,
        percentage: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        color: getSubjectColor(subject),
      }));
  };

  const calculateSubjectStats = (): SubjectStats[] => {
    return calculateSubjectStatsFromAnswers(studentAnswers);
  };

  const calculateClassComparison = (): ClassStats[] => {
    const subjectStats = calculateSubjectStats();

    // Calculate per-subject class averages from all students' answers
    const subjectTotals: Record<string, { correct: number; total: number }> = {};
    allStudentAnswersMap.forEach((answers) => {
      answers.forEach((answer) => {
        const question = templateQuestions.find((q) => q.question_number === answer.question_number);
        const subject = question?.subject || "sem_disciplina";
        if (subject === "sem_disciplina") return;
        if (!subjectTotals[subject]) subjectTotals[subject] = { correct: 0, total: 0 };
        subjectTotals[subject].total++;
        if (answer.is_correct) subjectTotals[subject].correct++;
      });
    });

    return subjectStats.map((stat) => {
      const classData = subjectTotals[stat.subject];
      const classAvg = classData && classData.total > 0
        ? Math.round((classData.correct / classData.total) * 100)
        : 0;
      return {
        subject: stat.subject,
        label: stat.label,
        studentPercentage: stat.percentage,
        classAverage: classAvg,
        studentCorrect: stat.correct,
        studentTotal: stat.total,
        classCorrect: classData?.correct || 0,
        classTotalQuestions: classData?.total || 0,
        color: stat.color,
      };
    });
  };

  const getWrongQuestions = () => {
    return studentAnswers
      .filter((a) => !a.is_correct)
      .map((a) => {
        const question = templateQuestions.find((q) => q.question_number === a.question_number);
        return {
          question: a.question_number,
          subject: getSubjectLabel(question?.subject || ""),
          topic: question?.topic || "",
          studentAnswer: a.student_answer || "-",
          correctAnswer: a.correct_answer,
        };
      });
  };

  const calculateRankingFor = (correctionId: string): number => {
    if (allCorrections.length === 0) return 0;
    const sorted = [...allCorrections].sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
    return sorted.findIndex((c) => c.id === correctionId) + 1;
  };

  const calculateRanking = (): number => {
    if (!selectedCorrection) return 0;
    return calculateRankingFor(selectedCorrection);
  };

  // Filter corrections by campus
  const filteredCorrections = selectedCampus === "all"
    ? corrections
    : corrections.filter((c) => studentsMetaMap[c.student_name]?.campus === selectedCampus);

  // Get unique campuses from student meta
  const availableCampuses = [...new Set(
    corrections
      .map((c) => studentsMetaMap[c.student_name]?.campus)
      .filter(Boolean)
  )] as string[];

  const selectedStudent = filteredCorrections.find((c) => c.id === selectedCorrection);
  const subjectStats = calculateSubjectStats();
  const classComparison = calculateClassComparison();
  const wrongQuestions = getWrongQuestions();
  const ranking = calculateRanking();

  const generatePDF = async () => {
    if (!selectedStudent) return;

    const doc = new jsPDF();
    const logoData = await loadLogoBase64();
    const studentRanking = calculateRankingFor(selectedCorrection);

    // Build allStudentAnswers map for per-subject class averages
    const allStudentAnswersMap = new Map<string, any[]>();
    for (const corr of allCorrections) {
      if (corr.id === selectedCorrection) {
        allStudentAnswersMap.set(corr.id, studentAnswers);
      } else {
        const ans = await loadAnswersForCorrection(corr.id);
        allStudentAnswersMap.set(corr.id, ans);
      }
    }

    buildPDFForStudent({
      doc,
      student: selectedStudent,
      answers: studentAnswers,
      templateQuestions,
      allCorrections,
      studentRanking,
      isFirst: true,
      logoData,
      studentMeta: studentsMetaMap[selectedStudent.student_name],
      allStudentAnswers: allStudentAnswersMap,
    });

    doc.save(`boletim_${selectedStudent.student_name.replace(/\s+/g, "_")}_ACAFE.pdf`);
    toast({ title: "PDF gerado com sucesso!" });
  };

  const generateRankingPDF = async () => {
    if (allCorrections.length === 0) return;

    const doc = new jsPDF();
    const logoData = await loadLogoBase64();
    const sorted = [...allCorrections].sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
    const templateName = templates.find((t) => t.id === selectedTemplate)?.name || "Simulado";

    const pageW = doc.internal.pageSize.getWidth();
    if (logoData) {
      doc.addImage(logoData, "PNG", 14, 10, 30, 30);
    }
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Classificação Geral", logoData ? 50 : 14, 22);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(templateName, logoData ? 50 : 14, 30);
    doc.text(`Total de alunos: ${sorted.length}`, logoData ? 50 : 14, 36);
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, pageW - 14, 22, { align: "right" });

    doc.setDrawColor(34, 139, 34);
    doc.setLineWidth(0.8);
    doc.line(14, 44, pageW - 14, 44);

    let y = 54;
    const colPos = { pos: 18, name: 34, campus: 120, score: 150, pct: 175 };

    const drawTableHeader = () => {
      doc.setFillColor(34, 139, 34);
      doc.rect(14, y - 5, pageW - 28, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Pos.", colPos.pos, y);
      doc.text("Aluno", colPos.name, y);
      doc.text("Sede", colPos.campus, y);
      doc.text("Acertos", colPos.score, y);
      doc.text("%", colPos.pct, y);
      doc.setTextColor(0, 0, 0);
      y += 8;
    };

    drawTableHeader();
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    for (let i = 0; i < sorted.length; i++) {
      if (y > 275) {
        doc.addPage();
        y = 20;
        drawTableHeader();
      }

      const c = sorted[i];
      const meta = studentsMetaMap[c.student_name];

      if (i % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(14, y - 4, pageW - 28, 7, "F");
      }

      if (i < 3) {
        doc.setFont("helvetica", "bold");
      } else {
        doc.setFont("helvetica", "normal");
      }
      doc.text(`${i + 1}º`, colPos.pos, y);

      const name = c.student_name.length > 40 ? c.student_name.substring(0, 40) + "..." : c.student_name;
      doc.text(name, colPos.name, y);
      doc.text(meta?.campus || "-", colPos.campus, y);
      doc.text(`${c.total_score || 0}/${c.max_score || 0}`, colPos.score, y);

      const pct = c.percentage || 0;
      if (pct >= 70) doc.setTextColor(34, 139, 34);
      else if (pct >= 50) doc.setTextColor(200, 150, 0);
      else doc.setTextColor(200, 50, 50);
      doc.text(`${pct.toFixed(1)}%`, colPos.pct, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");

      y += 7;
    }

    y += 5;
    if (y > 260) { doc.addPage(); y = 20; }
    const avgPct = sorted.reduce((s, c) => s + (c.percentage || 0), 0) / sorted.length;
    const maxPct = sorted[0]?.percentage || 0;
    const minPct = sorted[sorted.length - 1]?.percentage || 0;

    doc.setDrawColor(200, 200, 200);
    doc.line(14, y, pageW - 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Estatísticas:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(`Média: ${avgPct.toFixed(1)}%    |    Maior nota: ${maxPct.toFixed(1)}%    |    Menor nota: ${minPct.toFixed(1)}%`, 50, y);

    doc.save(`classificacao_${templateName.replace(/\s+/g, "_")}.pdf`);
    toast({ title: "Classificação gerada com sucesso!" });
  };

  const generateAllPDFs = async () => {
    if (allCorrections.length === 0) return;

    setGeneratingAll(true);
    try {
      const doc = new jsPDF();
      const logoData = await loadLogoBase64();
      const sorted = [...allCorrections].sort((a, b) => (b.percentage || 0) - (a.percentage || 0));

      // Pre-load all answers for per-subject class averages
      const allStudentAnswersMap = new Map<string, any[]>();
      const allAnswersArray: any[][] = [];
      for (const correction of allCorrections) {
        const answers = await loadAnswersForCorrection(correction.id);
        allStudentAnswersMap.set(correction.id, answers);
        allAnswersArray.push(answers);
      }

      for (let i = 0; i < allCorrections.length; i++) {
        const correction = allCorrections[i];
        const answers = allStudentAnswersMap.get(correction.id) || [];
        const studentRanking = sorted.findIndex((c) => c.id === correction.id) + 1;

        buildPDFForStudent({
          doc,
          student: correction,
          answers,
          templateQuestions,
          allCorrections,
          studentRanking,
          isFirst: i === 0,
          logoData,
          studentMeta: studentsMetaMap[correction.student_name],
          allStudentAnswers: allStudentAnswersMap,
        });
      }

      doc.save(`boletins_ACAFE_todos.pdf`);
      toast({ title: `PDF gerado com ${allCorrections.length} boletins!` });
    } catch {
      toast({ title: "Erro ao gerar PDFs", variant: "destructive" });
    } finally {
      setGeneratingAll(false);
    }
  };

  const generatePDFBase64 = async (correction: Correction, answers: StudentAnswer[]): Promise<string> => {
    const doc = new jsPDF();
    const logoData = await loadLogoBase64();
    const sorted = [...allCorrections].sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
    const studentRanking = sorted.findIndex((c) => c.id === correction.id) + 1;

    // Build allStudentAnswers map for per-subject averages
    const allStudentAnswersMap = new Map<string, any[]>();
    for (const corr of allCorrections) {
      if (corr.id === correction.id) {
        allStudentAnswersMap.set(corr.id, answers);
      } else {
        const ans = await loadAnswersForCorrection(corr.id);
        allStudentAnswersMap.set(corr.id, ans);
      }
    }

    buildPDFForStudent({
      doc,
      student: correction,
      answers,
      templateQuestions,
      allCorrections,
      studentRanking,
      isFirst: true,
      logoData,
      studentMeta: studentsMetaMap[correction.student_name],
      allStudentAnswers: allStudentAnswersMap,
    });

    // Get base64 without data URI prefix
    const pdfOutput = doc.output('datauristring');
    return pdfOutput.split(',')[1];
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

      const { data, error } = await supabase.functions.invoke('send-boletim-email', {
        body: {
          to: meta.email,
          studentName: selectedStudent.student_name,
          templateName,
          pdfBase64,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "E-mail enviado!", description: `Boletim enviado para ${meta.email}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro ao enviar e-mail", description: msg, variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  const sendEmailToAll = async () => {
    setSendingAllEmails(true);
    let sent = 0;
    let failed = 0;
    const templateName = templates.find((t) => t.id === selectedTemplate)?.name || "Simulado";

    try {
      for (const correction of allCorrections) {
        const meta = studentsMetaMap[correction.student_name];
        if (!meta?.email) {
          failed++;
          continue;
        }

        try {
          const answers = await loadAnswersForCorrection(correction.id);
          const pdfBase64 = await generatePDFBase64(correction, answers);

          const { data, error } = await supabase.functions.invoke('send-boletim-email', {
            body: {
              to: meta.email,
              studentName: correction.student_name,
              templateName,
              pdfBase64,
            },
          });

          if (error || data?.error) {
            failed++;
          } else {
            sent++;
          }
        } catch {
          failed++;
        }
      }

      toast({
        title: "Envio concluído",
        description: `${sent} enviado(s), ${failed} falha(s) ou sem e-mail.`,
      });
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
            <h1 className="text-xl font-bold">Boletim de Desempenho ACAFE</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {allCorrections.length > 0 && (
              <Button variant="outline" onClick={generateRankingPDF}>
                <Trophy className="h-4 w-4 mr-2" />
                Classificação
              </Button>
            )}
            {allCorrections.length > 0 && (
              <Button variant="outline" onClick={generateAllPDFs} disabled={generatingAll}>
                <Download className="h-4 w-4 mr-2" />
                {generatingAll ? "Gerando..." : `Gerar Todos (${allCorrections.length})`}
              </Button>
            )}
            {allCorrections.length > 0 && (
              <Button variant="outline" onClick={sendEmailToAll} disabled={sendingAllEmails}>
                {sendingAllEmails ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                {sendingAllEmails ? "Enviando..." : `Enviar Todos`}
              </Button>
            )}
            {selectedStudent && (
              <Button onClick={generatePDF}>
                <FileDown className="h-4 w-4 mr-2" />
                Gerar PDF
              </Button>
            )}
            {selectedStudent && (
              <Button variant="outline" onClick={sendEmailToStudent} disabled={sendingEmail}>
                {sendingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                {sendingEmail ? "Enviando..." : "Enviar E-mail"}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Seleção */}
          <Card>
            <CardHeader>
              <CardTitle>Selecionar Aluno</CardTitle>
              <CardDescription>
                Escolha o template e o aluno para gerar o boletim, ou gere todos de uma vez
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Escolha um Simulado/Prova:</label>
                <Select value={selectedTemplate} onValueChange={(val) => { setSelectedTemplate(val); setSelectedCorrection(""); setSelectedCampus("all"); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o Simulado" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.total_questions} questões)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Sede</label>
                <Select value={selectedCampus} onValueChange={(val) => { setSelectedCampus(val); setSelectedCorrection(""); }} disabled={!selectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as sedes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as sedes</SelectItem>
                    {availableCampuses.map((campus) => (
                      <SelectItem key={campus} value={campus}>
                        {campus}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Aluno</label>
                <Select value={selectedCorrection} onValueChange={setSelectedCorrection} disabled={!selectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o aluno" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCorrections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.student_name} - {c.percentage?.toFixed(1)}%
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
                <p className="text-muted-foreground mb-4">
                  Nenhum template ACAFE encontrado. Crie um template com tipo "ACAFE" primeiro.
                </p>
                <Button onClick={() => navigate("/templates")}>Criar Template</Button>
              </CardContent>
            </Card>
          )}

          {selectedStudent && !loading && (
            <>
              {/* Resumo */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Nota Geral</p>
                      <p className="text-4xl font-bold text-primary">{selectedStudent.percentage?.toFixed(1)}%</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Acertos</p>
                      <p className="text-3xl font-bold">
                        {studentAnswers.filter((a) => a.is_correct).length}/{studentAnswers.length}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Ranking</p>
                      <p className="text-3xl font-bold">
                        {ranking}º{" "}
                        <span className="text-sm font-normal text-muted-foreground">de {allCorrections.length}</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Erros</p>
                      <p className="text-3xl font-bold text-destructive">{wrongQuestions.length}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Gráfico comparativo */}
              <Card>
                <CardHeader>
                  <CardTitle>Desempenho por Disciplina vs Turma</CardTitle>
                  <CardDescription>Comparação do seu desempenho com a média da turma</CardDescription>
                </CardHeader>
                <CardContent>
                  {subjectStats.length > 0 ? (
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={classComparison} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 100]} />
                        <Tooltip formatter={(value: number) => `${value}%`} />
                        <Legend />
                        <Bar dataKey="studentPercentage" name="Seu desempenho" fill="#16a34a">
                          <LabelList
                            formatter={(value: number) => {
                              const item = classComparison.find((c) => c.studentPercentage === value);
                              return item ? `${item.studentCorrect}/${item.studentTotal}` : `${value}%`;
                            }}
                            position="top"
                            style={{ fontSize: 11, fill: "#16a34a", fontWeight: 600 }}
                          />
                        </Bar>
                        <Bar dataKey="classAverage" name="Média da turma" fill="#94a3b8">
                          <LabelList
                            formatter={(value: number) => `${value}%`}
                            position="top"
                            style={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Defina as disciplinas das questões no template para ver o gráfico.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Tabela de disciplinas */}
              <Card>
                <CardHeader>
                  <CardTitle>Detalhamento por Disciplina</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Disciplina</TableHead>
                        <TableHead className="text-center">Acertos</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">Aproveitamento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subjectStats.map((stat) => (
                        <TableRow key={stat.subject}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stat.color }} />
                              {stat.label}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{stat.correct}</TableCell>
                          <TableCell className="text-center">{stat.total}</TableCell>
                          <TableCell className="text-center font-medium">{stat.percentage}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Questões erradas */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-destructive">Questões para Revisar</CardTitle>
                  <CardDescription>Lista de questões que o aluno errou</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Questão</TableHead>
                        <TableHead>Disciplina</TableHead>
                        <TableHead>Conteúdo</TableHead>
                        <TableHead>Sua Resposta</TableHead>
                        <TableHead>Gabarito</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wrongQuestions.map((q) => (
                        <TableRow key={q.question}>
                          <TableCell className="font-medium">Q{q.question}</TableCell>
                          <TableCell>{q.subject || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{q.topic || "-"}</TableCell>
                          <TableCell className="text-destructive font-medium">{q.studentAnswer}</TableCell>
                          <TableCell className="text-primary font-medium">{q.correctAnswer}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default BoletimAcafe;
