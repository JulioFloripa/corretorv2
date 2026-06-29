import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Trophy, TrendingUp, Users, BookOpen, AlertCircle, CheckCircle2, XCircle,
  FileDown, Mail, Download, Loader2, FilePen,
} from "lucide-react";
import FlemingLogo from "@/components/FlemingLogo";
import jsPDF from "jspdf";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from "recharts";
import { buildUfprPDF, loadUfprLogos } from "@/lib/pdf-boletim-ufpr";

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
  "Língua Estrangeira", "Biologia", "Física", "Geografia", "História",
  "Matemática", "Química", "Literatura Brasileira", "Filosofia", "Sociologia", "Língua Portuguesa",
];

const SUBJECT_TOTALS: Record<string, number> = {
  "Língua Estrangeira": 7, "Biologia": 8, "Física": 8, "Geografia": 8,
  "História": 8, "Matemática": 8, "Química": 8, "Literatura Brasileira": 5,
  "Filosofia": 5, "Sociologia": 5, "Língua Portuguesa": 10,
};

const SUBJECT_SHORT: Record<string, string> = {
  "Língua Estrangeira": "LE", "Biologia": "Bio", "Física": "Fís", "Geografia": "Geo",
  "História": "Hist", "Matemática": "Mat", "Química": "Quím", "Literatura Brasileira": "Lit.",
  "Filosofia": "Fil", "Sociologia": "Soc", "Língua Portuguesa": "LP",
};

function getWeight(campus: CampusConfig, subject: string): number {
  return campus.weights[subject] ?? 1;
}

