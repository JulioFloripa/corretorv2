import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, RefreshCw, Pencil, Ban, XCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { recalculateByTemplate } from "@/lib/recalculate";
import { EXAM_PRESETS, generatePresetQuestions } from "@/lib/exam-presets";
import { QUESTION_TYPE_LABELS, getObjectiveAlternatives, type QuestionType } from "@/lib/ufsc-scoring";
import SummationAnswerEditor from "@/components/template/SummationAnswerEditor";

interface TemplateQuestion {
  id: string;
  question_number: number;
  correct_answer: string;
  points: number;
  subject: string | null;
  topic: string | null;
  language_variant: string | null;
  question_type: string;
  num_propositions: number | null;
  status: string | null;
}

interface DisciplineOption {
  id: string;
  name: string;
  topics: { id: string; name: string }[];
}

const TemplateEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [template, setTemplate] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [questions, setQuestions] = useState<TemplateQuestion[]>([]);
  const [disciplines, setDisciplines] = useState<DisciplineOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecalcDialog, setShowRecalcDialog] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    loadTemplate();
    loadDisciplines();
  }, [id]);

  const loadDisciplines = async () => {
    const { data: discData } = await supabase.from("disciplines").select("*").order("name");
    const { data: topicsData } = await supabase.from("discipline_topics").select("*").order("name");
    
    const mapped: DisciplineOption[] = (discData || []).map((d) => ({
      id: d.id,
      name: d.name,
      topics: (topicsData || []).filter((t) => t.discipline_id === d.id),
    }));
    setDisciplines(mapped);
  };

  const loadTemplate = async () => {
    if (!id) return;

    const { data: templateData, error: templateError } = await supabase
      .from("templates")
      .select("*")
      .eq("id", id)
      .single();

    if (templateError) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar gabarito",
        description: templateError.message,
      });
      navigate("/templates");
      return;
    }

    setTemplate(templateData);
    setEditName(templateData.name || "");
    setEditDescription(templateData.description || "");

    const { data: questionsData, error: questionsError } = await supabase
      .from("template_questions")
      .select("*")
      .eq("template_id", id)
      .order("question_number");

    if (questionsError) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar questões",
        description: questionsError.message,
      });
    } else if (questionsData && questionsData.length > 0) {
      setQuestions(questionsData.map(q => ({
        ...q,
        language_variant: (q as any).language_variant ?? null,
        question_type: (q as any).question_type ?? "objective",
        num_propositions: (q as any).num_propositions ?? null,
        status: (q as any).status ?? null,
      })));
    } else {
      // Use preset if available, otherwise create empty questions
      const preset = EXAM_PRESETS[templateData.exam_type];
      if (preset) {
        const presetQuestions = generatePresetQuestions(preset).map((q, i) => ({
          ...q,
          id: `temp-${i}`,
        }));
        setQuestions(presetQuestions);
      } else {
        const emptyQuestions: TemplateQuestion[] = Array.from(
          { length: templateData.total_questions },
          (_, i) => ({
            id: `temp-${i}`,
            question_number: i + 1,
            correct_answer: "A",
            points: 1,
            subject: null,
            topic: null,
            language_variant: null,
            question_type: "objective",
            num_propositions: null,
            status: null,
          })
        );
        setQuestions(emptyQuestions);
      }
    }

    setLoading(false);
  };

  const handleSaveQuestions = async () => {
    if (!id) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Salvar metadados do template (nome e descrição)
    if (editName.trim()) {
      const { error: metaError } = await supabase
        .from("templates")
        .update({ name: editName.trim(), description: editDescription.trim() || null })
        .eq("id", id);
      if (metaError) {
        toast({ variant: "destructive", title: "Erro ao salvar dados do gabarito", description: metaError.message });
        return;
      }
      setTemplate((prev: any) => ({ ...prev, name: editName.trim(), description: editDescription.trim() || null }));
    }

    // Deletar questões existentes
    await supabase.from("template_questions").delete().eq("template_id", id);

    // Inserir novas questões
    const questionsToInsert = questions.map((q) => ({
      template_id: id,
      question_number: q.question_number,
      correct_answer: q.correct_answer,
      points: q.points,
      subject: q.subject,
      topic: q.topic,
      language_variant: q.language_variant,
      question_type: q.question_type,
      num_propositions: q.num_propositions,
      status: q.status,
    }));

    const { error } = await supabase.from("template_questions").insert(questionsToInsert);

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar questões",
        description: error.message,
      });
      return;
    }

    toast({ title: "Gabarito salvo com sucesso!" });

    // Check if there are corrections linked to this template
    const { count } = await supabase
      .from("corrections")
      .select("id", { count: "exact", head: true })
      .eq("template_id", id);

    if (count && count > 0) {
      const hasStatus = questions.some(q => q.status != null);
      if (hasStatus) {
        // Auto-recalculate when any question has anulada/cancelada status
        setRecalculating(true);
        const result = await recalculateByTemplate(id);
        setRecalculating(false);
        if (result.success) {
          toast({ title: `Notas recalculadas: ${result.correctionsUpdated} correção(ões) atualizadas.` });
        } else {
          toast({ variant: "destructive", title: "Erro ao recalcular", description: result.error });
        }
        navigate("/templates");
      } else {
        setShowRecalcDialog(true);
      }
    } else {
      navigate("/templates");
    }
  };

  const handleRecalculate = async () => {
    if (!id) return;
    setRecalculating(true);
    const result = await recalculateByTemplate(id);
    setRecalculating(false);
    setShowRecalcDialog(false);

    if (result.success) {
      toast({ title: `${result.correctionsUpdated} correção(ões) recalculada(s) com sucesso!` });
    } else {
      toast({ variant: "destructive", title: "Erro ao recalcular", description: result.error });
    }
    navigate("/templates");
  };

  const updateQuestion = (questionId: string, fields: Partial<TemplateQuestion>) => {
    setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, ...fields } : q));
  };

  // Agrupa questões de LE: todas as de Inglês primeiro, depois todas de Espanhol,
  // mantendo o restante na ordem original. Necessário porque o ORDER BY question_number
  // não garante a ordem dentro de questões com mesmo número.
  const groupedQuestions = (() => {
    const result: TemplateQuestion[] = [];
    const leIngles: TemplateQuestion[] = [];
    const leEspanhol: TemplateQuestion[] = [];
    for (const q of questions) {
      if (q.language_variant === "Inglês") { leIngles.push(q); }
      else if (q.language_variant === "Espanhol") { leEspanhol.push(q); }
      else {
        if (leIngles.length || leEspanhol.length) {
          result.push(
            ...leIngles.sort((a, b) => a.question_number - b.question_number),
            ...leEspanhol.sort((a, b) => a.question_number - b.question_number),
          );
          leIngles.length = 0;
          leEspanhol.length = 0;
        }
        result.push(q);
      }
    }
    result.push(
      ...leIngles.sort((a, b) => a.question_number - b.question_number),
      ...leEspanhol.sort((a, b) => a.question_number - b.question_number),
    );
    return result;
  })();

  const getTopicsForDiscipline = (disciplineName: string | null) => {
    if (!disciplineName) return [];
    const disc = disciplines.find((d) => d.name === disciplineName);
    return disc?.topics || [];
  };

  const getQuestionTypeBadge = (type: string) => {
    switch (type) {
      case "summation":
        return <Badge variant="secondary" className="text-[10px] px-1">SOM</Badge>;
      case "open_numeric":
        return <Badge variant="outline" className="text-[10px] px-1">NUM</Badge>;
      case "discursive":
        return <Badge className="text-[10px] px-1 bg-accent text-accent-foreground">DISC</Badge>;
      case "true_false":
        return <Badge variant="secondary" className="text-[10px] px-1">V/F</Badge>;
      case "objective_2":
        return <Badge variant="outline" className="text-[10px] px-1">2alt</Badge>;
      case "objective_3":
        return <Badge variant="outline" className="text-[10px] px-1">3alt</Badge>;
      case "objective_4":
        return <Badge variant="outline" className="text-[10px] px-1">4alt</Badge>;
      default:
        return null;
    }
  };

  const renderAnswerInput = (question: TemplateQuestion) => {
    const isVariant = question.language_variant != null;

    switch (question.question_type) {
      case "summation":
        return (
          <div className="flex items-center gap-1">
            {isVariant && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {question.language_variant === "Inglês" ? "🇬🇧" : "🇪🇸"}
              </span>
            )}
            <SummationAnswerEditor
              value={question.correct_answer}
              numPropositions={question.num_propositions || 5}
              onChange={(newSum) => updateQuestion(question.id, { correct_answer: newSum })}
            />
          </div>
        );
      case "open_numeric":
        return (
          <Input
            className="h-8 w-20 font-mono"
            type="number"
            min="0"
            max="99"
            value={question.correct_answer}
            onChange={(e) => {
              const val = Math.min(99, Math.max(0, parseInt(e.target.value) || 0));
              updateQuestion(question.id, { correct_answer: String(val) });
            }}
          />
        );
      case "discursive":
        return (
          <span className="text-xs text-muted-foreground italic">Manual (0-5)</span>
        );
      case "true_false":
        return (
          <Select
            value={question.correct_answer}
            onValueChange={(value) => updateQuestion(question.id, { correct_answer: value })}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="V">V</SelectItem>
              <SelectItem value="F">F</SelectItem>
            </SelectContent>
          </Select>
        );
      default: {
        // Objective and objective_N variants: use preset alternatives or derive from question_type
        const presetAlts = EXAM_PRESETS[template?.exam_type]?.alternatives;
        const alternatives = presetAlts && presetAlts.length > 0
          ? presetAlts
          : getObjectiveAlternatives(question.question_type);
        return (
          <div className="flex items-center gap-1">
            {isVariant && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {question.language_variant === "Inglês" ? "🇬🇧" : "🇪🇸"}
              </span>
            )}
            <Select
              value={question.correct_answer}
              onValueChange={(value) => updateQuestion(question.id, { correct_answer: value })}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {alternatives.map((alt) => (
                  <SelectItem key={alt} value={alt}>{alt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      }
    }
  };

  const statusSummary = (() => {
    const anuladas = questions.filter(q => q.status === "anulada");
    const canceladas = questions.filter(q => q.status === "cancelada");
    return { anuladas, canceladas };
  })();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const showTypeColumn = ["ufsc", "custom", "multiple_choice"].includes(template?.exam_type || "");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("/templates")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 max-w-lg space-y-1">
              <div className="flex items-center gap-2">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  className="h-8 text-base font-bold border-dashed bg-transparent px-2 focus-visible:border-solid"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome do gabarito"
                />
              </div>
              <Input
                className="h-7 text-xs border-dashed bg-transparent px-2 text-muted-foreground focus-visible:border-solid"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Descrição (opcional)"
              />
            </div>
          </div>
          <Button onClick={handleSaveQuestions}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Gabarito
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Gabarito das Questões</CardTitle>
            {(statusSummary.anuladas.length > 0 || statusSummary.canceladas.length > 0) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {statusSummary.anuladas.length > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    <Ban className="h-3.5 w-3.5" />
                    <span>{statusSummary.anuladas.length} questão(ões) anulada(s) — todos os alunos recebem os pontos</span>
                  </div>
                )}
                {statusSummary.canceladas.length > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-1">
                    <XCircle className="h-3.5 w-3.5" />
                    <span>{statusSummary.canceladas.length} questão(ões) cancelada(s) — pontos redistribuídos entre as demais</span>
                  </div>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-16">#</th>
                  {showTypeColumn && (
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground w-28">Tipo</th>
                  )}
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-24">Resposta</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Disciplina</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Conteúdo</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-20">Pontos</th>
                  {showTypeColumn && (
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground w-16">Props</th>
                  )}
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-24">Situação</th>
                </tr>
              </thead>
              <tbody>
                {groupedQuestions.map((question, index) => {
                  const isVariant = question.language_variant != null;
                  const isEspanhol = question.language_variant === "Espanhol";
                  const nextQ = groupedQuestions[index + 1];
                  // Borda grossa no fim de cada grupo de idioma (Inglês→Espanhol ou Espanhol→não-LE)
                  const isEndOfLangGroup = isVariant && (!nextQ?.language_variant || nextQ.language_variant !== question.language_variant);

                  return (
                    <tr
                      key={question.id}
                      className={`border-b last:border-0 hover:bg-muted/50 ${
                        question.status === "anulada" ? "bg-amber-50/60" :
                        question.status === "cancelada" ? "bg-destructive/5 opacity-60" :
                        isVariant ? "bg-accent/20" : ""
                      } ${isEndOfLangGroup ? 'border-b-2 border-b-border' : ''}`}
                    >
                      <td className="py-2 px-2 font-medium">
                        <div className="flex items-center gap-1">
                          {isEspanhol ? "" : question.question_number}
                          {!showTypeColumn && getQuestionTypeBadge(question.question_type)}
                        </div>
                      </td>
                      {showTypeColumn && (
                        <td className="py-2 px-2">
                          <Select
                            value={question.question_type}
                            onValueChange={(value) => {
                              const updates: Partial<TemplateQuestion> = { question_type: value };
                              if (value === "summation") {
                                updates.num_propositions = question.num_propositions || 5;
                                updates.correct_answer = "0";
                              } else if (value === "open_numeric") {
                                updates.correct_answer = "0";
                                updates.num_propositions = null;
                              } else if (value === "discursive") {
                                updates.correct_answer = "0";
                                updates.num_propositions = null;
                              } else if (value === "true_false") {
                                updates.correct_answer = "V";
                                updates.num_propositions = null;
                              } else {
                                // objective and objective_N variants
                                updates.correct_answer = getObjectiveAlternatives(value)[0];
                                updates.num_propositions = null;
                              }
                              updateQuestion(question.id, updates);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(([key, label]) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      <td className="py-2 px-2">
                        {renderAnswerInput(question)}
                      </td>
                      <td className="py-2 px-2">
                        <Select
                          value={
                            question.language_variant === "Inglês" ? "__le_ingles__"
                            : question.language_variant === "Espanhol" ? "__le_espanhol__"
                            : question.subject || "__none__"
                          }
                          onValueChange={(value) => {
                            if (value === "__le_ingles__") {
                              updateQuestion(question.id, { language_variant: "Inglês", subject: null, topic: null });
                            } else if (value === "__le_espanhol__") {
                              updateQuestion(question.id, { language_variant: "Espanhol", subject: null, topic: null });
                            } else {
                              const realValue = value === "__none__" ? null : value;
                              updateQuestion(question.id, { language_variant: null, subject: realValue, topic: null });
                            }
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Selecione...</SelectItem>
                            <SelectItem value="__le_ingles__">🇬🇧 Língua Estrangeira — Inglês</SelectItem>
                            <SelectItem value="__le_espanhol__">🇪🇸 Língua Estrangeira — Espanhol</SelectItem>
                            {disciplines.map((disc) => (
                              <SelectItem key={disc.id} value={disc.name}>
                                {disc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        {isVariant ? null : (
                          getTopicsForDiscipline(question.subject).length > 0 ? (
                            <Select
                              value={question.topic || "__none__"}
                              onValueChange={(value) => updateQuestion(question.id, { topic: value === "__none__" ? null : value })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Selecione...</SelectItem>
                                {getTopicsForDiscipline(question.subject).map((t) => (
                                  <SelectItem key={t.id} value={t.name}>
                                    {t.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              className="h-8"
                              placeholder={question.subject ? "Nenhum conteúdo cadastrado" : "Selecione a disciplina"}
                              value={question.topic || ""}
                              onChange={(e) => updateQuestion(question.id, { topic: e.target.value || null })}
                              disabled={!question.subject}
                            />
                          )
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {isEspanhol ? null : (
                          <Input
                            className="h-8 w-20"
                            type="number"
                            step="0.1"
                            min="0"
                            value={question.points}
                            onChange={(e) =>
                              updateQuestion(question.id, { points: parseFloat(e.target.value) || 0 })
                            }
                          />
                        )}
                      </td>
                      {showTypeColumn && (
                        <td className="py-2 px-2">
                          {question.question_type === "summation" ? (
                            <Input
                              className="h-8 w-16"
                              type="number"
                              min="2"
                              max="7"
                              value={question.num_propositions || 5}
                              onChange={(e) => {
                                const val = Math.min(7, Math.max(2, parseInt(e.target.value) || 5));
                                updateQuestion(question.id, { num_propositions: val });
                              }}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      )}
                      <td className="py-2 px-2">
                        {!isEspanhol && (
                          <TooltipProvider delayDuration={200}>
                            <div className="flex items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => updateQuestion(question.id, { status: question.status === "anulada" ? null : "anulada" })}
                                    className={`p-1 rounded transition-colors ${question.status === "anulada" ? "text-amber-500 bg-amber-50" : "text-muted-foreground hover:text-amber-500 hover:bg-amber-50"}`}
                                  >
                                    <Ban className="h-4 w-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {question.status === "anulada" ? "Clique para remover anulação" : "Anular questão (todos ganham os pontos)"}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => updateQuestion(question.id, { status: question.status === "cancelada" ? null : "cancelada" })}
                                    className={`p-1 rounded transition-colors ${question.status === "cancelada" ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {question.status === "cancelada" ? "Clique para remover cancelamento" : "Cancelar questão (pontos redistribuídos)"}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={showRecalcDialog} onOpenChange={setShowRecalcDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalcular correções?</AlertDialogTitle>
            <AlertDialogDescription>
              Existem correções vinculadas a este gabarito. Deseja recalcular os resultados com base nas novas respostas do gabarito?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => navigate("/templates")} disabled={recalculating}>
              Não, apenas salvar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRecalculate} disabled={recalculating}>
              {recalculating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Recalculando...
                </>
              ) : (
                "Sim, recalcular"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TemplateEdit;
