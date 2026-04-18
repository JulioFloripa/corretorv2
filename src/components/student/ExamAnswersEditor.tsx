import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, X, Check, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface StudentAnswer {
  id: string;
  question_number: number;
  student_answer: string | null;
  correct_answer: string;
  is_correct: boolean | null;
  points_earned: number | null;
  points: number;
}

interface ExamAnswersEditorProps {
  correctionId: string;
  examName: string;
  studentName: string;
  answers: StudentAnswer[];
  essayScore?: number | null;
  onBack: () => void;
  onSaveSuccess: () => void;
}

const ExamAnswersEditor = ({
  correctionId,
  examName,
  studentName,
  answers: initialAnswers,
  essayScore: initialEssayScore,
  onBack,
  onSaveSuccess,
}: ExamAnswersEditorProps) => {
  const { toast } = useToast();
  const [answers, setAnswers] = useState(initialAnswers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [essayScoreValue, setEssayScoreValue] = useState<string>(
    initialEssayScore != null ? String(initialEssayScore) : ""
  );
  const [essayEditing, setEssayEditing] = useState(false);

  const handleEdit = (answer: StudentAnswer) => {
    setEditingId(answer.id);
    setEditValue(answer.student_answer || "");
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue("");
  };

  const handleSave = async (answer: StudentAnswer) => {
    setSaving(true);
    try {
      const newAnswer = editValue.trim().toUpperCase();
      const isCorrect = newAnswer === answer.correct_answer.toUpperCase();
      const pointsEarned = isCorrect ? answer.points : 0;

      // Atualizar resposta no banco
      const { error: updateError } = await supabase
        .from("student_answers")
        .update({
          student_answer: newAnswer,
          is_correct: isCorrect,
          points_earned: pointsEarned,
        })
        .eq("id", answer.id);

      if (updateError) throw updateError;

      // Atualizar estado local
      setAnswers((prev) =>
        prev.map((a) =>
          a.id === answer.id
            ? { ...a, student_answer: newAnswer, is_correct: isCorrect, points_earned: pointsEarned }
            : a
        )
      );

      // Recalcular totais da correção
      await recalculateCorrection();

      toast({
        title: "Resposta atualizada!",
        description: `Questão ${answer.question_number} foi alterada com sucesso.`,
      });

      setEditingId(null);
      setEditValue("");
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível atualizar a resposta.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEssay = async () => {
    setSaving(true);
    try {
      const parsed = essayScoreValue.trim() !== "" 
        ? Math.min(10, Math.max(0, parseFloat(essayScoreValue.replace(",", "."))))
        : null;
      const { error } = await supabase
        .from("corrections")
        .update({ essay_score: isNaN(parsed as number) ? null : parsed })
        .eq("id", correctionId);
      if (error) throw error;
      setEssayEditing(false);
      toast({ title: "Nota da redação atualizada!" });
      onSaveSuccess();
    } catch (error) {
      console.error("Erro ao salvar redação:", error);
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const recalculateCorrection = async () => {
    try {
      // Buscar todas as respostas atualizadas
      const { data: allAnswers, error: fetchError } = await supabase
        .from("student_answers")
        .select("points_earned")
        .eq("correction_id", correctionId);

      if (fetchError) throw fetchError;

      const totalScore = allAnswers.reduce((sum, a) => sum + (a.points_earned || 0), 0);
      
      // Buscar pontuação máxima do template
      const { data: correction } = await supabase
        .from("corrections")
        .select("max_score")
        .eq("id", correctionId)
        .single();

      const maxScore = correction?.max_score || 0;
      const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

      // Atualizar correção
      const { error: updateError } = await supabase
        .from("corrections")
        .update({
          total_score: totalScore,
          percentage: percentage,
        })
        .eq("id", correctionId);

      if (updateError) throw updateError;

      onSaveSuccess();
    } catch (error) {
      console.error("Erro ao recalcular:", error);
    }
  };

  const totalScore = answers.reduce((sum, a) => sum + (a.points_earned || 0), 0);
  const maxScore = answers.reduce((sum, a) => sum + a.points, 0);
  const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Editar Respostas - {examName}</CardTitle>
            <CardDescription>
              Aluno: {studentName} • {answers.length} questões
            </CardDescription>
          </div>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-4 bg-muted rounded-lg flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Pontuação Objetivas</p>
            <p className="text-2xl font-bold">
              {totalScore.toFixed(1)} / {maxScore.toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Percentual</p>
            <p className="text-2xl font-bold">{percentage.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Redação (0-10)</p>
            <div className="flex items-center gap-2 mt-1">
              {essayEditing ? (
                <>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={essayScoreValue}
                    onChange={(e) => setEssayScoreValue(e.target.value)}
                    className="w-20 h-8 text-center"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSaveEssay} disabled={saving}>
                    <Save className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setEssayEditing(false);
                    setEssayScoreValue(initialEssayScore != null ? String(initialEssayScore) : "");
                  }}>
                    <X className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold">
                    {essayScoreValue !== "" ? parseFloat(essayScoreValue).toFixed(1) : "-"}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setEssayEditing(true)}>
                    Editar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Questão</TableHead>
                <TableHead>Resposta do Aluno</TableHead>
                <TableHead>Gabarito</TableHead>
                <TableHead className="text-center">Pontos</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {answers.map((answer) => (
                <TableRow key={answer.id}>
                  <TableCell className="font-medium">
                    {answer.question_number}
                  </TableCell>
                  <TableCell>
                    {editingId === answer.id ? (
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-24"
                        maxLength={5}
                        autoFocus
                      />
                    ) : (
                      <span className="font-mono">
                        {answer.student_answer || "-"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono font-bold">
                      {answer.correct_answer}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {answer.points_earned?.toFixed(1)} / {answer.points.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-center">
                    {answer.is_correct ? (
                      <Badge className="bg-primary/20 text-primary border-primary/50">
                        <Check className="h-3 w-3 mr-1" />
                        Correta
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <X className="h-3 w-3 mr-1" />
                        Incorreta
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingId === answer.id ? (
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          onClick={() => handleSave(answer)}
                          disabled={saving}
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancel}
                          disabled={saving}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(answer)}
                      >
                        Editar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExamAnswersEditor;
