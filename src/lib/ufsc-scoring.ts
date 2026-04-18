/**
 * UFSC Summation (Somatório) scoring logic.
 *
 * Formula: P = (NP - [NTPC - (NPC - NPI)]) / NP  if NPC > NPI, else P = 0
 *
 * Where:
 * - NP = total propositions in the question
 * - NTPC = total correct propositions (marked as correct in the answer key)
 * - NPC = correct propositions student got right (true positives)
 * - NPI = incorrect propositions student marked (false positives)
 */

/**
 * Decompose a sum into its proposition values (powers of 2: 1, 2, 4, 8, 16, 32, 64)
 */
export function decomposeSum(sum: number): number[] {
  const propositionValues = [1, 2, 4, 8, 16, 32, 64];
  const selected: number[] = [];
  for (const val of propositionValues) {
    if (sum & val) {
      selected.push(val);
    }
  }
  return selected;
}

/**
 * Get all possible proposition values for a given number of propositions
 */
export function getPropositionValues(numPropositions: number): number[] {
  const allValues = [1, 2, 4, 8, 16, 32, 64];
  return allValues.slice(0, numPropositions);
}

/**
 * Calculate UFSC summation score for a single question.
 *
 * @param studentSum - The sum the student answered (e.g., 27)
 * @param correctSum - The sum of correct propositions from answer key (e.g., 19)
 * @param numPropositions - Total number of propositions in the question
 * @param questionPoints - Points for this question (default 1)
 * @returns Object with score details
 */
export function calculateSummationScore(
  studentSum: number,
  correctSum: number,
  numPropositions: number,
  questionPoints: number = 1
): {
  score: number;
  maxScore: number;
  npc: number;
  npi: number;
  ntpc: number;
  np: number;
  formula_result: number;
} {
  const NP = numPropositions;
  
  const correctProps = decomposeSum(correctSum);
  const studentProps = decomposeSum(studentSum);
  const allValues = getPropositionValues(numPropositions);
  
  const NTPC = correctProps.length; // total correct propositions
  
  // NPC = correct propositions student got right (intersection of student & correct)
  const NPC = studentProps.filter(v => correctProps.includes(v)).length;
  
  // NPI = incorrect propositions student marked (student marked but not correct)
  const NPI = studentProps.filter(v => !correctProps.includes(v)).length;
  
  let formulaResult = 0;
  if (NPC > NPI) {
    formulaResult = (NP - (NTPC - (NPC - NPI))) / NP;
  }
  
  // Clamp to [0, 1]
  formulaResult = Math.max(0, Math.min(1, formulaResult));
  
  const score = formulaResult * questionPoints;
  
  return {
    score,
    maxScore: questionPoints,
    npc: NPC,
    npi: NPI,
    ntpc: NTPC,
    np: NP,
    formula_result: formulaResult,
  };
}

/**
 * Calculate score for an open numeric question (exact match 0-99)
 */
export function calculateOpenNumericScore(
  studentAnswer: number | null,
  correctAnswer: number,
  questionPoints: number = 1
): { score: number; maxScore: number; isCorrect: boolean } {
  const isCorrect = studentAnswer != null && studentAnswer === correctAnswer;
  return {
    score: isCorrect ? questionPoints : 0,
    maxScore: questionPoints,
    isCorrect,
  };
}

/**
 * Question types supported by the system
 */
export type QuestionType = 'objective' | 'summation' | 'open_numeric' | 'discursive';

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  objective: 'Objetiva',
  summation: 'Somatório',
  open_numeric: 'Aberta (numérica)',
  discursive: 'Discursiva',
};
