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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Check, X, Loader2, AlertCircle, CheckCircle2, AlertTriangle, Trash2, Languages } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getScanSignedUrl } from "@/lib/omr-client";
import OmrStepHeader, { OmrEmptyState } from "@/components/omr/OmrStepHeader";

interface Submission {
  id: string;
  scan_image_path: string;
  qr_data: any;
  detected_answers: Record<string, string | null>;
  read_errors: string[];
  student_id: string | null;
  answer_sheet_id: string | null;
  manual_corrections: Record<string, string | null> | null;
  success: boolean;
  language?: string | null;
}

interface Question {
  question_number: number;
  question_type: string;
  num_propositions: number | null;
  language_variant?: string | null;
}

interface Student {
  id: string;
  nome: string;
  matricula: string | null;
}

const OBJECTIVE_OPTIONS = ["A", "B", "C", "D", "E"];

const OmrReview = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const { toast } = useToast();

  const [templateName, setTemplateName] = useState("");
  const [examType, setExamType] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [idx, setIdx] = useState(0);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [editingQ, setEditingQ] = useState<Question | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linkStudentDialog, setLinkStudentDialog] = useState(false);
  const [studentSearchTerm, setStudentSearchTerm] = useState("");
  const [orphanDialog, setOrphanDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Variantes de idioma do template
  const [languageVariants, setLanguageVariants] = useState<string[]>([]);
  const [questionsByLang, setQuestionsByLang] = useState<Map<string, number[]>>(new Map());
  // Passo 2 do dialog de vincular: confirmação de idioma
  const [linkPendingStudentId, setLinkPendingStudentId] = useState<string | null>(null);
  const [linkSelectedLanguage, setLinkSelectedLanguage] = useState<string>("");

  // Carregar dados iniciais
  useEffect(() => {
    if (!templateId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return navigate("/auth");

      const [{ data: tpl }, { data: subs }, { data: qs }, { data: studs }] = await Promise.all([
        supabase.from("templates").select("nome, exam_type").eq("id", templateId).maybeSingle(),
        supabase
          .from("scan_submissions")
          .select("id, scan_image_path, qr_data, detected_answers, read_errors, student_id, answer_sheet_id, manual_corrections, success, language")
          .eq("template_id", templateId)
          .eq("reviewed", false)
          .eq("discarded", false)
          .order("created_at"),
        supabase
          .from("template_questions")
          .select("question_number, question_type, num_propositions, language_variant")
          .eq("template_id", templateId)
          .order("question_number"),
        supabase.from("alunos").select("id, nome, matricula").order("nome"),
      ]);

      setTemplateName((tpl as any)?.nome || (tpl as any)?.name || "");
      setExamType((tpl as any)?.exam_type || "");
      const subsData = (subs as any) || [];
      setSubmissions(subsData);
      const qsList = ((qs as any) || []) as Question[];
      setQuestions(qsList);
      setStudents((studs as any) || []);

      // Extrair variantes de idioma do template
      const langMap = new Map<string, number[]>();
      for (const q of qsList) {
        if (q.language_variant) {
          if (!langMap.has(q.language_variant)) langMap.set(q.language_variant, []);
          langMap.get(q.language_variant)!.push(q.question_number);
        }
      }
      setLanguageVariants([...langMap.keys()]);
      setQuestionsByLang(langMap);

      setLoading(false);

      if (subsData.length === 0) {
        // Sem nada pra revisar — vai pra summary
        navigate(`/omr/done/${templateId}`);
      }
    })();
  }, [templateId, navigate]);

  const current = submissions[idx];

  // Carregar imagem assinada e respostas iniciais ao trocar
  useEffect(() => {
    if (!current) return;
    setZoom(1);
    const merged = { ...(current.detected_answers || {}), ...(current.manual_corrections || {}) };
    setAnswers(merged);
    getScanSignedUrl(current.scan_image_path)
      .then(setImageUrl)
      .catch(() => setImageUrl(""));
  }, [current]);

  const currentStudent = useMemo(() => {
    if (!current?.student_id) return null;
    return students.find((s) => s.id === current.student_id) || null;
  }, [current, students]);

  const filteredStudents = useMemo(() => {
    const term = studentSearchTerm.toLowerCase().trim();
    if (!term) return students.slice(0, 50);
    return students.filter((s) =>
      s.nome.toLowerCase().includes(term) || (s.matricula || "").toLowerCase().includes(term)
    ).slice(0, 50);
  }, [students, studentSearchTerm]);

  // Helpers para normalizar chaves: banco salva como "q{n}", mas ao editar
  // internamente usamos também "q{n}" para consistência.
  const qKey = (n: number) => `q${n}`;

  // Para UFSC: intervalo de questões desta folha (derivado do QR ou padrão dia 1)
  const UFSC_QS_PER_DAY = 40;
  const dayRange = useMemo(() => {
    if (examType !== "ufsc") return null;
    const qs = current?.qr_data?.question_start ?? 1;
    return { start: qs, end: qs + UFSC_QS_PER_DAY - 1 };
  }, [examType, current]);

  // Status por questão
  const getStatus = useCallback((q: Question): "ok" | "empty" | "error" | "other_day" => {
    // Questões discursivas e de outro dia não estão na folha de respostas OMR
    if (q.question_type === "discursive") return "other_day";
    if (dayRange && (q.question_number < dayRange.start || q.question_number > dayRange.end)) return "other_day";
    const v = answers[qKey(q.question_number)];
    if (!v || v === "" || v === "null") return "empty";
    // Se o erro do OMR menciona essa questão, marca como erro até ser corrigida
    const errMatch = (current?.read_errors || []).some((e) => new RegExp(`Q0?${q.question_number}\\b`).test(e));
    if (errMatch && !current?.manual_corrections?.[qKey(q.question_number)]) return "error";
    return "ok";
  }, [answers, current, dayRange]);

  const counts = useMemo(() => {
    let ok = 0, empty = 0, error = 0, otherDay = 0;
    questions.forEach((q) => {
      const s = getStatus(q);
      if (s === "ok") ok++;
      else if (s === "empty") empty++;
      else if (s === "error") error++;
      else otherDay++;
    });
    return { ok, empty, error, otherDay };
  }, [questions, getStatus]);

  const openEdit = (q: Question) => {
    setEditingQ(q);
    setEditValue(answers[qKey(q.question_number)] || "");
  };

  const saveEdit = () => {
    if (!editingQ) return;
    setAnswers((prev) => ({ ...prev, [qKey(editingQ.question_number)]: editValue || null }));
    setEditingQ(null);
  };

  const autoDetectLanguage = useCallback((detected: Record<string, string | null>): string => {
    if (questionsByLang.size === 0) return "";
    let best = languageVariants[0] || "";
    let bestCount = -1;
    for (const [lang, nums] of questionsByLang) {
      const count = nums.filter((n) => {
        const v = detected[`q${n}`];
        return v != null && v !== "" && v !== "null";
      }).length;
      if (count > bestCount) { bestCount = count; best = lang; }
    }
    return best;
  }, [languageVariants, questionsByLang]);

  const pickStudent = (s: Student) => {
    if (languageVariants.length === 0) {
      linkStudent(s.id, null);
    } else {
      setLinkPendingStudentId(s.id);
      setLinkSelectedLanguage(autoDetectLanguage(answers));
    }
  };

  const confirmLinkWithLanguage = () => {
    if (!linkPendingStudentId) return;
    linkStudent(linkPendingStudentId, linkSelectedLanguage || null);
    setLinkPendingStudentId(null);
  };

  const linkStudent = async (studentId: string, language: string | null) => {
    if (!current) return;
    const update: Record<string, any> = { student_id: studentId };
    if (language) update.language = language;
    const { error } = await supabase
      .from("scan_submissions")
      .update(update)
      .eq("id", current.id);
    if (error) {
      toast({ title: "Erro ao vincular aluno", description: error.message, variant: "destructive" });
      return;
    }
    setSubmissions((prev) => prev.map((s, i) => (i === idx ? { ...s, student_id: studentId, ...(language ? { language } : {}) } : s)));
    setLinkStudentDialog(false);
    setStudentSearchTerm("");
    toast({ title: "Aluno vinculado", description: language ? `Idioma: ${language}` : undefined });
  };

  const advance = () => {
    if (idx < submissions.length - 1) {
      setIdx(idx + 1);
    } else {
      navigate(`/omr/done/${templateId}`);
    }
  };

  const approveAndNext = async () => {
    if (!current) return;
    if (!current.student_id) {
      toast({ title: "Vincule um aluno antes de aprovar", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // detectar quais foram corrigidas manualmente
      // As chaves em `answers` e `detected_answers` estão no formato "q{n}"
      const original = current.detected_answers || {};
      const manual: Record<string, string | null> = {};
      Object.keys(answers).forEach((k) => {
        if (answers[k] !== original[k]) manual[k] = answers[k];
      });

      const langToSave = current.language != null
        ? undefined
        : (languageVariants.length > 0 ? autoDetectLanguage(answers) : undefined);

      const { error } = await supabase
        .from("scan_submissions")
        .update({
          reviewed: true,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          detected_answers: answers,
          manual_corrections: manual,
          ...(langToSave ? { language: langToSave } : {}),
        })
        .eq("id", current.id);
      if (error) throw error;
      // Remove da fila local e avança
      setSubmissions((prev) => prev.filter((_, i) => i !== idx));
      if (idx >= submissions.length - 1) {
        navigate(`/omr/done/${templateId}`);
      }
      // idx fica igual: o próximo "sobe" para o índice atual
    } catch (err: any) {
      toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    if (!current) return;
    // Se está sem aluno vinculado, abre fluxo de "órfão": vincular ou excluir definitivamente
    if (!current.student_id) {
      setOrphanDialog(true);
      return;
    }
    if (!confirm("Descartar este scan? O aluno precisará refazer a folha ou ter as respostas inseridas manualmente.")) return;
    const { error } = await supabase
      .from("scan_submissions")
      .update({ discarded: true, reviewed: true, reviewed_at: new Date().toISOString() })
      .eq("id", current.id);
    if (error) {
      toast({ title: "Erro ao descartar", description: error.message, variant: "destructive" });
      return;
    }
    setSubmissions((prev) => prev.filter((_, i) => i !== idx));
    if (idx >= submissions.length - 1) navigate(`/omr/done/${templateId}`);
  };

  const deleteOrphan = async () => {
    if (!current) return;
    setDeleting(true);
    try {
      // remove o arquivo do storage (best-effort)
      if (current.scan_image_path) {
        await supabase.storage.from("omr-scans").remove([current.scan_image_path]);
      }
      const { error } = await supabase.from("scan_submissions").delete().eq("id", current.id);
      if (error) throw error;
      setSubmissions((prev) => prev.filter((_, i) => i !== idx));
      setOrphanDialog(false);
      toast({ title: "Scan excluído", description: "Removido permanentemente do banco de dados." });
      if (idx >= submissions.length - 1) navigate(`/omr/done/${templateId}`);
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (!templateId) {
    return (
      <div className="min-h-screen bg-background">
        <OmrStepHeader step="review" title="Revisar Leituras" />
        <OmrEmptyState stepLabel="Revisar Leituras" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-3" />
          <h2 className="text-xl font-bold">Nada para revisar</h2>
          <p className="text-muted-foreground mb-4">Todos os scans desta prova já foram processados.</p>
          <Button onClick={() => navigate(`/omr/done/${templateId}`)}>Ver resumo</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <OmrStepHeader step="review" title={templateName ? `Revisar Leituras · ${templateName}` : "Revisar Leituras"} templateId={templateId} />
      <div className="border-b bg-card flex-shrink-0">
        <div className="container mx-auto px-4 py-2 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <Badge variant="secondary">{submissions.length} pendente(s)</Badge>
            <div className="text-xs text-muted-foreground mt-1">
              {currentStudent ? (
                <>
                  Aluno: <strong>{currentStudent.nome}</strong> {currentStudent.matricula && `(${currentStudent.matricula})`}
                  {current?.language && (
                    <span className="ml-2">• Língua estrangeira: <strong>{current.language}</strong></span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-destructive">Sem aluno vinculado</span>
                  {current?.qr_data?.student_id && (
                    <span className="text-muted-foreground ml-1">
                      — QR lido: matrícula <strong>{current.qr_data.student_id}</strong>
                      {current.qr_data.template_id && ` / template ${String(current.qr_data.template_id).slice(0, 8)}…`}
                    </span>
                  )}
                  {!current?.qr_data?.student_id && <span className="text-muted-foreground ml-1">— QR não foi lido</span>}
                </>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setLinkStudentDialog(true)}>
            {currentStudent ? "Trocar aluno" : "Vincular aluno"}
          </Button>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => idx > 0 && setIdx(idx - 1)} disabled={idx === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm tabular-nums px-2">{idx + 1} / {submissions.length}</span>
            <Button size="icon" variant="ghost" onClick={() => idx < submissions.length - 1 && setIdx(idx + 1)} disabled={idx >= submissions.length - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* IMAGEM */}
        <Card className="overflow-hidden flex flex-col">
          <div className="border-b p-2 flex items-center gap-2 flex-shrink-0">
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
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* QUESTÕES */}
        <Card className="overflow-hidden flex flex-col">
          <div className="border-b p-3 flex items-center gap-2 flex-shrink-0 flex-wrap">
            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />{counts.ok} ok</Badge>
            {counts.empty > 0 && (
              <Badge variant="outline" className="gap-1 border-warning text-warning">
                <AlertTriangle className="h-3 w-3" />{counts.empty} vazias
              </Badge>
            )}
            {counts.error > 0 && (
              <Badge variant="destructive" className="gap-1"><X className="h-3 w-3" />{counts.error} erros</Badge>
            )}
            {counts.otherDay > 0 && (
              <Badge variant="secondary" className="gap-1 text-muted-foreground">
                {counts.otherDay} outro dia
              </Badge>
            )}
            {dayRange && (
              <Badge variant="outline" className="gap-1 ml-auto">
                {current?.qr_data?.day ? `Dia ${current.qr_data.day}` : "Dia 1"} · Q{dayRange.start}–Q{dayRange.end}
              </Badge>
            )}
            {!dayRange && current.read_errors.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto truncate" title={current.read_errors.join(" • ")}>
                {current.read_errors.length} aviso(s) do OMR
              </span>
            )}
          </div>

          <ScrollArea className="flex-1">
            {questions.length === 0 && (
              <Alert className="m-3 border-warning">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Este gabarito não possui questões cadastradas. Acesse{" "}
                  <button
                    className="underline font-medium"
                    onClick={() => navigate(`/templates/${templateId}`)}
                  >
                    Editar Gabarito
                  </button>{" "}
                  para adicionar as questões com as respostas corretas antes de revisar os scans.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
              {questions.map((q) => {
                const status = getStatus(q);
                const value = answers[qKey(q.question_number)] || "";
                const isManual = current.manual_corrections?.[qKey(q.question_number)] !== undefined;
                const isOtherDay = status === "other_day";
                return (
                  <button
                    key={q.question_number}
                    onClick={() => !isOtherDay && openEdit(q)}
                    disabled={isOtherDay}
                    title={
                      isOtherDay && q.question_type === "discursive"
                        ? "Questão discursiva — corrigida manualmente em Notas Discursivas"
                        : isOtherDay
                        ? "Questão de outro dia — não presente nesta folha"
                        : undefined
                    }
                    className={`text-left border rounded-md p-2 transition-colors ${
                      isOtherDay
                        ? "border-border/40 bg-muted/30 opacity-50 cursor-default"
                        : status === "error"
                        ? "border-destructive bg-destructive/5 hover:border-primary"
                        : status === "empty"
                        ? "border-warning bg-warning/10 hover:border-primary"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-semibold ${isOtherDay ? "text-muted-foreground" : ""}`}>
                        Q{String(q.question_number).padStart(2, "0")}
                      </span>
                      {status === "ok" && <CheckCircle2 className="h-3 w-3 text-primary" />}
                      {status === "empty" && <AlertTriangle className="h-3 w-3 text-warning" />}
                      {status === "error" && <X className="h-3 w-3 text-destructive" />}
                    </div>
                    <div className={`font-mono text-sm font-bold truncate ${isOtherDay ? "text-muted-foreground" : ""}`}>
                      {isOtherDay ? (
                        <span className="text-muted-foreground italic font-sans font-normal text-xs">
                          {q.question_type === "discursive" ? "discursiva" : "outro dia"}
                        </span>
                      ) : value || (
                        <span className="text-muted-foreground italic font-sans font-normal text-xs">vazia</span>
                      )}
                    </div>
                    {isManual && !isOtherDay && <span className="text-[10px] text-primary">corrigida</span>}
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          <div className="border-t p-3 flex flex-wrap gap-2 flex-shrink-0">
            <Button onClick={approveAndNext} disabled={saving} className="flex-1 min-w-[140px]">
              <Check className="h-4 w-4 mr-1" />
              {saving ? "Salvando..." : "Aprovar e avançar"}
            </Button>
            <Button variant="outline" onClick={advance}>
              Pular
            </Button>
            <Button variant="destructive" onClick={discard}>
              <X className="h-4 w-4 mr-1" /> Descartar
            </Button>
          </div>
        </Card>
      </main>

      {/* MODAL CORREÇÃO */}
      <Dialog open={!!editingQ} onOpenChange={(o) => !o && setEditingQ(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corrigir Q{editingQ?.question_number}</DialogTitle>
            <DialogDescription>
              {editingQ?.question_type === "objective" && "Selecione a alternativa marcada pelo aluno."}
              {editingQ?.question_type === "summation" && "Digite a soma das proposições marcadas (ex: 21 = 01+04+16)."}
              {editingQ?.question_type === "open_numeric" && "Digite o número (0–99)."}
              {editingQ?.question_type === "discursive" && "Esta questão é discursiva e será corrigida manualmente fora do OMR."}
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
            <Button onClick={saveEdit} disabled={editingQ?.question_type === "discursive"}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL VINCULAR ALUNO */}
      <Dialog open={linkStudentDialog} onOpenChange={(o) => { setLinkStudentDialog(o); if (!o) setLinkPendingStudentId(null); }}>
        <DialogContent className="max-w-lg">
          {!linkPendingStudentId ? (
            <>
              <DialogHeader>
                <DialogTitle>Vincular aluno a este scan</DialogTitle>
                <DialogDescription>
                  Use quando o QR Code não foi lido corretamente.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="Buscar nome ou matrícula..."
                value={studentSearchTerm}
                onChange={(e) => setStudentSearchTerm(e.target.value)}
              />
              <ScrollArea className="h-72 border rounded-md">
                <div className="divide-y">
                  {filteredStudents.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => pickStudent(s)}
                      className="w-full text-left p-3 hover:bg-accent transition-colors"
                    >
                      <div className="font-medium">{s.nome}</div>
                      <div className="text-xs text-muted-foreground">{s.matricula || "sem matrícula"}</div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Languages className="h-5 w-5" /> Confirmar língua estrangeira
                </DialogTitle>
                <DialogDescription>
                  Este template tem questões de idioma alternativo. Qual língua o aluno escolheu neste exame?
                </DialogDescription>
              </DialogHeader>
              <RadioGroup value={linkSelectedLanguage} onValueChange={setLinkSelectedLanguage} className="gap-3">
                {languageVariants.map((lang) => (
                  <Label key={lang} className="flex items-center gap-3 border rounded-md p-4 cursor-pointer hover:border-primary">
                    <RadioGroupItem value={lang} />
                    <span className="font-medium">{lang}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {(questionsByLang.get(lang) || []).length} questão(ões) detectadas
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLinkPendingStudentId(null)}>Voltar</Button>
                <Button onClick={confirmLinkWithLanguage} disabled={!linkSelectedLanguage}>Confirmar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL ÓRFÃO — scan sem aluno vinculado */}
      <AlertDialog open={orphanDialog} onOpenChange={setOrphanDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Scan sem aluno vinculado
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este gabarito não tem aluno vinculado e não será contabilizado em nenhum boletim.
              Você pode <strong>vincular um aluno agora</strong> ou <strong>excluí-lo permanentemente</strong> para
              não acumular registros sem dono no banco de dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={deleting}>Voltar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setOrphanDialog(false);
                setLinkStudentDialog(true);
              }}
              disabled={deleting}
            >
              Vincular aluno
            </Button>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteOrphan();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Excluindo...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-1" /> Excluir definitivamente</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OmrReview;