import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Loader2, AlertCircle } from "lucide-react";
import { getScanSignedUrl } from "@/lib/omr-client";
import OmrStepHeader from "@/components/omr/OmrStepHeader";

// ─── tipos ──────────────────────────────────────────────────

interface Submission {
  id: string;
  scan_image_path: string;
  qr_data: Record<string, any> | null;
  detected_answers: Record<string, string | null>;
  manual_corrections: Record<string, string | null> | null;
  student_id: string | null;
  reviewed: boolean;
  discarded: boolean;
  success: boolean | null;
  read_errors: string[] | null;
}

interface Question {
  question_number: number;
  correct_answer: string;
  question_type: string;
  points: number;
  num_propositions?: number | null;
}

interface Student {
  id: string;
  name: string;
  student_id: string | null;
}

// ─── helpers ────────────────────────────────────────────────

const qKey = (n: number) => `q${n}`;
const OBJECTIVE_OPTIONS = ["A", "B", "C", "D", "E"];

// ─── componente principal ────────────────────────────────────

const Correcao = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const { toast } = useToast();

  const [templateName, setTemplateName] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [studentsMap, setStudentsMap] = useState<Map<string, Student>>(new Map());
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [zoom, setZoom] = useState(1);
  const [editingQ, setEditingQ] = useState<(Question & { resp: string | null }) | null>(null);
  const [editValue, setEditValue] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | null>>({});

  // ── carrega dados ──
  useEffect(() => {
    if (!templateId) return;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return navigate("/auth");

      const [{ data: tpl }, { data: subs }, { data: qs }] = await Promise.all([
        supabase.from("templates").select("name").eq("id", templateId).maybeSingle(),
        supabase
          .from("scan_submissions")
          .select(
            "id, scan_image_path, qr_data, detected_answers, manual_corrections, student_id, reviewed, discarded, success, read_errors"
          )
          .eq("template_id", templateId)
          .eq("discarded", false)
          .order("created_at"),
        supabase
          .from("template_questions")
          .select("question_number, correct_answer, question_type, points, num_propositions")
          .eq("template_id", templateId)
          .order("question_number"),
      ]);

      const subsData = (subs as any[]) || [];

      // busca alunos separado (sem FK join)
      const studentIds = [...new Set(subsData.map((s: any) => s.student_id).filter(Boolean))] as string[];
      const map = new Map<string, Student>();
      if (studentIds.length > 0) {
        const { data: studs } = await supabase
          .from("students")
          .select("id, name, student_id")
          .in("id", studentIds);
        ((studs as any[]) || []).forEach((s: any) => map.set(s.id, s));
      }

      setTemplateName(tpl?.name || "");
      setSubmissions(subsData);
      setQuestions((qs as any[]) || []);
      setStudentsMap(map);
      setLoading(false);
    })();
  }, [templateId, navigate]);

  const current = submissions[idx];

  // ── imagem + respostas ao trocar cartão ──
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
    return studentsMap.get(current.student_id) || null;
  }, [current, studentsMap]);

  const confidence = useMemo(() => {
    const v = current?.qr_data?.confidence;
    return v != null ? Number(v) : null;
  }, [current]);

  // ── questões com status ──
  const questionsWithStatus = useMemo(
    () =>
      questions.map((q) => {
        const resp = answers[qKey(q.question_number)] ?? null;
        const blank = !resp || resp === "" || resp === "null";
        const ok = !blank && resp?.toUpperCase() === (q.correct_answer || "").toUpperCase();
        return { ...q, resp, blank, ok };
      }),
    [questions, answers]
  );

  const summary = useMemo(() => {
    const acertos = questionsWithStatus.filter((q) => q.ok).length;
    const erros = questionsWithStatus.filter((q) => !q.ok && !q.blank).length;
    const brancos = questionsWithStatus.filter((q) => q.blank).length;
    const nota = questions.length > 0 ? (acertos / questions.length) * 10 : 0;
    return { acertos, erros, brancos, nota };
  }, [questionsWithStatus, questions.length]);

  // ── navegação ──
  const advance = useCallback(() => {
    if (idx < submissions.length - 1) setIdx(idx + 1);
    else navigate(`/omr/done/${templateId}`);
  }, [idx, submissions.length, navigate, templateId]);

  const prev = useCallback(() => {
    if (idx > 0) setIdx(idx - 1);
  }, [idx]);

  // ── confirmar ──
  const approveAndNext = useCallback(async () => {
    if (!current) return;
    if (!current.student_id) {
      toast({ title: "Vincule um aluno antes de confirmar", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
      setSubmissions((prev) =>
        prev.map((s, i) =>
          i === idx ? { ...s, reviewed: true, manual_corrections: manual } : s
        )
      );
      toast({ title: "Confirmado!" });
      advance();
    } catch (err: any) {
      toast({ title: "Erro ao confirmar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [current, answers, idx, advance, toast]);

  // ── atalhos de teclado ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingQ) return;
      if (e.key === "Enter") approveAndNext();
      if (e.key === "ArrowDown" || e.key === "ArrowRight") advance();
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") prev();
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault();
        const firstProblem = questionsWithStatus.find((q) => !q.ok);
        if (firstProblem) {
          setEditingQ(firstProblem);
          setEditValue(firstProblem.resp || "");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editingQ, approveAndNext, advance, prev, questionsWithStatus]);

  const openEdit = (q: (typeof questionsWithStatus)[0]) => {
    setEditingQ(q);
    setEditValue(answers[qKey(q.question_number)] || "");
  };

  const saveEdit = () => {
    if (!editingQ) return;
    setAnswers((prev) => ({ ...prev, [qKey(editingQ.question_number)]: editValue || null }));
    setEditingQ(null);
  };

  // ── guards ──
  if (!templateId) {
    return (
      <div className="min-h-screen bg-background">
        <OmrStepHeader step="review" title="Correções" />
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          Nenhuma prova selecionada.
        </div>
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
        <Card className="p-10 text-center space-y-3 max-w-sm">
          <Check className="h-12 w-12 text-emerald-600 mx-auto" />
          <h2 className="text-xl font-bold">Nenhum cartão para revisar</h2>
          <p className="text-muted-foreground">Todos os cartões desta prova foram processados.</p>
          <Button onClick={() => navigate(`/omr/done/${templateId}`)}>Ver resumo</Button>
        </Card>
      </div>
    );
  }

  // ── render ──
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <OmrStepHeader
        step="review"
        title={templateName ? `Correções · ${templateName}` : "Correções"}
        templateId={templateId}
      />

      <main
        className="flex-1 grid gap-4 p-4 overflow-hidden"
        style={{ gridTemplateColumns: "1fr 340px" }}
      >
        {/* ════ ESQUERDA: identificação + questões ════ */}
        <Card className="flex flex-col overflow-hidden">
          {/* header do cartão */}
          <div className="border-b px-4 py-2.5 flex items-center gap-2 flex-shrink-0">
            <span className="font-semibold text-sm truncate flex-1">{templateName}</span>
            <span className="font-mono text-xs text-muted-foreground">
              Cartão {idx + 1} / {submissions.length}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={prev}
              disabled={idx === 0}
              title="Anterior (↑)"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={advance}
              disabled={idx >= submissions.length - 1}
              title="Próximo (↓)"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 flex flex-col gap-3 p-4 overflow-hidden">
            {/* identificação do aluno */}
            {currentStudent ? (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 flex-shrink-0">
                <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                  <Check className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{currentStudent.name}</div>
                  <div className="text-xs text-emerald-700 font-medium">
                    Identificado automaticamente · matrícula{" "}
                    {currentStudent.student_id || "—"}
                  </div>
                </div>
                {confidence !== null && (
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-[10px] text-muted-foreground">confiança</div>
                    <div className="font-mono font-bold text-sm text-emerald-700">
                      {confidence.toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  {current.qr_data?.student_id
                    ? `QR lido: matrícula ${current.qr_data.student_id} — aluno não encontrado`
                    : "Aluno não identificado — vincule manualmente"}
                </p>
              </div>
            )}

            {/* resumo acertos/erros/branco/nota */}
            <div className="grid grid-cols-4 gap-2 flex-shrink-0">
              {(
                [
                  ["Acertos", summary.acertos, "bg-emerald-50 text-emerald-700"],
                  ["Erros", summary.erros, "bg-red-50 text-red-700"],
                  ["Em branco", summary.brancos, "bg-gray-100 text-gray-500"],
                  ["Nota", summary.nota.toFixed(1), "bg-gray-100 text-gray-800"],
                ] as const
              ).map(([label, value, cls]) => (
                <div key={label} className={`rounded-lg p-3 ${cls}`}>
                  <div className="text-xs font-semibold opacity-70">{label}</div>
                  <div className="font-mono text-2xl font-bold mt-0.5 leading-none">{value}</div>
                </div>
              ))}
            </div>

            {/* grade das questões */}
            <div className="flex-1 border rounded-lg flex flex-col overflow-hidden min-h-0">
              <div className="px-3 py-2 border-b flex justify-between text-xs text-muted-foreground font-medium flex-shrink-0">
                <span>Leitura do gabarito · {questions.length} questões</span>
                <span>verde = correto · vermelho = divergente</span>
              </div>
              <ScrollArea className="flex-1">
                <div
                  className="grid gap-1.5 p-3"
                  style={{ gridTemplateColumns: "repeat(15, 1fr)" }}
                >
                  {questionsWithStatus.map((q) => {
                    const cellCls = q.blank
                      ? "bg-gray-100 border-gray-200 text-gray-400"
                      : q.ok
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-red-50 border-red-200 text-red-700";
                    return (
                      <button
                        key={q.question_number}
                        onClick={() => openEdit(q)}
                        title={`Q${q.question_number} — gabarito: ${q.correct_answer}`}
                        className={`aspect-square border rounded-md flex flex-col items-center justify-center leading-none hover:opacity-75 transition-opacity ${cellCls}`}
                      >
                        <span className="font-mono text-[8px] opacity-60">{q.question_number}</span>
                        <span className="font-mono text-xs font-bold">{q.resp || "·"}</span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </Card>

        {/* ════ DIREITA: imagem + ações ════ */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* imagem do scan */}
          <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="border-b px-3 py-2 flex items-center gap-1 flex-shrink-0">
              <span className="text-sm font-semibold flex-1">Cartão escaneado</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}
                title="Reduzir"
              >
                <ZoomOut className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                title="Ampliar"
              >
                <ZoomIn className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setZoom(1)}
                title="Ajustar"
              >
                <Maximize className="h-3 w-3" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Scan do cartão"
                    style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                    className="max-w-full transition-transform"
                  />
                ) : (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>

          {/* ações */}
          <Card className="flex-shrink-0">
            <div className="p-3 flex flex-col gap-2">
              <Button
                onClick={approveAndNext}
                disabled={saving}
                className="h-10 w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Check className="h-4 w-4 mr-2" />
                {saving ? "Salvando…" : "Confirmar e próximo"}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-9 justify-center"
                  onClick={() => {
                    const firstProblem = questionsWithStatus.find((q) => !q.ok);
                    if (firstProblem) {
                      setEditingQ(firstProblem);
                      setEditValue(firstProblem.resp || "");
                    } else {
                      toast({ title: "Nenhuma questão divergente" });
                    }
                  }}
                >
                  Corrigir leitura
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-9 justify-center"
                  onClick={() => {
                    toast({
                      title: "Marcado para revisão",
                      description: "Cartão pulado — retorne quando quiser.",
                    });
                    advance();
                  }}
                >
                  Marcar revisão
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                Enter confirma · ⌘E edita · ↑↓ navega
              </p>
            </div>
          </Card>
        </div>
      </main>

      {/* ════ DIALOG: corrigir questão ════ */}
      <Dialog open={!!editingQ} onOpenChange={(o) => !o && setEditingQ(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corrigir Q{editingQ?.question_number}</DialogTitle>
            <DialogDescription>
              Gabarito correto: <strong>{editingQ?.correct_answer}</strong>
            </DialogDescription>
          </DialogHeader>

          {editingQ?.question_type === "objective" && (
            <RadioGroup
              value={editValue}
              onValueChange={setEditValue}
              className="grid grid-cols-3 gap-2"
            >
              {OBJECTIVE_OPTIONS.map((opt) => (
                <Label
                  key={opt}
                  className="flex items-center gap-2 border rounded-md p-3 cursor-pointer hover:border-primary"
                >
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

          {(editingQ?.question_type === "summation" ||
            editingQ?.question_type === "open_numeric") && (
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
                Questão discursiva — a nota é lançada manualmente na tela de correção.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingQ(null)}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={editingQ?.question_type === "discursive"}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Correcao;
