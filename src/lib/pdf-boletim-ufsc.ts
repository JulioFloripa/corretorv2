import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import flemingLogo from "@/assets/fleming-logo-white.png";

// ===== Subject grouping for UFSC boletim =====

const MAIN_SUBJECTS_ORDER = [
  "Biologia",
  "Matemática",
  "Segunda Língua",
  "Primeira Língua",
];

const AFTER_HUMANAS_ORDER = ["Física", "Química"];

// Ciências Humanas e Sociais sub-groups
const CIENCIAS_HUMANAS_SUBGROUPS: Array<{ label: string; subjects: string[] }> = [
  { label: "História", subjects: ["História"] },
  { label: "Geografia", subjects: ["Geografia", "Interdisciplinar"] },
  { label: "Filosofia / Sociologia", subjects: ["Filosofia", "Sociologia"] },
];

const ALL_CIENCIAS_SUBJECTS = CIENCIAS_HUMANAS_SUBGROUPS.flatMap((g) => g.subjects);

const SUBJECT_DISPLAY_NAMES: Record<string, string> = {
  "Primeira Língua": "Primeira Língua (Língua Portuguesa ou Libras)",
};

// ===== Types =====

interface Correction {
  id: string;
  student_name: string;
  student_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  template_id: string;
  created_at: string;
  essay_score?: number | null;
}

interface StudentAnswer {
  question_number: number;
  student_answer: string | null;
  correct_answer: string;
  is_correct: boolean | null;
  points_earned: number | null;
}

interface TemplateQuestion {
  question_number: number;
  correct_answer: string;
  points: number;
  subject: string | null;
  question_type: string;
  num_propositions: number | null;
}

interface StudentMeta {
  campus?: string | null;
  foreign_language?: string | null;
}

export interface BuildPDFParams {
  doc: jsPDF;
  student: Correction;
  answers: StudentAnswer[];
  templateQuestions: TemplateQuestion[];
  allCorrections: Correction[];
  studentRanking: number;
  isFirst: boolean;
  logoData: string | null;
  studentMeta?: StudentMeta;
  templateName?: string;
}

// ===== Helpers =====

export const loadLogoBase64 = (): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = flemingLogo;
  });
};

const sumPointsForSubjects = (
  subjectNames: string[],
  answers: StudentAnswer[],
  questions: TemplateQuestion[]
): number => {
  let score = 0;
  for (const answer of answers) {
    const q = questions.find((tq) => tq.question_number === answer.question_number);
    if (q?.subject && subjectNames.includes(q.subject) && q.question_type !== "discursive") {
      score += answer.points_earned ?? 0;
    }
  }
  return Math.round(score * 100) / 100;
};

const sumDiscursive = (answers: StudentAnswer[], questions: TemplateQuestion[]): number => {
  let score = 0;
  for (const answer of answers) {
    const q = questions.find((tq) => tq.question_number === answer.question_number);
    if (q?.question_type === "discursive") {
      score += answer.points_earned ?? 0;
    }
  }
  return Math.round(score * 100) / 100;
};

export const calcUfscTotal = (totalScore: number, essayScore: number): number =>
  Math.round((totalScore + essayScore * 1.5) * 100) / 100;

export const calcUfscBase100 = (total: number): number =>
  Math.round((total / 1.05) * 100) / 100;

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

// ===== PDF builder =====