function calcCampusScore(campus: CampusConfig, disciplineCorrects: Record<string, number>) {
  let score = 0, maxScore = 0;
  for (const [subject, total] of Object.entries(SUBJECT_TOTALS)) {
    const w = getWeight(campus, subject);
    score += (disciplineCorrects[subject] ?? 0) * w;
    maxScore += total * w;
  }
  return { score, maxScore };
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Template { id: string; name: string; exam_type: string; total_questions: number }
interface Correction {
  id: string; student_name: string; student_id: string | null;
  total_score: number | null; max_score: number | null; percentage: number | null;
  language_variant: string | null; essay_score: number | null;
}
interface TemplateQuestion {
  question_number: number; subject: string | null; language_variant: string | null;
  question_type: string; points: number | null; topic: string | null;
  correct_answer: string | null;
}
interface StudentAnswer {
  question_number: number; student_answer: string | null;
  is_correct: boolean | null; points_earned: number | null;
}
interface StudentMeta { campus: string | null; email: string | null }

const fmt = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
const pct = (s: number, m: number) => m > 0 ? `${((s / m) * 100).toFixed(1)}%` : "—";
const pctNum = (s: number, m: number) => m > 0 ? Math.round((s / m) * 100) : 0;

// ── UFPR Logo ─────────────────────────────────────────────────────────────────
const UFPR_LOGO_SIZES = { sm: 36, md: 52, lg: 72 };
const UfprLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => (
  <img src="/Logo_oficial_da_UFPR_(sem_fundo).png" alt="UFPR"
    style={{ height: UFPR_LOGO_SIZES[size], width: "auto", objectFit: "contain" }} />
);

// ── Component ─────────────────────────────────────────────────────────────────

const BoletimUfpr = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [selectedCorrection, setSelectedCorrection] = useState<string>("");
  const [selectedSede, setSelectedSede] = useState<string>("all");
  const [templateQuestions, setTemplateQuestions] = useState<TemplateQuestion[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<StudentAnswer[]>([]);
  const [loading, setLoading] = useState(false);
  const [allAnswers, setAllAnswers] = useState<Record<string, StudentAnswer[]>>({});
  const [studentsMetaMap, setStudentsMetaMap] = useState<Record<string, StudentMeta>>({});
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingAllEmails, setSendingAllEmails] = useState(false);

  // ── Auth & initial load ───────────────────────────────────────────────────
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

  // Recarrega ao voltar do CorrectionEdit (language_variant ou respostas podem ter mudado)
  useEffect(() => {
    if (selectedTemplate) {
      loadCorrections();
      if (selectedCorrection) loadStudentAnswers();
    }
  }, [location.key]);

  useEffect(() => {
    if (selectedCorrection) loadStudentAnswers();
  }, [selectedCorrection]);

  // Load all student answers for class avg + ranking
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

  // Load student metadata (campus/sede + email)
  useEffect(() => {
    if (corrections.length === 0) return;
    loadStudentsMeta();
  }, [corrections]);

  // ── Data loaders ──────────────────────────────────────────────────────────
  const loadTemplates = async () => {
    const { data } = await supabase
      .from("templates").select("id, name, exam_type, total_questions")
      .eq("exam_type", "ufpr").order("created_at", { ascending: false });
    const list = data || [];
    setTemplates(list);
    const urlId = searchParams.get("templateId");
    if (urlId && list.some((t) => t.id === urlId)) setSelectedTemplate(urlId);
    else if (list.length === 1) setSelectedTemplate(list[0].id);
  };

  const loadCorrections = async () => {
    const { data, error } = await supabase
      .from("corrections")
      .select("id, student_name, student_id, total_score, max_score, percentage, language_variant, essay_score")
      .eq("template_id", selectedTemplate).eq("status", "completed").order("student_name");
    if (error) { toast({ title: "Erro ao carregar correções", variant: "destructive" }); return; }
    setCorrections(data || []);
  };

  const loadTemplateQuestions = async () => {
    const { data } = await supabase
      .from("template_questions")
      .select("question_number, subject, language_variant, question_type, points, topic, correct_answer")
      .eq("template_id", selectedTemplate).order("question_number");
    setTemplateQuestions(data || []);
  };

  const loadStudentAnswers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("student_answers")
      .select("question_number, student_answer, is_correct, points_earned")
      .eq("correction_id", selectedCorrection).order("question_number");
    setStudentAnswers(data || []);
    setLoading(false);
  };

  const loadStudentsMeta = async () => {
    const names = [...new Set(corrections.map(c => c.student_name))];
    if (names.length === 0) return;
    const { data } = await supabase
      .from("alunos").select("nome, campus, email").in("nome", names);
    if (data) {
      const map: Record<string, StudentMeta> = {};
      data.forEach((s: { nome: string; campus: string | null; email: string | null }) => {
        map[s.nome] = { campus: s.campus, email: s.email };
      });
      setStudentsMetaMap(map);
    }
  };

  const loadAnswersForCorrection = async (correctionId: string): Promise<StudentAnswer[]> => {
    const { data } = await supabase
      .from("student_answers")
      .select("question_number, student_answer, is_correct, points_earned")
      .eq("correction_id", correctionId).order("question_number");
    return data || [];
  };

  // ── Filters ───────────────────────────────────────────────────────────────
  const availableSedes = [...new Set(
    corrections.map(c => studentsMetaMap[c.student_name]?.campus).filter(Boolean)
  )] as string[];

  const filteredCorrections = selectedSede === "all"
    ? corrections
    : corrections.filter(c => studentsMetaMap[c.student_name]?.campus === selectedSede);

  // ── Per-subject data for selected student ─────────────────────────────────
  const correctionData = useMemo(() => {
    if (!selectedCorrection || studentAnswers.length === 0) return null;
    const corr = corrections.find(c => c.id === selectedCorrection);
    if (!corr) return null;

    const answerMap = new Map(studentAnswers.map(a => [a.question_number, a]));
    const lang = corr.language_variant;

    const activeQuestions = templateQuestions.filter(q =>
      !q.language_variant || q.language_variant === (lang || "Inglês")
    );
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
    for (const [s, v] of Object.entries(bySubject)) disciplineCorrects[s] = v.correct;

    const campusScores = UFPR_CAMPUSES.map(campus => ({
      campus, ...calcCampusScore(campus, disciplineCorrects),
    }));
    const best = campusScores.reduce((a, b) =>
      b.score / b.maxScore > a.score / a.maxScore ? b : a
    );

    const totalCorrect = Object.values(bySubject).reduce((s, v) => s + v.correct, 0);

    const discursiveEarned = discursiveQuestions.reduce(
      (s, q) => s + (answerMap.get(q.question_number)?.points_earned ?? 0), 0
    );
    const discursiveMax = discursiveQuestions.reduce((s, q) => s + (Number(q.points) || 10), 0);
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
      totalCorrect, discursiveEarned, discursiveMax, discursiveCount, wrongQuestions,
    };
  }, [selectedCorrection, studentAnswers, corrections, templateQuestions]);

  // ── Class average per discipline ──────────────────────────────────────────
  // Returns avg CORRECT COUNT (decimal) per subject across all students
  const classAvgCount = useMemo(() => {
    if (Object.keys(allAnswers).length === 0 || templateQuestions.length === 0) return {} as Record<string, number>;
    const agg: Record<string, { totalCorrect: number; students: number }> = {};

    for (const [corrId, answers] of Object.entries(allAnswers)) {
      const corr = corrections.find(c => c.id === corrId);
      const lang = corr?.language_variant;
      const answerMap = new Map(answers.map(a => [a.question_number, a]));

      const activeQs = templateQuestions.filter(q => {
        if (q.question_type === "discursive") return false;
        if (!q.language_variant) return true;
        return q.language_variant === (lang || "Inglês");
      });

      const subjsHit = new Set<string>();
      for (const q of activeQs) {
        const subj = q.subject || "—";
        if (!agg[subj]) agg[subj] = { totalCorrect: 0, students: 0 };
        if (!subjsHit.has(subj)) { agg[subj].students++; subjsHit.add(subj); }
        if (answerMap.get(q.question_number)?.is_correct) agg[subj].totalCorrect++;
      }
    }

    const result: Record<string, number> = {};
    for (const [subj, v] of Object.entries(agg)) {
      result[subj] = v.students > 0 ? v.totalCorrect / v.students : 0;
    }
    return result;
  }, [allAnswers, templateQuestions, corrections]);

  // classAvgPct for bar chart
  const classAvgPct = useMemo(() => {
    const r: Record<string, number> = {};
    for (const [subj, count] of Object.entries(classAvgCount)) {
      const total = SUBJECT_TOTALS[subj] || 1;
      r[subj] = Math.round((count / total) * 100);
    }
    return r;
  }, [classAvgCount]);

  // ── Ranking per campus ────────────────────────────────────────────────────
  const rankingData = useMemo(() => {
    if (corrections.length === 0 || Object.keys(allAnswers).length === 0) return [];
    return corrections.map(corr => {
      const answers = allAnswers[corr.id] || [];
      const answerMap = new Map(answers.map(a => [a.question_number, a.is_correct ?? false]));
      const lang = corr.language_variant;

      const activeQs = templateQuestions.filter(q => {
        if (q.question_type === "discursive") return false;
        if (!q.language_variant) return true;
        return q.language_variant === (lang || "Inglês");
      });

      const dc: Record<string, number> = {};
      for (const q of activeQs) {
        const subj = q.subject || "—";
        if (!dc[subj]) dc[subj] = 0;
        if (answerMap.get(q.question_number)) dc[subj]++;
      }

      return {
        corr,
        campusScores: UFPR_CAMPUSES.map(campus => ({ campusId: campus.id, ...calcCampusScore(campus, dc) })),
      };
    });
  }, [corrections, allAnswers, templateQuestions]);

  const studentRanking = useMemo(() => {
    if (!correctionData || rankingData.length === 0) return null;
    const bestId = correctionData.best.campus.id;
    const sorted = [...rankingData]
      .map(r => ({ id: r.corr.id, score: r.campusScores.find(x => x.campusId === bestId)?.score ?? 0 }))
      .sort((a, b) => b.score - a.score);
    return { pos: sorted.findIndex(r => r.id === selectedCorrection) + 1, total: sorted.length };
  }, [correctionData, rankingData, selectedCorrection]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!correctionData) return [];
    return UFPR_SUBJECTS_ORDER.map(subject => {
      const stats = correctionData.bySubject[subject] || { correct: 0, total: SUBJECT_TOTALS[subject] || 0 };
      return {
        label: SUBJECT_SHORT[subject] || subject,
        aluno: pctNum(stats.correct, stats.total),
        turma: classAvgPct[subject] ?? 0,
        corretosAluno: stats.correct,
        totalQs: stats.total,
      };
    });
  }, [correctionData, classAvgPct]);

  const templateName = templates.find(t => t.id === selectedTemplate)?.name || "Simulado UFPR";
  const selectedStudentMeta = correctionData
    ? studentsMetaMap[correctionData.corr.student_name]
    : undefined;

  // ── PDF generation ────────────────────────────────────────────────────────
  const buildOnePDF = async (
    doc: jsPDF, corr: Correction, answers: StudentAnswer[], isFirst: boolean,
    flemingLogo: string | null, ufprLogo: string | null
  ) => {
    const lang = corr.language_variant;
    const answerMap = new Map(answers.map(a => [a.question_number, a]));

    const activeQs = templateQuestions.filter(q =>
      !q.language_variant || q.language_variant === (lang || "Inglês")
    );
    const objectiveQs = activeQs.filter(q => q.question_type !== "discursive");
    const discursiveQs = activeQs.filter(q => q.question_type === "discursive");

    const bySubject: Record<string, { correct: number; total: number }> = {};
    for (const q of objectiveQs) {
      const subject = q.subject || "—";
      if (!bySubject[subject]) bySubject[subject] = { correct: 0, total: 0 };
      bySubject[subject].total++;
      if (answerMap.get(q.question_number)?.is_correct) bySubject[subject].correct++;
    }

    const discursiveEarned = discursiveQs.reduce(
      (s, q) => s + (answerMap.get(q.question_number)?.points_earned ?? 0), 0
    );
    const discursiveMax = discursiveQs.reduce((s, q) => s + (Number(q.points) || 10), 0);

    const wrongQs = objectiveQs
      .filter(q => !answerMap.get(q.question_number)?.is_correct)
      .map(q => ({
        number: q.question_number,
        subject: q.subject || "—",
        topic: q.topic || "",
        studentAnswer: answerMap.get(q.question_number)?.student_answer || "—",
        correctAnswer: q.correct_answer || "—",
      }));

    const meta = studentsMetaMap[corr.student_name];

    buildUfprPDF({
      doc, isFirst, templateName,
      studentName: corr.student_name,
      studentId: corr.student_id,
      studentSede: meta?.campus ?? null,
      languageVariant: lang || "Inglês",
      bySubject,
      classAvgCount,
      discursiveEarned,
      discursiveMax,
      essayScore: corr.essay_score,
      wrongQuestions: wrongQs,
      flemingLogo,
      ufprLogo,
    });
  };

  const generatePDF = async () => {
    if (!correctionData) return;
    setGeneratingPDF(true);
    try {
      const [flemingLogo, ufprLogo] = await loadUfprLogos();
      const doc = new jsPDF();
      const answers = studentAnswers;
      await buildOnePDF(doc, correctionData.corr, answers, true, flemingLogo, ufprLogo);
      doc.save(`boletim_UFPR_${correctionData.corr.student_name.replace(/\s+/g, "_")}.pdf`);
      toast({ title: "PDF gerado com sucesso!" });
    } catch {
      toast({ title: "Erro ao gerar PDF", variant: "destructive" });
    } finally {
      setGeneratingPDF(false);
    }
  };

  const generatePDFBase64 = async (
    corr: Correction, answers: StudentAnswer[],
    flemingLogo: string | null, ufprLogo: string | null
  ): Promise<string> => {
    const doc = new jsPDF();
    await buildOnePDF(doc, corr, answers, true, flemingLogo, ufprLogo);
    return doc.output("datauristring").split(",")[1];
  };

  const generateAllPDFs = async () => {
    const targetCorrections = selectedSede === "all" ? corrections : filteredCorrections;
    if (targetCorrections.length === 0) return;
    setGeneratingAll(true);
    try {
      const [flemingLogo, ufprLogo] = await loadUfprLogos();
      const doc = new jsPDF();
      for (let i = 0; i < targetCorrections.length; i++) {
        const corr = targetCorrections[i];
        const answers = await loadAnswersForCorrection(corr.id);
        await buildOnePDF(doc, corr, answers, i === 0, flemingLogo, ufprLogo);
      }
      doc.save(`boletins_UFPR_${selectedSede === "all" ? "todos" : selectedSede}.pdf`);
      toast({ title: `PDF gerado com ${targetCorrections.length} boletins!` });
    } catch {
      toast({ title: "Erro ao gerar PDFs", variant: "destructive" });
    } finally {
      setGeneratingAll(false);
    }
  };

  const sendEmailToStudent = async () => {
    if (!correctionData) return;
    const meta = studentsMetaMap[correctionData.corr.student_name];
    if (!meta?.email) {
      toast({ title: "E-mail não cadastrado", description: "Cadastre o e-mail do aluno em Alunos.", variant: "destructive" });
      return;
    }
    setSendingEmail(true);
    try {
      const [flemingLogo, ufprLogo] = await loadUfprLogos();
      const pdfBase64 = await generatePDFBase64(correctionData.corr, studentAnswers, flemingLogo, ufprLogo);
      const { data, error } = await supabase.functions.invoke("send-boletim-email", {
        body: { to: meta.email, studentName: correctionData.corr.student_name, templateName, pdfBase64 },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      toast({ title: "E-mail enviado!", description: `Boletim enviado para ${meta.email}` });
    } catch (err: unknown) {
      toast({ title: "Erro ao enviar e-mail", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  const sendEmailToAll = async () => {
    const targetCorrections = selectedSede === "all" ? corrections : filteredCorrections;
    setSendingAllEmails(true);
    let sent = 0, failed = 0;
    try {
      const [flemingLogo, ufprLogo] = await loadUfprLogos();
      for (const corr of targetCorrections) {
        const meta = studentsMetaMap[corr.student_name];
        if (!meta?.email) { failed++; continue; }
        try {
          const answers = allAnswers[corr.id] || await loadAnswersForCorrection(corr.id);
          const pdfBase64 = await generatePDFBase64(corr, answers, flemingLogo, ufprLogo);
          const { data, error } = await supabase.functions.invoke("send-boletim-email", {
            body: { to: meta.email, studentName: corr.student_name, templateName, pdfBase64 },
          });
          if (error || data?.error) failed++; else sent++;
        } catch { failed++; }
      }
      toast({ title: "Envio concluído", description: `${sent} enviado(s), ${failed} falha(s) ou sem e-mail.` });
    } finally {
      setSendingAllEmails(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* ── Header ── */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/boletins")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <FlemingLogo size="sm" />
            <div className="h-7 w-px bg-border" />
            <UfprLogo size="sm" />
            <div>
              <h1 className="text-base font-bold leading-none">Boletim UFPR</h1>
              <p className="text-xs text-muted-foreground">Comparativo de campus por disciplina</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {corrections.length > 0 && (
              <Button variant="outline" size="sm" onClick={generateAllPDFs} disabled={generatingAll}>
                {generatingAll
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <Download className="h-4 w-4 mr-1" />}
                {generatingAll ? "Gerando..." : `Gerar Todos (${filteredCorrections.length})`}
              </Button>
            )}
            {corrections.length > 0 && (
              <Button variant="outline" size="sm" onClick={sendEmailToAll} disabled={sendingAllEmails}>
                {sendingAllEmails
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <Mail className="h-4 w-4 mr-1" />}
                {sendingAllEmails ? "Enviando..." : "Enviar Todos"}
              </Button>
            )}
            {correctionData && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/corrections/${selectedCorrection}/edit`)}>
                <FilePen className="h-4 w-4 mr-1" />
                Editar Respostas
              </Button>
            )}
            {correctionData && (
              <Button size="sm" onClick={generatePDF} disabled={generatingPDF}>
                {generatingPDF
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <FileDown className="h-4 w-4 mr-1" />}
                {generatingPDF ? "Gerando..." : "Gerar PDF"}
              </Button>
            )}
            {correctionData && (
              <Button variant="outline" size="sm" onClick={sendEmailToStudent} disabled={sendingEmail}>
                {sendingEmail
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <Mail className="h-4 w-4 mr-1" />}
                {sendingEmail ? "Enviando..." : "Enviar E-mail"}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ── Selectors ── */}
        <Card className="mb-6">
          <CardContent className="pt-4 flex flex-wrap gap-4">
            <div className="flex-1 min-w-44">
              <label className="text-xs text-muted-foreground mb-1 block">Simulado</label>
              <Select value={selectedTemplate} onValueChange={v => { setSelectedTemplate(v); setSelectedCorrection(""); setSelectedSede("all"); }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-40">
              <label className="text-xs text-muted-foreground mb-1 block">Sede</label>
              <Select value={selectedSede} onValueChange={v => { setSelectedSede(v); setSelectedCorrection(""); }} disabled={!selectedTemplate}>
                <SelectTrigger><SelectValue placeholder="Todas as sedes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as sedes</SelectItem>
                  {availableSedes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-44">
              <label className="text-xs text-muted-foreground mb-1 block">Aluno</label>
              <Select value={selectedCorrection} onValueChange={setSelectedCorrection} disabled={!selectedTemplate}>
                <SelectTrigger><SelectValue placeholder="Selecione o aluno..." /></SelectTrigger>
                <SelectContent>
                  {filteredCorrections.map(c => (
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

            {/* ═══════ TAB: INDIVIDUAL ═══════ */}
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
                const { corr, bySubject, campusScores, best, totalCorrect,
                  discursiveEarned, discursiveMax, discursiveCount, wrongQuestions } = correctionData;

                return (
                  <div className="space-y-6">
                    {/* Cabeçalho do boletim */}
                    <Card className="bg-gradient-to-r from-green-50 to-primary/5 border-primary/20">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <div className="flex items-center gap-6">
                            <FlemingLogo size="md" showText={false} />
                            <div className="h-12 w-px bg-primary/20" />
                            <UfprLogo size="md" />
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold">{corr.student_name}</p>
                            {selectedStudentMeta?.campus && (
                              <p className="text-sm text-primary font-medium">{selectedStudentMeta.campus}</p>
                            )}
                            <p className="text-sm text-muted-foreground">{templateName}</p>
                            {corr.language_variant && (
                              <p className="text-xs text-muted-foreground">Língua Estrangeira: {corr.language_variant}</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Cards de resumo */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="pt-5 pb-5 text-center">
                          <p className="text-xs text-muted-foreground mb-1">Acertos Objetivas</p>
                          <p className="text-3xl font-bold text-primary">{totalCorrect}<span className="text-base font-normal text-muted-foreground">/80</span></p>
                          <p className="text-sm font-medium text-primary mt-1">{pct(totalCorrect, 80)}</p>
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

                    {/* Tabela dupla */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                      <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Acertos por Disciplina</CardTitle>
                          <CardDescription>80 questões objetivas</CardDescription>
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
                                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${p >= 70 ? "bg-green-100 text-green-800" : p >= 50 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>
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
                                <td className="px-4 py-2 text-center font-bold text-sm">{pct(totalCorrect, 80)}</td>
                              </tr>
                            </tfoot>
                          </Table>
                        </CardContent>
                      </Card>

                      <Card className="lg:col-span-3">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Pontuação por Campus</CardTitle>
                          <CardDescription>PObj = Σ(Ai × pi)</CardDescription>
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
                                      {Object.entries(campus.weights).map(([s, w]) => `${SUBJECT_SHORT[s] ?? s}×${w}`).join(", ")}
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
                                      return (
                                        <TableCell key={campus.id} className="text-center py-2">
                                          <span className="font-mono font-semibold">{stats.correct * w}</span>
                                          <span className="text-xs text-muted-foreground">/{stats.total * w}</span>
                                          {w > 1 && <span className="ml-1 text-xs text-blue-600 font-medium">(×{w})</span>}
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
                                      <div className={`font-bold text-lg font-mono ${isBest ? "text-primary" : ""}`}>{fmt(score)}</div>
                                      <div className="text-xs text-muted-foreground">/{maxScore}</div>
                                      <div className="text-xs">{pct(score, maxScore)}</div>
                                      {isBest && <Badge className="text-xs mt-1 gap-1"><Trophy className="h-2.5 w-2.5" /> Melhor</Badge>}
                                    </td>
                                  );
                                })}
                              </tr>
                            </tfoot>
                          </Table>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Campus bars */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {campusScores.map(({ campus, score, maxScore }) => {
                        const isBest = campus.id === best.campus.id;
                        return (
                          <Card key={campus.id} className={isBest ? "border-2 border-primary" : ""}>
                            <CardContent className="pt-4 pb-4">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <p className="font-semibold">{campus.course}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {Object.entries(campus.weights).map(([s, w]) => `${s} ×${w}`).join(", ")}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-2xl font-bold font-mono">{fmt(score)}</p>
                                  <p className="text-xs text-muted-foreground">de {maxScore} pts</p>
                                </div>
                              </div>
                              <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${isBest ? "bg-primary" : "bg-slate-400"}`}
                                  style={{ width: `${maxScore > 0 ? (score / maxScore) * 100 : 0}%` }} />
                              </div>
                              <p className="text-right text-xs text-muted-foreground mt-1">{pct(score, maxScore)}</p>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    {/* Discursiva + Redação */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {discursiveCount > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-amber-500" />
                              Questões Discursivas (CPT)
                            </CardTitle>
                            <CardDescription>{discursiveCount} questão(ões) · 0 a 10 pts cada · máx {discursiveMax} pts</CardDescription>
                          </CardHeader>
                          <CardContent>
                            {discursiveMax > 0 ? (
                              <>
                                <div className="text-3xl font-bold font-mono">
                                  {fmt(discursiveEarned)}<span className="text-base font-normal text-muted-foreground"> / {discursiveMax} pts</span>
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">{pct(discursiveEarned, discursiveMax)}</div>
                                <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden">
                                  <div className="h-full bg-amber-500 rounded-full transition-all"
                                    style={{ width: `${discursiveMax > 0 ? (discursiveEarned / discursiveMax) * 100 : 0}%` }} />
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
                                {fmt(corr.essay_score)}<span className="text-base font-normal text-muted-foreground"> pts</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">Nota registrada</div>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Aguardando lançamento</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Total por campus */}
                    {(discursiveMax > 0 || corr.essay_score != null) && (
                      <Card className="bg-muted/30">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Pontuação Total por Campus</CardTitle>
                          <CardDescription>PObj + Discursiva + Redação</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-6">
                            {campusScores.map(({ campus, score }) => {
                              const total = score + discursiveEarned + (corr.essay_score ?? 0);
                              const isBest = campus.id === best.campus.id;
                              return (
                                <div key={campus.id} className={`rounded-lg p-4 border ${isBest ? "border-primary bg-primary/5" : "border-border bg-background"}`}>
                                  <p className="font-semibold text-sm mb-2">{campus.course}</p>
                                  <div className="space-y-1 text-sm text-muted-foreground">
                                    <div className="flex justify-between"><span>PObj</span><span className="font-mono font-medium text-foreground">{fmt(score)}</span></div>
                                    {discursiveMax > 0 && <div className="flex justify-between"><span>Discursiva</span><span className="font-mono font-medium text-foreground">{fmt(discursiveEarned)}</span></div>}
                                    {corr.essay_score != null && <div className="flex justify-between"><span>Redação</span><span className="font-mono font-medium text-foreground">{fmt(corr.essay_score)}</span></div>}
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

                    {/* Gráfico */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Desempenho por Disciplina vs Turma</CardTitle>
                        <CardDescription>Aproveitamento (%) comparado com os {corrections.length} participantes</CardDescription>
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
                              <LabelList dataKey="aluno" position="top"
                                formatter={(v: number) => v > 0 ? `${v}%` : ""}
                                style={{ fontSize: 10, fill: "#16a34a", fontWeight: 600 }} />
                            </Bar>
                            <Bar dataKey="turma" name="turma" fill="#94a3b8" radius={[3, 3, 0, 0]}>
                              <LabelList dataKey="turma" position="top"
                                formatter={(v: number) => v > 0 ? `${v}%` : ""}
                                style={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Questões para revisar */}
                    {wrongQuestions.length > 0 ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive" />
                            <span className="text-destructive">Questões para Revisar ({wrongQuestions.length})</span>
                          </CardTitle>
                          <CardDescription>Use o conteúdo para direcionar seus estudos</CardDescription>
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
                                    {q.topic || <span className="italic opacity-50">Sem tópico</span>}
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
                    ) : (
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

            {/* ═══════ TAB: RANKING ═══════ */}
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
                        const meta = studentsMetaMap[r.corr.student_name];
                        return { name: r.corr.student_name, id: r.corr.student_id, sede: meta?.campus, score: cs.score, maxScore: cs.maxScore };
                      })
                      .filter(r => selectedSede === "all" || r.sede === selectedSede)
                      .sort((a, b) => b.score - a.score);

                    const avg = sorted.length > 0
                      ? sorted.reduce((s, r) => s + r.score, 0) / sorted.length : 0;

                    return (
                      <Card key={campus.id}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-amber-500" />
                            {campus.course}
                          </CardTitle>
                          <CardDescription>
                            {Object.entries(campus.weights).map(([s, w]) => `${s} ×${w}`).join(", ")} · Máx: {sorted[0]?.maxScore ?? 0} · Média: {fmt(avg)}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-10 pl-4">#</TableHead>
                                <TableHead>Aluno</TableHead>
                                <TableHead>Sede</TableHead>
                                <TableHead className="text-right">PObj</TableHead>
                                <TableHead className="text-right pr-4">%</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sorted.map((row, idx) => (
                                <TableRow key={idx} className={idx === 0 ? "bg-amber-50" : idx === 1 ? "bg-slate-50" : idx === 2 ? "bg-orange-50/40" : ""}>
                                  <TableCell className="pl-4">
                                    <span className={`font-bold ${idx === 0 ? "text-amber-600" : idx === 1 ? "text-slate-600" : idx === 2 ? "text-orange-600" : "text-muted-foreground"}`}>{idx + 1}</span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{row.name}</div>
                                    {row.id && <div className="text-xs text-muted-foreground">{row.id}</div>}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{row.sede || "—"}</TableCell>
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
