import { supabase } from "@/integrations/supabase/client";
import { calculateSummationScore, calculateOpenNumericScore } from "@/lib/ufsc-scoring";

export async function recalculateByTemplate(templateId: string): Promise<{ success: boolean; correctionsUpdated: number; error?: string }> {
  // 1. Fetch updated template questions
  const { data: questions, error: qError } = await supabase
    .from("template_questions")
    .select("*")
    .eq("template_id", templateId);

  if (qError || !questions) {
    return { success: false, correctionsUpdated: 0, error: qError?.message || "Erro ao buscar questões do gabarito" };
  }

  // 2. Fetch all corrections for this template
  const { data: corrections, error: cError } = await supabase
    .from("corrections")
    .select("id, student_name, student_id, language_variant")
    .eq("template_id", templateId);

  if (cError || !corrections) {
    return { success: false, correctionsUpdated: 0, error: cError?.message || "Erro ao buscar correções" };
  }

  if (corrections.length === 0) {
    return { success: true, correctionsUpdated: 0 };
  }

  let correctionsUpdated = 0;

  for (const correction of corrections) {
    // 3. Fetch student answers for this correction
    const { data: answers, error: aError } = await supabase
      .from("student_answers")
      .select("*")
      .eq("correction_id", correction.id);

    if (aError || !answers) continue;

    const corrLang = (correction as any).language_variant as string | null;
    const filteredQuestions = questions.filter(q => {
      const variant = (q as any).language_variant;
      if (!variant) return true;
      if (!corrLang) return true;
      return variant === corrLang;
    });

    // Compute scale factor for cancelada redistribution
    const sumNormal = filteredQuestions
      .filter(q => !(q as any).status)
      .reduce((s, q) => s + (Number(q.points) || 0), 0);
    const sumCancelada = filteredQuestions
      .filter(q => (q as any).status === "cancelada")
      .reduce((s, q) => s + (Number(q.points) || 0), 0);
    const scaleFactor = sumNormal > 0 ? (sumNormal + sumCancelada) / sumNormal : 1;

    const questionMap = new Map(filteredQuestions.map(q => [q.question_number, q]));

    let totalScore = 0;
    let maxScore = 0;

    for (const answer of answers) {
      const question = questionMap.get(answer.question_number);
      if (!question) continue;

      const qStatus = (question as any).status as string | null;

      if (qStatus === "cancelada") {
        // Exclude from grading; update record to reflect exclusion
        await supabase
          .from("student_answers")
          .update({ is_correct: false, points_earned: 0 })
          .eq("id", answer.id);
        continue;
      }

      if (qStatus === "anulada") {
        const pts = Number(question.points) || 0;
        totalScore += pts;
        maxScore += pts;
        await supabase
          .from("student_answers")
          .update({ correct_answer: question.correct_answer, is_correct: true, points_earned: pts })
          .eq("id", answer.id);
        continue;
      }

      const questionType = (question as any).question_type || "objective";
      const numPropositions = (question as any).num_propositions || 5;
      const rawPoints = Number(question.points) || 0;
      const effectivePoints = Math.round(rawPoints * scaleFactor * 100) / 100;
      let isCorrect = false;
      let pointsEarned = 0;

      if (questionType === "summation") {
        const studentSum = parseInt(answer.student_answer || "0") || 0;
        const correctSum = parseInt(question.correct_answer || "0") || 0;
        const result = calculateSummationScore(studentSum, correctSum, numPropositions, effectivePoints);
        pointsEarned = result.score;
        isCorrect = pointsEarned > 0;
        maxScore += result.maxScore;
      } else if (questionType === "open_numeric") {
        const studentNum = answer.student_answer != null ? parseInt(answer.student_answer) : null;
        const correctNum = parseInt(question.correct_answer || "0") || 0;
        const result = calculateOpenNumericScore(studentNum, correctNum, effectivePoints);
        pointsEarned = result.score;
        isCorrect = result.isCorrect;
        maxScore += result.maxScore;
      } else if (questionType === "discursive") {
        pointsEarned = answer.points_earned || 0;
        isCorrect = pointsEarned > 0;
        maxScore += effectivePoints;
        totalScore += pointsEarned;
        continue;
      } else {
        isCorrect = answer.student_answer?.toUpperCase() === question.correct_answer.toUpperCase();
        pointsEarned = isCorrect ? effectivePoints : 0;
        maxScore += effectivePoints;
      }

      totalScore += pointsEarned;

      await supabase
        .from("student_answers")
        .update({
          correct_answer: question.correct_answer,
          is_correct: isCorrect,
          points_earned: pointsEarned,
        })
        .eq("id", answer.id);
    }

    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    await supabase
      .from("corrections")
      .update({ total_score: totalScore, max_score: maxScore, percentage })
      .eq("id", correction.id);

    correctionsUpdated++;
  }

  return { success: true, correctionsUpdated };
}