export const buildPDFForStudentUfsc = ({
  doc,
  student,
  answers,
  templateQuestions,
  allCorrections,
  studentRanking,
  isFirst,
  logoData,
  studentMeta,
  templateName = "SIMULADO UFSC",
}: BuildPDFParams) => {
  if (!isFirst) doc.addPage();

  const W = doc.internal.pageSize.getWidth();

  // ===== HEADER =====
  const headerH = 36;
  // Left: Fleming logo
  if (logoData) {
    try { doc.addImage(logoData, "PNG", 10, 5, 28, 28); } catch { /* ignore */ }
  }

  // Center text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text("FLEMING MEDICINA", W / 2, 14, { align: "center" });
  doc.setFontSize(11);
  doc.text(templateName.toUpperCase(), W / 2, 21, { align: "center" });
  doc.setFontSize(11);
  doc.text("BOLETIM DE DESEMPENHO INDIVIDUAL", W / 2, 28, { align: "center" });

  // Right: UFSC label
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 60, 130);
  doc.text("UFSC", W - 20, 22, { align: "center" });

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(10, headerH, W - 10, headerH);

  // ===== STUDENT INFO TABLE =====
  const studentData = [
    ["Nome do Candidato", student.student_name],
    ["Sede", studentMeta?.campus || "-"],
    ["ID FLEMING", student.student_id || "-"],
  ];

  autoTable(doc, {
    startY: headerH + 6,
    body: studentData,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60, fillColor: [240, 240, 240], textColor: [40, 40, 40] },
      1: { cellWidth: "auto", textColor: [20, 20, 20] },
    },
    tableLineColor: [180, 180, 180],
    tableLineWidth: 0.3,
    margin: { left: 10, right: 10 },
  });

  const afterStudent = (doc as any).lastAutoTable?.finalY ?? headerH + 30;

  // ===== PERFORMANCE TABLE =====
  const essayScore = student.essay_score ?? 0;
  const discursiveScore = sumDiscursive(answers, templateQuestions);

  // Build rows in UFSC boletim order
  type Row = { label: string; score: number; isBold?: boolean; isCiencias?: boolean };
  const rows: Row[] = [];

  for (const subj of MAIN_SUBJECTS_ORDER) {
    const score = sumPointsForSubjects([subj], answers, templateQuestions);
    rows.push({ label: SUBJECT_DISPLAY_NAMES[subj] ?? subj, score });
  }

  // Ciências Humanas e Sociais (grouped)
  const cienciasScore = sumPointsForSubjects(ALL_CIENCIAS_SUBJECTS, answers, templateQuestions);
  rows.push({ label: "Ciências Humanas e Sociais*", score: cienciasScore, isCiencias: true });

  for (const subj of AFTER_HUMANAS_ORDER) {
    const score = sumPointsForSubjects([subj], answers, templateQuestions);
    rows.push({ label: subj, score });
  }

  rows.push({ label: "Redação (peso 1)**", score: essayScore });
  rows.push({ label: "Discursivas", score: discursiveScore });

  const objectivesScore = rows
    .filter((r) => r.label !== "Redação (peso 1)**" && r.label !== "Discursivas")
    .reduce((s, r) => s + r.score, 0);
  const totalObjectivesAndDisc = objectivesScore + discursiveScore;
  const totalWithWeight = calcUfscTotal(totalObjectivesAndDisc, essayScore);
  const base100 = calcUfscBase100(totalWithWeight);

  rows.push({ label: "Total (com peso 1,5 para Redação)", score: totalWithWeight, isBold: true });

  const tableStartY = afterStudent + 6;
  const colLabelW = 110;
  const colScoreW = 30;

  autoTable(doc, {
    startY: tableStartY,
    head: [[{ content: "Desempenho do candidato", colSpan: 2, styles: { halign: "center", fillColor: [245, 158, 11], textColor: [255, 255, 255], fontSize: 11, fontStyle: "bold" } }]],
    body: [
      [{ content: "Disciplina", styles: { fontStyle: "bold", fillColor: [250, 250, 250] } }, { content: "Pontuação", styles: { fontStyle: "bold", halign: "center", fillColor: [250, 250, 250] } }],
      ...rows.map((r) => [
        { content: r.label, styles: { fontStyle: r.isBold ? "bold" : "normal" } as any },
        { content: fmt(r.score), styles: { halign: "center" as const, fontStyle: r.isBold ? "bold" : "normal" as any, textColor: r.isBold ? [20, 20, 20] : [217, 119, 6] } },
      ]),
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: colLabelW },
      1: { cellWidth: colScoreW, halign: "center" },
    },
    tableLineColor: [200, 200, 200],
    tableLineWidth: 0.3,
    margin: { left: 10, right: 10 },
  });

  const afterTable = (doc as any).lastAutoTable?.finalY ?? tableStartY + 80;

  // ===== PONTUAÇÃO FINAL BOX =====
  const boxX = W - 55;
  const boxY = afterTable + 5;
  const boxW = 45;
  const boxH = 24;

  doc.setFillColor(240, 248, 255);
  doc.setDrawColor(0, 60, 130);
  doc.setLineWidth(0.5);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 60, 130);
  doc.text("Pontuação final", boxX + boxW / 2, boxY + 7, { align: "center" });
  doc.text("(base 100)", boxX + boxW / 2, boxY + 12, { align: "center" });

  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text(fmt(base100), boxX + boxW / 2, boxY + 21, { align: "center" });

  // ===== CIÊNCIAS HUMANAS DETAIL =====
  const detailY = afterTable + 10;
  const detailX = 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  doc.text("*DETALHAMENTO CIÊNCIAS HUMANAS E SOCIAIS", detailX, detailY);

  const subGroupScores = CIENCIAS_HUMANAS_SUBGROUPS.map((g) => ({
    label: g.label,
    score: sumPointsForSubjects(g.subjects, answers, templateQuestions),
  }));

  autoTable(doc, {
    startY: detailY + 4,
    head: [subGroupScores.map((g) => ({ content: g.label, styles: { halign: "center" as const, fillColor: [250, 250, 250], textColor: [40, 40, 40], fontStyle: "bold" as const } }))],
    body: [subGroupScores.map((g) => ({ content: fmt(g.score), styles: { halign: "center" as const, textColor: [217, 119, 6] } }))],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 3 },
    tableLineColor: [200, 200, 200],
    tableLineWidth: 0.3,
    margin: { left: detailX, right: 60 },
  });

  const afterDetail = (doc as any).lastAutoTable?.finalY ?? detailY + 20;

  // ===== OBSERVATIONS =====
  const obsY = afterDetail + 8;
  const maxScore = allCorrections.reduce((max, c) => {
    const s = calcUfscBase100(calcUfscTotal(c.total_score ?? 0, c.essay_score ?? 0));
    return s > max ? s : max;
  }, 0);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  doc.text("OBSERVAÇÕES:", detailX, obsY);
  doc.setFont("helvetica", "normal");

  const obsText =
    `**A UFSC atribui peso 1,5 para a Redação. Para obter a pontuação final, você deve somar os acertos nas questões objetivas com a nota da redação multiplicada por 1,5. Em seguida, basta dividir a pontuação obtida por 1,05. A maior nota obtida neste simulado UFSC foi ${fmt(maxScore)}.`;

  const obsLines = doc.splitTextToSize(obsText, W - 20);
  doc.text(obsLines, detailX, obsY + 6);

  // ===== FOOTER =====
  const H = doc.internal.pageSize.getHeight();
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  doc.text("EQUIPE FLEMING MEDICINA", W - 10, H - 8, { align: "right" });
};
