import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getSubjectLabel, getSubjectColor } from "@/lib/acafe-subjects";
import flemingLogo from "@/assets/fleming-logo-white.png";

interface Correction {
  id: string;
  student_name: string;
  student_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  template_id: string;
  created_at: string;
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
  topic: string | null;
}

interface SubjectStats {
  subject: string;
  label: string;
  correct: number;
  total: number;
  percentage: number;
  color: string;
}

interface StudentMeta {
  campus?: string | null;
  foreign_language?: string | null;
}

interface BuildPDFParams {
  doc: jsPDF;
  student: Correction;
  answers: StudentAnswer[];
  templateQuestions: TemplateQuestion[];
  allCorrections: Correction[];
  studentRanking: number;
  isFirst: boolean;
  logoData: string | null;
  studentMeta?: StudentMeta;
  allStudentAnswers?: Map<string, StudentAnswer[]>;
}

/**
 * Pre-load the Fleming logo as base64 for embedding in PDFs
 */
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

const calculateSubjectStatsFromAnswers = (
  answers: StudentAnswer[],
  templateQuestions: TemplateQuestion[]
): SubjectStats[] => {
  const stats: Record<string, { correct: number; total: number }> = {};

  answers.forEach((answer) => {
    const question = templateQuestions.find(
      (q) => q.question_number === answer.question_number
    );
    const subject = question?.subject || "sem_disciplina";
    if (!stats[subject]) stats[subject] = { correct: 0, total: 0 };
    stats[subject].total++;
    if (answer.is_correct) stats[subject].correct++;
  });

  return Object.entries(stats)
    .filter(([subject]) => subject !== "sem_disciplina")
    .map(([subject, data]) => ({
      subject,
      label: getSubjectLabel(subject),
      correct: data.correct,
      total: data.total,
      percentage: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      color: getSubjectColor(subject),
    }));
};

const getWrongQuestionsFromAnswers = (
  answers: StudentAnswer[],
  templateQuestions: TemplateQuestion[]
) => {
  return answers
    .filter((a) => !a.is_correct)
    .map((a) => {
      const question = templateQuestions.find(
        (q) => q.question_number === a.question_number
      );
      return {
        question: a.question_number,
        subject: getSubjectLabel(question?.subject || ""),
        topic: question?.topic || "",
        studentAnswer: a.student_answer || "-",
        correctAnswer: a.correct_answer,
      };
    });
};

/**
 * Calculate class statistics: mean, median, standard deviation
 */
const calculateClassStats = (corrections: Correction[]) => {
  const percentages = corrections
    .map((c) => c.percentage ?? 0)
    .sort((a, b) => a - b);
  const n = percentages.length;
  if (n === 0) return { mean: 0, median: 0, stdDev: 0 };

  const mean = percentages.reduce((s, v) => s + v, 0) / n;
  const median =
    n % 2 === 0
      ? (percentages[n / 2 - 1] + percentages[n / 2]) / 2
      : percentages[Math.floor(n / 2)];
  const variance = percentages.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  return { mean, median, stdDev };
};

/**
 * Calculate per-subject class averages from all students' answers
 */
const calculatePerSubjectClassAverages = (
  allStudentAnswers: Map<string, StudentAnswer[]>,
  templateQuestions: TemplateQuestion[]
): Map<string, number> => {
  const subjectTotals: Record<string, { correct: number; total: number }> = {};

  allStudentAnswers.forEach((answers) => {
    answers.forEach((answer) => {
      const question = templateQuestions.find(
        (q) => q.question_number === answer.question_number
      );
      const subject = question?.subject || "sem_disciplina";
      if (subject === "sem_disciplina") return;
      if (!subjectTotals[subject]) subjectTotals[subject] = { correct: 0, total: 0 };
      subjectTotals[subject].total++;
      if (answer.is_correct) subjectTotals[subject].correct++;
    });
  });

  const averages = new Map<string, number>();
  Object.entries(subjectTotals).forEach(([subject, data]) => {
    averages.set(subject, data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0);
  });
  return averages;
};

/**
 * Parse a CSS hex color string to RGB values
 */
const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [100, 100, 100];
};

/**
 * Draw a bar chart directly on the PDF using jsPDF drawing primitives
 */
