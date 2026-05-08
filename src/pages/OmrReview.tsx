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
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Check, X, Loader2, AlertCircle, CheckCircle2, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getScanSignedUrl } from "@/lib/omr-client";

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
}

interface Student {
  id: string;
  name: string;
  student_id: string | null;
}

const OBJECTIVE_OPTIONS = ["A", "B", "C", "D", "E"];

const OmrReview = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const { toast } = useToast();

  const [templateName, setTemplateName] = useState("");
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

  // Carregar dados iniciais
  useEffect(() => {
    if (!templateId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return navigate("/auth");

      const [{ data: tpl }, { data: subs }, { data: qs }, { data: studs }] = await Promise.all([
        supabase.from("templates").select("name").eq("id", templateId).maybeSingle(),
        supabase
          .from("scan_submissions")
          .select("id, scan_image_path, qr_data, detected_answers, read_errors, student_id, answer_sheet_id, manual_corrections, success, language")
          .eq("template_id", templateId)
          .eq("reviewed", false)
          .eq("discarded", false)
          .order("created_at"),
        supabase
          .from("template_questions")
          .select("question_number, question_type, num_propositions")
          .eq("template_id", templateId)
          .order("question_number"),
        supabase.from("students").select("id, name, student_id").order("name"),
      ]);

      setTemplateName(tpl?.name || "");
      const subsData = (subs as any) || [];
      setSubmissions(subsData);
      setQuestions((qs as any) || []);
      setStudents((studs as any) || []);
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
      s.name.toLowerCase().includes(term) || (s.student_id || "").toLowerCase().includes(term)
    ).slice(0, 50);
  }, [students, studentSearchTerm]);

  // Helpers para normalizar chaves: banco salva como "q{n}", mas ao editar
  // internamente usamos também "q{n}" para consistência.
  const qKey = (n: number) => `q${n}`;

  // Status por questão
  const getStatus = useCallback((q: Question): "ok" | "empty" | "error" => {
    const v = answers[qKey(q.question_number)];
    if (!v || v === "" || v === "null") return "empty";
    // Se o erro do OMR menciona essa questão, marca como erro até ser corrigida
    const errMatch = (current?.read_errors || []).some((e) => new RegExp(`Q0?${q.question_number}\\b`).test(e));
    if (errMatch && !current?.manual_corrections?.[qKey(q.question_number)]) return "error";
    return "ok";
  }, [answers, current]);

  const counts = useMemo(() => {
    let ok = 0, empty = 0, error = 0;
    questions.forEach((q) => {
      const s = getStatus(q);
      if (s === "ok") ok++;
      else if (s === "empty") empty++;
      else error++;
    });
    return { ok, empty, error };
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

  const linkStudent = async (studentId: string) => {
    if (!current) return;
    const { error } = await supabase
      .from("scan_submissions")
      .update({ student_id: studentId })
      .eq("id", current.id);
    if (error) {
      toast({ title: "Erro ao vincular aluno", description: error.message, variant: "destructive" });
      return;
    }
    setSubmissions((prev) => prev.map((s, i) => (i === idx ? { ...s, student_id: studentId } : s)));
    setLinkStudentDialog(false);
    setStudentSearchTerm("");
    toast({ title: "Aluno vinculado" });
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

      const { error } = await supabase
        .from("scan_submissions")
        .update({
          reviewed: true,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          detected_answers: answers,
          manual_corrections: manual,
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
      <header className="border-b bg-card flex-shrink-0">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate("/omr")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Sair
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold truncate">{templateName}</h1>
              <Badge variant="secondary">{submissions.length} pendente(s)</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {currentStudent ? (
                <>
                  Aluno: <strong>{currentStudent.name}</strong> {currentStudent.student_id && `(${currentStudent.student_id})`}
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
          <Button size="sm" variant="outline" onClick={() => navigate(`/templates/${templateId}`)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar gabarito
          </Button>
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
      </header>

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
            {current.read_errors.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto truncate" title={current.read_errors.join(" • ")}>
                {current.read_errors.length} aviso(s) do OMR
              </span>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
              {questions.map((q) => {
                const status = getStatus(q);
                const value = answers[qKey(q.question_number)] || "";
                const isManual = current.manual_corrections?.[qKey(q.question_number)] !== undefined;
                return (
                  <button
                    key={q.question_number}
                    onClick={() => openEdit(q)}
                    className={`text-left border rounded-md p-2 hover:border-primary transition-colors ${
                      status === "error" ? "border-destructive bg-destructive/5" :
                      status === "empty" ? "border-warning bg-warning/10" :
                      "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold">Q{String(q.question_number).padStart(2, "0")}</span>
                      {status === "ok" && <CheckCircle2 className="h-3 w-3 text-primary" />}
                      {status === "empty" && <AlertTriangle className="h-3 w-3 text-warning" />}
                      {status === "error" && <X className="h-3 w-3 text-destructive" />}
                    </div>
                    <div className="font-mono text-sm font-bold truncate">
                      {value || <span className="text-muted-foreground italic font-sans font-normal text-xs">vazia</span>}
                    </div>
                    {isManual && <span className="text-[10px] text-primary">corrigida</span>}
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
      <Dialog open={linkStudentDialog} onOpenChange={setLinkStudentDialog}>
        <DialogContent className="max-w-lg">
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
                  onClick={() => linkStudent(s.id)}
                  className="w-full text-left p-3 hover:bg-accent transition-colors"
                >
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.student_id || "sem matrícula"}</div>
                </button>
              ))}
            </div>
          </ScrollArea>
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