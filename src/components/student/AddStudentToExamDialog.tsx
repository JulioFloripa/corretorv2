import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, UserPlus, CheckCircle2, XCircle } from "lucide-react";

interface Template {
  id: string;
  name: string;
  exam_type: string;
  total_questions: number;
}

interface Student {
  id: string;
  name: string;
  student_id: string | null;
  campus: string | null;
  foreign_language: string | null;
}

interface TemplateQuestion {
  id: string;
  question_number: number;
  correct_answer: string;
  points: number | null;
  subject: string | null;
  language_variant: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: Template[];
  onSuccess: () => void;
  preselectedTemplateId?: string;
}

const AddStudentToExamDialog = ({ open, onOpenChange, templates, onSuccess, preselectedTemplateId }: Props) => {
  const { toast } = useToast();
  const [step, setStep] = useState<"select" | "answers">("select");
  const [selectedTemplateId, setSelectedTemplateId] = useState(preselectedTemplateId || "");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [questions, setQuestions] = useState<TemplateQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [essayScore, setEssayScore] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadStudents();
      setStep("select");
      setSelectedStudent(null);
      setAnswers({});
      setEssayScore("");
      setSelectedTemplateId(preselectedTemplateId || "");
    }
  }, [open, preselectedTemplateId]);

  const loadStudents = async () => {
    const { data } = await supabase
      .from("students")
      .select("id, name, student_id, campus, foreign_language")
      .order("name");
    setStudents(data || []);
  };

  const loadQuestions = async (templateId: string, student: Student) => {
    const { data } = await supabase
      .from("template_questions")
      .select("id, question_number, correct_answer, points, subject, language_variant")
      .eq("template_id", templateId)
      .order("question_number");

    if (!data) return;

    // Filter by student language for language variant questions
    const lang = student.foreign_language || "Inglês";
    const filtered = data.filter((q) => {
      if (!q.language_variant) return true;
      return q.language_variant === lang;
    });

    setQuestions(filtered);
    // Initialize answers
    const init: Record<number, string> = {};
    filtered.forEach((q) => (init[q.question_number] = ""));
    setAnswers(init);
  };

  const handleProceedToAnswers = async () => {
    if (!selectedTemplateId || !selectedStudent) {
      toast({ title: "Selecione o gabarito e o aluno", variant: "destructive" });
      return;
    }

    // Check if student already has a correction for this template
    const { data: existing } = await supabase
      .from("corrections")
      .select("id")
      .eq("template_id", selectedTemplateId)
      .eq("student_name", selectedStudent.name)
      .maybeSingle();

    if (existing) {
      toast({
        title: "Aluno já cadastrado nesta prova",
        description: "Este aluno já possui uma correção para este gabarito. Edite pela tela de Edição.",
        variant: "destructive",
      });
      return;
    }

    await loadQuestions(selectedTemplateId, selectedStudent);
    setStep("answers");
  };

  const handleSave = async () => {
    if (!selectedStudent || !selectedTemplateId) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Calculate scores
      let totalScore = 0;
      let maxScore = 0;
      const answersToInsert: any[] = [];

      for (const q of questions) {
        const studentAnswer = answers[q.question_number]?.trim() || null;
        const isCorrect = studentAnswer
          ? studentAnswer.toUpperCase() === q.correct_answer.toUpperCase()
          : false;
        const points = Number(q.points) || 0;
        const pointsEarned = isCorrect ? points : 0;
        totalScore += pointsEarned;
        maxScore += points;

        answersToInsert.push({
          question_number: q.question_number,
          student_answer: studentAnswer,
          correct_answer: q.correct_answer,
          is_correct: isCorrect,
          points_earned: pointsEarned,
        });
      }

      // Parse essay score
      const parsedEssay = essayScore.trim() !== "" ? Math.min(10, Math.max(0, parseFloat(essayScore.replace(",", ".")))) : null;

      // Create correction
      const { data: correction, error: corrError } = await supabase
        .from("corrections")
        .insert({
          user_id: user.id,
          template_id: selectedTemplateId,
          student_name: selectedStudent.name,
          student_id: selectedStudent.student_id,
          total_score: totalScore,
          max_score: maxScore,
          percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
          status: "completed",
          essay_score: isNaN(parsedEssay as number) ? null : parsedEssay,
        })
        .select("id")
        .single();

      if (corrError) throw corrError;

      // Insert answers
      const { error: ansError } = await supabase.from("student_answers").insert(
        answersToInsert.map((a) => ({ ...a, correction_id: correction.id }))
      );

      if (ansError) throw ansError;

      toast({ title: "Aluno adicionado com sucesso!" });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    const term = studentSearch.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      (s.student_id && s.student_id.toLowerCase().includes(term))
    );
  });

  const answeredCount = Object.values(answers).filter((a) => a.trim() !== "").length;

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Adicionar Aluno à Prova
          </DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Selecione o gabarito e o aluno cadastrado"
              : `Preencha as respostas de ${selectedStudent?.name}`}
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Gabarito (Prova)</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o gabarito" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.exam_type} - {t.total_questions}q)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Buscar Aluno</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome ou matrícula..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <ScrollArea className="h-[300px] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Sede</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Nenhum aluno encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredStudents.map((s) => (
                      <TableRow
                        key={s.id}
                        className={`cursor-pointer ${selectedStudent?.id === s.id ? "bg-primary/10" : ""}`}
                        onClick={() => setSelectedStudent(s)}
                      >
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.student_id || "-"}</TableCell>
                        <TableCell>{s.campus || "-"}</TableCell>
                        <TableCell>
                          {selectedStudent?.id === s.id && (
                            <Badge variant="default">Selecionado</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {step === "answers" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Prova: <strong>{selectedTemplate?.name}</strong></span>
              <span>•</span>
              <span>Respondidas: <strong>{answeredCount}/{questions.length}</strong></span>
            </div>

            <ScrollArea className="h-[400px] border rounded-md p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {questions.map((q) => {
                  const val = answers[q.question_number] || "";
                  const isAnswered = val.trim() !== "";
                  const isCorrect = isAnswered && val.trim().toUpperCase() === q.correct_answer.toUpperCase();

                  return (
                    <div key={q.question_number} className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        Q{String(q.question_number).padStart(2, "0")}
                        {q.subject && (
                          <span className="text-muted-foreground truncate max-w-[80px]" title={q.subject}>
                            ({q.subject})
                          </span>
                        )}
                        {isAnswered && (
                          isCorrect ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-destructive" />
                          )
                        )}
                      </Label>
                      <Input
                        value={val}
                        onChange={(e) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [q.question_number]: e.target.value.toUpperCase().slice(0, 5),
                          }))
                        }
                        placeholder={`Gab: ${q.correct_answer}`}
                        className="h-8 text-center text-sm uppercase"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 p-3 border rounded-md bg-muted/50">
                <Label className="text-sm font-medium">Redação (nota de 0 a 10)</Label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={essayScore}
                  onChange={(e) => setEssayScore(e.target.value)}
                  placeholder="Ex: 7.5"
                  className="mt-1 h-8 w-32 text-center"
                />
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "answers" && (
            <Button variant="outline" onClick={() => setStep("select")}>
              Voltar
            </Button>
          )}
          {step === "select" ? (
            <Button
              onClick={handleProceedToAnswers}
              disabled={!selectedTemplateId || !selectedStudent}
            >
              Próximo: Preencher Respostas
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : `Salvar (${answeredCount}/${questions.length} respondidas)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddStudentToExamDialog;