const drawBarChart = (
  doc: jsPDF,
  stats: SubjectStats[],
  perSubjectAvg: Map<string, number>,
  classAvgFallback: number,
  startX: number,
  startY: number,
  chartWidth: number,
  chartHeight: number
) => {
  if (stats.length === 0) return startY;

  const barAreaHeight = chartHeight - 25; // leave room for labels
  const groupWidth = (chartWidth - 20) / stats.length;
  const barWidth = groupWidth * 0.32;
  const gap = groupWidth * 0.06;

  // Draw axes
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(startX, startY, startX, startY + barAreaHeight); // Y axis
  doc.line(startX, startY + barAreaHeight, startX + chartWidth - 10, startY + barAreaHeight); // X axis

  // Y axis labels
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  for (let pct = 0; pct <= 100; pct += 25) {
    const y = startY + barAreaHeight - (pct / 100) * barAreaHeight;
    doc.text(`${pct}%`, startX - 2, y + 1, { align: "right" });
    doc.setDrawColor(230, 230, 230);
    doc.line(startX, y, startX + chartWidth - 10, y);
  }

  stats.forEach((stat, i) => {
    const groupX = startX + 5 + i * groupWidth;

    // Student bar
    const studentH = (stat.percentage / 100) * barAreaHeight;
    doc.setFillColor(22, 163, 74);
    doc.rect(groupX, startY + barAreaHeight - studentH, barWidth, studentH, "F");

    // Student bar label
    doc.setFontSize(7);
    doc.setTextColor(22, 163, 74);
    doc.setFont("helvetica", "bold");
    doc.text(
      `${stat.correct}/${stat.total}`,
      groupX + barWidth / 2,
      startY + barAreaHeight - studentH - 2,
      { align: "center" }
    );

    // Class average bar (per subject)
    const subjectAvg = perSubjectAvg.get(stat.subject) ?? classAvgFallback;
    const classH = (subjectAvg / 100) * barAreaHeight;
    doc.setFillColor(180, 180, 195);
    doc.rect(groupX + barWidth + gap, startY + barAreaHeight - classH, barWidth, classH, "F");

    // Class bar label
    doc.setTextColor(120, 120, 135);
    doc.text(
      `${subjectAvg.toFixed(0)}%`,
      groupX + barWidth + gap + barWidth / 2,
      startY + barAreaHeight - classH - 2,
      { align: "center" }
    );

    // X axis label (subject)
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(6);
    const labelText = stat.label.length > 12 ? stat.label.substring(0, 11) + "…" : stat.label;
    doc.text(labelText, groupX + barWidth + gap / 2, startY + barAreaHeight + 8, {
      align: "center",
    });
  });

  // Legend
  const legendY = startY + chartHeight - 8;
  doc.setFontSize(7);
  doc.setFillColor(22, 163, 74);
  doc.rect(startX + chartWidth / 2 - 40, legendY, 5, 5, "F");
  doc.setTextColor(60, 60, 60);
  doc.text("Aluno", startX + chartWidth / 2 - 33, legendY + 4);
  doc.setFillColor(180, 180, 195);
  doc.rect(startX + chartWidth / 2 + 5, legendY, 5, 5, "F");
  doc.text("Média da turma", startX + chartWidth / 2 + 12, legendY + 4);

  return startY + chartHeight + 5;
};

/**
 * Build a complete PDF page for one student
 */
