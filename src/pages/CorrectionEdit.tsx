import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ZoomIn, ZoomOut, Maximize, Check, X, Loader2, AlertCircle, CheckCircle2, AlertTriangle, ImageOff, Save } from "lucide-react";
import { getScanSignedUrl } from "@/lib/omr-client";

interface Correction {
  id: string;
  template_id: string;
  student_name: string;
  student_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  essay_score: number | null;
}

interface Template {
  id: string;
  name: string;
  exam_type: string;
}

interface Question {
  id: string;
  question_number: number;
  question_type: string;
  num_propositions: number | null;
  points: number | null;
  correct_answer: string;
  language_variant: string | null;
  subject: string | null;
}

interface AnswerRow {
  id: string;
  question_number: number;
  student_answer: string | null;
  is_correct: boolean | null;
  points_earned: number | null;
}

interface ScanSubmission {
  id: string;
  scan_image_path: string;
  language: string | null;
}

const OBJECTIVE_OPTIONS = ["A", "B", "C", "D", "E"];
const FOREIGN_LANGUAGES = ["Inglês", "Espanhol"];

const CorrectionEdit = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, AnswerRow>>({});
  const [scan, setScan] = useState<ScanSubmission | null>(null);
  const [studentDbId, setStudentDbId] = useState<string | null>(null);
  const [foreignLanguage, setForeignLanguage] = useState<string>("Inglês");
  const [savingLang, setSavingLang] = useState(false);
  const [essayScoreValue, setEssayScoreValue] = useState<string>("");
  const [savingEssay, setSavingEssay] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [editingQ, setEditingQ] = useState<Question | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [savingAnswer, setSavingAnswer] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return navigate("/auth");
      await loadAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: corr, error: cErr } = await supabase
        .from("corrections")
        .select("id, template_id, student_name, student_id, total_score, max_score, percentage, essay_score")
        .eq("id", id!)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!corr) {
        toast({ title: "Correção não encontrada", variant: "destructive" });
        navigate("/students/edit");
        return;
      }
      setCorrection(corr as Correction);
      setEssayScoreValue(corr.essay_score != null ? String(corr.essay_score) : "");

      const [{ data: tpl }, { data: qs }, { data: ans }, { data: sub }] = await Promise.all([
        supabase.from("templates").select("id, name, exam_type").eq("id", corr.template_id).maybeSingle(),
        supabase
          .from("template_questions")
          .select("id, question_number, question_type, num_propositions, points, correct_answer, language_variant, subject")
          .eq("template_id", corr.template_id)
          .order("question_number"),
        supabase
          .from("student_answers")
          .select("id, question_number, student_answer, is_correct, points_earned")
          .eq("correction_id", corr.id)
          .order("question_number"),
        supabase
          .from("scan_submissions")
          .select("id, scan_image_path, language")
          .eq("correction_id", corr.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setTemplate(tpl as Template);
      setAllQuestions((qs as Question[]) || []);

      const ansMap: Record<number, AnswerRow> = {};
      (ans || []).forEach((a) => { ansMap[a.question_number] = a as AnswerRow; });
      setAnswers(ansMap);

      // Buscar aluno por matrícula ou nome
      let studentRow: { id: string; foreign_language: string | null } | null = null;
      if (corr.student_id) {
        const { data } = await supabase
          .from("students")
          .select("id, foreign_language")
          .eq("student_id", corr.student_id)
          .maybeSingle();
        studentRow = data as any;
      }
      if (!studentRow) {
        const { data } = await supabase
          .from("students")
          .select("id, foreign_language")
          .eq("name", corr.student_name)
          .maybeSingle();
        studentRow = data as any;
      }
      setStudentDbId(studentRow?.id || null);

      // Prioriza língua do scan, senão do aluno cadastrado
      const lang = (sub as any)?.language || studentRow?.foreign_language || "Inglês";
      setForeignLanguage(lang);

      if (sub) {
        setScan(sub as ScanSubmission);
        getScanSignedUrl((sub as ScanSubmission).scan_image_path)
          .then(setImageUrl)
          .catch(() => setImageUrl(""));
      } else {
        setScan(null);
        setImageUrl("");
      }
    } catch (err: any) {
      toast({ title: "Erro ao carregar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Filtrar questões pela língua estrangeira selecionada
  const questions = useMemo(() => {
    return allQuestions.filter((q) => !q.language_variant || q.language_variant === foreignLanguage);
  }, [allQuestions, foreignLanguage]);

  const getStatus = useCallback((q: Question): "ok" | "empty" | "wrong" => {
    const a = answers[q.question_number];
    if (!a || !a.student_answer) return "empty";
    return a.is_correct ? "ok" : "wrong";
  }, [answers]);

  const counts = useMemo(() => {
    let ok = 0, empty = 0, wrong = 0;
    questions.forEach((q) => {
      const s = getStatus(q);
      if (s === "ok") ok++;
      else if (s === "empty") empty++;
      else wrong++;
    });
    return { ok, empty, wrong };
  }, [questions, getStatus]);

  const openEdit = (q: Question) => {
    setEditingQ(q);
    setEditValue(answers[q.question_number]?.student_answer || "");
  };

  const recalcCorrection = async () => {
    const { data: rows } = await supabase
      .from("student_answers")
      .select("points_earned")
      .eq("correction_id", correction!.id);
    const totalScore = (rows || []).reduce((s, r: any) => s + (Number(r.points_earned) || 0), 0);
    const maxScore = correction?.max_score || 0;
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    await supabase
      .from("corrections")
      .update({ total_score: totalScore, percentage })
      .eq("id", correction!.id);
    setCorrection((c) => c ? { ...c, total_score: totalScore, percentage } : c);
  };

  const saveEdit = async () => {
    if (!editingQ || !correction) return;
    setSavingAnswer(true);
    try {
      const newAnswer = (editValue || "").trim().toUpperCase();
      const isCorrect = newAnswer && newAnswer === editingQ.correct_answer.toUpperCase();
      const points = Number(editingQ.points || 1);
      const pointsEarned = isCorrect ? points : 0;

      const existing = answers[editingQ.question_number];
      if (existing) {
        const { error } = await supabase
          .from("student_answers")
          .update({
            student_answer: newAnswer || null,
            is_correct: !!isCorrect,
            points_earned: pointsEarned,
            correct_answer: editingQ.correct_answer,
          })
          .eq("id", existing.id);
        if (error) throw error;
        setAnswers((p) => ({
          ...p,
          [editingQ.question_number]: {
            ...existing,
            student_answer: newAnswer || null,
            is_correct: !!isCorrect,
            points_earned: pointsEarned,
          },
        }));
      } else {
        const { data, error } = await supabase
          .from("student_answers")
          .insert({
            correction_id: correction.id,
            question_number: editingQ.question_number,
            student_answer: newAnswer || null,
            correct_answer: editingQ.correct_answer,
            is_correct: !!isCorrect,
            points_earned: pointsEarned,
          })
          .select("id, question_number, student_answer, is_correct, points_earned")
          .single();
        if (error) throw error;
        setAnswers((p) => ({ ...p, [editingQ.question_number]: data as AnswerRow }));
      }

      await recalcCorrection();
      setEditingQ(null);
      toast({ title: `Q${editingQ.question_number} atualizada` });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSavingAnswer(false);
    }
  };

  const handleSaveLanguage = async (newLang: string) => {
    setForeignLanguage(newLang);
    setSavingLang(true);
    try {
      if (studentDbId) {
        await supabase.from("students").update({ foreign_language: newLang }).eq("id", studentDbId);
      }
      if (scan) {
        await supabase.from("scan_submissions").update({ language: newLang }).eq("id", scan.id);
      }
      toast({ title: "Língua estrangeira atualizada" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSavingLang(false);
    }
  };

  const handleSaveEssay = async () => {
    if (!correction) return;
    setSavingEssay(true);
    try {
      const parsed = essayScoreValue.trim() !== ""
        ? Math.min(10, Math.max(0, parseFloat(essayScoreValue.replace(",", "."))))
        : null;
      const value = parsed != null && !isNaN(parsed) ? parsed : null;
      const { error } = await supabase
        .from("corrections")
        .update({ essay_score: value })
        .eq("id", correction.id);
      if (error) throw error;
      setCorrection((c) => c ? { ...c, essay_score: value } : c);
      toast({ title: "Nota da redação salva" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSavingEssay(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!correction || !template) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card flex-shrink-0">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-bold truncate">{correction.student_name}</h1>
              {correction.student_id && <Badge variant="outline">Mat. {correction.student_id}</Badge>}
              <Badge variant="secondary">{template.exam_type}</Badge>
              <span className="text-sm text-muted-foreground truncate">• {template.name}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Nota: <strong>{(correction.total_score ?? 0).toFixed(1)} / {(correction.max_score ?? 0).toFixed(1)}</strong>
              {" • "}
              <strong>{(correction.percentage ?? 0).toFixed(1)}%</strong>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Língua estr.</Label>
            <Select value={foreignLanguage} onValueChange={handleSaveLanguage} disabled={savingLang}>
              <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FOREIGN_LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Redação</Label>
            <Input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={essayScoreValue}
              onChange={(e) => setEssayScoreValue(e.target.value)}
              placeholder="—"
              className="h-8 w-20 text-center"
            />
            <Button size="sm" variant="outline" onClick={handleSaveEssay} disabled={savingEssay}>
              <Save className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* IMAGEM DO SCAN */}
        <Card className="overflow-hidden flex flex-col">
          <div className="border-b p-2 flex items-center gap-2 flex-shrink-0">
            <span className="text-sm font-medium">Folha digitalizada</span>
            {imageUrl && (
              <>
                <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setZoom(1)}>
                  <Maximize className="h-4 w-4 mr-1" /> Ajustar
                </Button>
                <span className="text-xs text-muted-foreground ml-auto">{Math.round(zoom * 100)}%</span>
              </>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Scan"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                  className="max-w-full transition-transform"
                />
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <ImageOff className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma folha digitalizada vinculada a esta correção.</p>
                  <p className="text-xs mt-1">Compare apenas com o gabarito ao lado.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* QUESTÕES */}
        <Card className="overflow-hidden flex flex-col">
          <div className="border-b p-3 flex items-center gap-2 flex-shrink-0 flex-wrap">
            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />{counts.ok} corretas</Badge>
            {counts.wrong > 0 && (
              <Badge variant="destructive" className="gap-1"><X className="h-3 w-3" />{counts.wrong} incorretas</Badge>
            )}
            {counts.empty > 0 && (
              <Badge variant="outline" className="gap-1 border-warning text-warning">
                <AlertTriangle className="h-3 w-3" />{counts.empty} vazias
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {questions.length} questões ({foreignLanguage})
            </span>
          </div>

          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
              {questions.map((q) => {
                const status = getStatus(q);
                const a = answers[q.question_number];
                const value = a?.student_answer || "";
                return (
                  <button
                    key={q.question_number}
                    onClick={() => openEdit(q)}
                    className={`text-left border rounded-md p-2 hover:border-primary transition-colors ${
                      status === "wrong" ? "border-destructive bg-destructive/5" :
                      status === "empty" ? "border-warning bg-warning/10" :
                      "border-primary/40 bg-primary/5"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold">Q{String(q.question_number).padStart(2, "0")}</span>
                      {status === "ok" && <CheckCircle2 className="h-3 w-3 text-primary" />}
                      {status === "empty" && <AlertTriangle className="h-3 w-3 text-warning" />}
                      {status === "wrong" && <X className="h-3 w-3 text-destructive" />}
                    </div>
                    <div className="font-mono text-sm font-bold truncate">
                      {value || <span className="text-muted-foreground italic font-sans font-normal text-xs">vazia</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      Gab.: <span className="font-mono font-semibold text-foreground">{q.correct_answer}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>
      </main>

      {/* MODAL EDIÇÃO DE RESPOSTA */}
      <Dialog open={!!editingQ} onOpenChange={(o) => !o && setEditingQ(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Q{editingQ?.question_number}</DialogTitle>
            <DialogDescription>
              Gabarito correto: <span className="font-mono font-bold text-foreground">{editingQ?.correct_answer}</span>
              {editingQ?.subject && <span className="ml-2 text-xs">• {editingQ.subject}</span>}
            </DialogDescription>
          </DialogHeader>

          {editingQ?.question_type === "objective" && (
            <RadioGroup value={editValue} onValueChange={setEditValue} className="grid grid-cols-3 gap-2">
              {OBJECTIVE_OPTIONS.map((opt) => (
                <Label key={opt} className="flex items-center gap-2 border rounded-md p-3 cursor-pointer hover:border-primary">
                  <RadioGroupItem value={opt} />
                  <span className="font-bold">{opt}</span>
                </Label>
              ))}
              <Label className="flex items-center gap-2 border rounded-md p-3 cursor-pointer hover:border-primary col-span-3">
                <RadioGroupItem value="" />
                <span className="text-muted-foreground italic">Em branco</span>
              </Label>
            </RadioGroup>
          )}

          {(editingQ?.question_type === "summation" || editingQ?.question_type === "open_numeric") && (
            <Input
              type="number"
              min={0}
              max={99}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="0"
              className="text-center text-2xl font-bold h-14"
              autoFocus
            />
          )}

          {editingQ?.question_type === "discursive" && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Discursiva — a nota é lançada manualmente na tela de correção, não aqui.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingQ(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingAnswer || editingQ?.question_type === "discursive"}>
              {savingAnswer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CorrectionEdit;