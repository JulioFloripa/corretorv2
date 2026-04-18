import type { QuestionType } from "./ufsc-scoring";

export interface SubjectBlock {
  subject: string;
  count: number;
  question_type?: QuestionType;
  num_propositions?: number; // for summation questions
}

export interface ExamPreset {
  totalQuestions: number;
  alternatives: string[]; // e.g. ["A","B","C","D"] for ACAFE
  subjects: SubjectBlock[];
}

export const EXAM_PRESETS: Record<string, ExamPreset> = {
  acafe: {
    totalQuestions: 63,
    alternatives: ["A", "B", "C", "D"],
    subjects: [
      { subject: "Português", count: 14 },
      { subject: "Língua Estrangeira", count: 7 },
      { subject: "Matemática", count: 7 },
      { subject: "Física", count: 7 },
      { subject: "Química", count: 7 },
      { subject: "Biologia", count: 7 },
      { subject: "História", count: 7 },
      { subject: "Geografia", count: 7 },
    ],
  },
  acafe_criciuma: {
    totalQuestions: 63,
    alternatives: ["A", "B", "C", "D"],
    subjects: [
      { subject: "Biologia", count: 7 },
      { subject: "Química", count: 7 },
      { subject: "Física", count: 7 },
      { subject: "Matemática", count: 7 },
      { subject: "História", count: 7 },
      { subject: "Geografia", count: 7 },
      { subject: "Português", count: 14 },
      { subject: "Língua Estrangeira", count: 7 },
    ],
  },
  enem: {
    totalQuestions: 180,
    alternatives: ["A", "B", "C", "D", "E"],
    subjects: [
      { subject: "Linguagens", count: 45 },
      { subject: "Ciências Humanas", count: 45 },
      { subject: "Ciências da Natureza", count: 45 },
      { subject: "Matemática", count: 45 },
    ],
  },
  ufsc: {
    totalQuestions: 82,
    alternatives: [], // UFSC doesn't use A-E alternatives
    subjects: [
      { subject: "Primeira Língua", count: 12, question_type: "summation", num_propositions: 5 },
      { subject: "Segunda Língua", count: 8, question_type: "summation", num_propositions: 5 },
      { subject: "Matemática", count: 10, question_type: "summation", num_propositions: 5 },
      { subject: "Biologia", count: 10, question_type: "summation", num_propositions: 5 },
      { subject: "Discursiva", count: 2, question_type: "discursive" },
      { subject: "História", count: 7, question_type: "summation", num_propositions: 5 },
      { subject: "Geografia", count: 7, question_type: "summation", num_propositions: 5 },
      { subject: "Filosofia", count: 2, question_type: "summation", num_propositions: 5 },
      { subject: "Sociologia", count: 2, question_type: "summation", num_propositions: 5 },
      { subject: "Interdisciplinar", count: 2, question_type: "summation", num_propositions: 5 },
      { subject: "Física", count: 10, question_type: "summation", num_propositions: 5 },
      { subject: "Química", count: 10, question_type: "summation", num_propositions: 5 },
    ],
  },
};

/**
 * Generate pre-populated questions array from an exam preset.
 */
export function generatePresetQuestions(preset: ExamPreset) {
  const questions: {
    question_number: number;
    correct_answer: string;
    points: number;
    subject: string | null;
    topic: string | null;
    language_variant: string | null;
    question_type: string;
    num_propositions: number | null;
  }[] = [];
  let questionNum = 1;

  for (const block of preset.subjects) {
    const isForeignLanguage = block.subject === "Língua Estrangeira";
    const questionType = block.question_type || "objective";
    const numPropositions = block.num_propositions || null;

    for (let i = 0; i < block.count; i++) {
      if (isForeignLanguage) {
        // Generate two rows per question: one for each language variant
        questions.push({
          question_number: questionNum,
          correct_answer: "A",
          points: 1,
          subject: "Língua Estrangeira",
          topic: null,
          language_variant: "Inglês",
          question_type: questionType,
          num_propositions: numPropositions,
        });
        questions.push({
          question_number: questionNum,
          correct_answer: "A",
          points: 1,
          subject: "Língua Estrangeira",
          topic: null,
          language_variant: "Espanhol",
          question_type: questionType,
          num_propositions: numPropositions,
        });
      } else {
        // Default correct_answer based on question type
        let defaultAnswer = "A";
        if (questionType === "summation") defaultAnswer = "0";
        else if (questionType === "open_numeric") defaultAnswer = "0";
        else if (questionType === "discursive") defaultAnswer = "0";

        questions.push({
          question_number: questionNum,
          correct_answer: defaultAnswer,
          points: 1,
          subject: block.subject === "Discursiva" ? null : block.subject,
          topic: null,
          language_variant: null,
          question_type: questionType,
          num_propositions: numPropositions,
        });
      }
      questionNum++;
    }
  }

  return questions;
}