export const buildPDFForStudent = ({
  doc,
  student,
  answers,
  templateQuestions,
  allCorrections,
  studentRanking,
  isFirst,
  logoData,
  studentMeta,
  allStudentAnswers,
}: BuildPDFParams) => {
  if (!isFirst) doc.addPage();

  const pageWidth = doc.internal.pageSize.getWidth();
  const stats = calculateSubjectStatsFromAnswers(answers, templateQuestions);
  const wrong = getWrongQuestionsFromAnswers(answers, templateQuestions);
  const classStats = calculateClassStats(allCorrections);
  const perSubjectAvg = allStudentAnswers
    ? calculatePerSubjectClassAverages(allStudentAnswers, templateQuestions)
    : new Map<string, number>();
  const totalCorrect = answers.filter((a) => a.is_correct).length;
  const totalQuestions = answers.length;

  // ===== HEADER =====
  doc.setFillColor(22, 163, 74);
  doc.rect(0, 0, pageWidth, 38, "F");

  // Logo
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", 10, 5, 28, 28);
    } catch {
      // ignore logo errors
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("BOLETIM DE DESEMPENHO - ACAFE", pageWidth / 2, 16, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Fleming Medicina", pageWidth / 2, 26, { align: "center" });
  doc.setFontSize(8);
  doc.text(
    `Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
    pageWidth / 2,
    33,
    { align: "center" }
  );

  // ===== STUDENT INFO =====
  let yPos = 50;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`${student.student_name}`, 14, yPos);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  yPos += 8;
  const col1X = 14;
  const col2X = pageWidth / 2 + 5;

  doc.text(`Matrícula: ${student.student_id || "-"}`, col1X, yPos);
  doc.text(`Data da Prova: ${new Date(student.created_at).toLocaleDateString("pt-BR")}`, col2X, yPos);

  yPos += 7;
  doc.text(`Sede: ${studentMeta?.campus || "-"}`, col1X, yPos);
  doc.text(`Língua Estrangeira: ${studentMeta?.foreign_language || "-"}`, col2X, yPos);

  // ===== SCORE CARDS (drawn as boxes) =====
  yPos += 10;
  const boxW = (pageWidth - 28 - 15) / 4;
  const boxH = 22;
  const boxes = [
    { label: "NOTA GERAL", value: `${student.percentage?.toFixed(1)}%`, bgColor: [240, 253, 244] as [number, number, number], textColor: [22, 163, 74] as [number, number, number] },
    { label: "ACERTOS", value: `${totalCorrect}/${totalQuestions}`, bgColor: [240, 249, 255] as [number, number, number], textColor: [37, 99, 235] as [number, number, number] },
    { label: "RANKING", value: `${studentRanking}º de ${allCorrections.length}`, bgColor: [254, 252, 232] as [number, number, number], textColor: [161, 98, 7] as [number, number, number] },
    { label: "ERROS", value: `${wrong.length}`, bgColor: [254, 242, 242] as [number, number, number], textColor: [220, 38, 38] as [number, number, number] },
  ];

  boxes.forEach((box, i) => {
    const bx = 14 + i * (boxW + 5);
    doc.setFillColor(box.bgColor[0], box.bgColor[1], box.bgColor[2]);
    doc.roundedRect(bx, yPos, boxW, boxH, 2, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(box.label, bx + boxW / 2, yPos + 7, { align: "center" });
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(box.textColor[0], box.textColor[1], box.textColor[2]);
    doc.text(box.value, bx + boxW / 2, yPos + 18, { align: "center" });
    doc.setFont("helvetica", "normal");
  });

  // ===== CLASS STATISTICS =====
  yPos += boxH + 8;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, yPos, pageWidth - 28, 14, 2, 2, "F");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(
    `Estatísticas da Turma:   Média: ${classStats.mean.toFixed(1)}%   |   Mediana: ${classStats.median.toFixed(1)}%   |   Desvio Padrão: ${classStats.stdDev.toFixed(1)}%   |   Total de Alunos: ${allCorrections.length}`,
    pageWidth / 2,
    yPos + 9,
    { align: "center" }
  );

  // ===== BAR CHART =====
  yPos += 22;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Desempenho por Disciplina vs Média da Turma", 14, yPos);
  doc.setFont("helvetica", "normal");
  yPos += 5;
  yPos = drawBarChart(doc, stats, perSubjectAvg, classStats.mean, 20, yPos, pageWidth - 40, 75);

  // ===== SUBJECT TABLE =====
  yPos += 3;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Desempenho por Disciplina", 14, yPos);
  doc.setFont("helvetica", "normal");

  const tableData = stats.map((stat) => [
    stat.label,
    `${stat.correct}`,
    `${stat.total}`,
    `${stat.percentage}%`,
  ]);

  autoTable(doc, {
    startY: yPos + 3,
    head: [["Disciplina", "Acertos", "Total", "Aproveitamento"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [22, 163, 74], fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  // ===== WRONG QUESTIONS (all, no limit) =====
  let wrongY = (doc as any).lastAutoTable?.finalY + 10 || yPos + 60;

  // Check if we need a new page
  if (wrongY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    wrongY = 20;
  }

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(220, 38, 38);
  doc.text(`Questões para Revisar (${wrong.length})`, 14, wrongY);
  doc.setFont("helvetica", "normal");

  const wrongData = wrong.map((q) => [
    `Q${q.question}`,
    q.subject,
    q.topic || "-",
    q.studentAnswer,
    q.correctAnswer,
  ]);

  autoTable(doc, {
    startY: wrongY + 3,
    head: [["Questão", "Disciplina", "Conteúdo", "Resposta", "Gabarito"]],
    body: wrongData,
    theme: "striped",
    headStyles: { fillColor: [220, 38, 38], fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
    styles: { cellPadding: 2 },
  });

  // ===== FOOTER =====
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(
      "Fleming Medicina — Sistema de Correção de Provas",
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
    doc.text(`Página ${p}`, pageWidth - 14, pageHeight - 8, { align: "right" });
  }
};
