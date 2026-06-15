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

    // Usar language_variant da própria correção (salvo no calculateGrades)
    // Se null → template não tem variantes → contar todas as questões
    const corrLang = (correction as any).language_variant as string | null;
    const filteredQuestions = questions.filter(q => {
      const variant = (q as any).language_variant;
      if (!variant) return true;        // questão sem variante: sempre incluir
      if (!corrLang) return true;       // template sem variantes: incluir tudo
      return variant === corrLang;
    });

    const questionMap = new Map(filteredQuestions.map(q => [q.question_number, q]));

    let totalScore = 0;
    let maxScore = 0;

    for (const answer of answers) {
      const question = questionMap.get(answer.question_number);
      if (!question) continue;

      const questionType = (question as any).question_type || "objective";
      const numPropositions = (question as any).num_propositions || 5;
      let isCorrect = false;
      let pointsEarned = 0;

      if (questionType === "summation") {
        const studentSum = parseInt(answer.student_answer || "0") || 0;
        const correctSum = parseInt(question.correct_answer || "0") || 0;
        const result = calculateSummationScore(studentSum, correctSum, numPropositions, question.points ?? 1);
        pointsEarned = result.score;
        isCorrect = pointsEarned > 0;
        maxScore += result.maxScore;
      } else if (questionType === "open_numeric") {
        const studentNum = answer.student_answer != null ? parseInt(answer.student_answer) : null;
        const correctNum = parseInt(question.correct_answer || "0") || 0;
        const result = calculateOpenNumericScore(studentNum, correctNum, question.points ?? 1);
        pointsEarned = result.score;
        isCorrect = result.isCorrect;
        maxScore += result.maxScore;
      } else if (questionType === "discursive") {
        // Discursive: points_earned is manually set, don't override
        pointsEarned = answer.points_earned || 0;
        isCorrect = pointsEarned > 0;
        maxScore += question.points ?? 5;
        totalScore += pointsEarned;
        continue; // Skip the update below for discursive
      } else {
        // Objective
        isCorrect = answer.student_answer?.toUpperCase() === question.correct_answer.toUpperCase();
        pointsEarned = isCorrect ? (question.points ?? 1) : 0;
        maxScore += question.points ?? 1;
      }

      totalScore += pointsEarned;

      // Update student_answer record
      await supabase
        .from("student_answers")
        .update({
          correct_answer: question.correct_answer,
          is_correct: isCorrect,
          points_earned: pointsEarned,
        })
        .eq("id", answer.id);
    }

    // Update correction totals
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    await supabase
      .from("corrections")
      .update({
        total_score: totalScore,
        max_score: maxScore,
        percentage,
      })
      .eq("id", correction.id);

    correctionsUpdated++;
  }

  return { success: true, correctionsUpdated };
}
