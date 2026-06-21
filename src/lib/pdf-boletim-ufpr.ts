import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Colors ────────────────────────────────────────────────────────────────────
const GREEN      = [21, 128, 61]  as [number, number, number];  // header sections
const GREEN_MID  = [22, 163, 74]  as [number, number, number];  // table header row
const GREEN_LITE = [240, 253, 244] as [number, number, number]; // alternating rows
const WHITE      = [255, 255, 255] as [number, number, number];
const DARK       = [31, 41, 55]   as [number, number, number];
const GRAY       = [107, 114, 128] as [number, number, number];
const GOLD_LITE  = [254, 252, 232] as [number, number, number]; // Curitiba highlight
const BLUE_LITE  = [239, 246, 255] as [number, number, number]; // Toledo highlight

// ── Subject order & totals ────────────────────────────────────────────────────
const SUBJECTS_ORDER = [
  "Língua Estrangeira",
  "Biologia",
  "Física",
  "Geografia",
  "História",
  "Matemática",
  "Química",
  "Literatura Brasileira",
  "Filosofia",
  "Sociologia",
  "Língua Portuguesa",
];

const SUBJECT_SHORT: Record<string, string> = {
  "Língua Estrangeira":  "Língua Estrangeira",
  "Biologia":            "Biologia",
  "Física":              "Física",
  "Geografia":           "Geografia",
  "História":            "História",
  "Matemática":          "Matemática",
  "Química":             "Química",
  "Literatura Brasileira": "Literatura Brasileira",
  "Filosofia":           "Filosofia",
  "Sociologia":          "Sociologia",
  "Língua Portuguesa":   "Língua Portuguesa",
};

const SUBJECT_TOTALS: Record<string, number> = {
  "Língua Estrangeira": 7,
  "Biologia": 8,
  "Física": 8,
  "Geografia": 8,
  "História": 8,
  "Matemática": 8,
  "Química": 8,
  "Literatura Brasileira": 5,
  "Filosofia": 5,
  "Sociologia": 5,
  "Língua Portuguesa": 10,
};

interface CampusConfig {
  id: string;
  name: string;
  course: string;
  weights: Record<string, number>;
}

const UFPR_CAMPUSES: CampusConfig[] = [
  { id: "curitiba", name: "Curitiba", course: "Medicina — Curitiba",
    weights: { "Biologia": 2, "Língua Portuguesa": 2 } },
  { id: "toledo",   name: "Toledo",   course: "Medicina — Toledo",
    weights: { "Biologia": 2, "Química": 2 } },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const getWeight = (campus: CampusConfig, subject: string) => campus.weights[subject] ?? 1;

const fmtNum = (n: number, dec = 2) => n.toFixed(dec).replace(".", ",");
const fmtPct = (s: number, m: number) => m > 0 ? `${((s / m) * 100).toFixed(1)}%` : "—";

/** Load an image from a public path as base64 data URI */
const loadImageBase64 = (src: string): Promise<string | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) { ctx.drawImage(img, 0, 0); resolve(canvas.toDataURL("image/png")); }
      else resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

export const loadUfprLogos = () =>
  Promise.all([
    loadImageBase64("/fleming-logo.png"),
    loadImageBase64("/Logo_oficial_da_UFPR_(sem_fundo).png"),
  ]);

// ── Public interface ──────────────────────────────────────────────────────────
export interface WrongQuestion {
  number: number;
  subject: string;
  topic: string;
  studentAnswer: string;
  correctAnswer: string;
}

export interface UfprPDFParams {
  doc: jsPDF;
  isFirst: boolean;
  templateName: string;
  studentName: string;
  studentId: string | null;
  studentSede: string | null;
  languageVariant: string | null;
  bySubject: Record<string, { correct: number; total: number }>;
  classAvgCount: Record<string, number>; // avg correct per subject (decimal)
  discursiveEarned: number;
  discursiveMax: number;         // should be 20
  essayScore: number | null;
  wrongQuestions: WrongQuestion[];
  flemingLogo: string | null;
  ufprLogo: string | null;
}

// ── Main PDF builder ──────────────────────────────────────────────────────────
export function buildUfprPDF(p: UfprPDFParams) {
  const { doc } = p;
  const PW = doc.internal.pageSize.getWidth();   // 210
  const ML = 12, MR = 12;
  const CW = PW - ML - MR;                        // content width ≈ 186

  if (!p.isFirst) doc.addPage();
  const startPage = doc.getNumberOfPages();

  let y = 10;

  // ── Header band ─────────────────────────────────────────────────────────────
  doc.setFillColor(...GREEN);
  doc.rect(ML, y, CW, 28, "F");

  // Fleming logo
  if (p.flemingLogo) {
    doc.addImage(p.flemingLogo, "PNG", ML + 2, y + 2, 28, 22);
  } else {
    doc.setFontSize(9); doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.text("FLEMING", ML + 6, y + 14);
  }

  // Title center
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("FLEMING MEDICINA", PW / 2, y + 8, { align: "center" });
  doc.setFontSize(11);
  doc.text(p.templateName.toUpperCase(), PW / 2, y + 15, { align: "center" });
  doc.setFontSize(8);
  doc.text("DESEMPENHO INDIVIDUAL DO CANDIDATO", PW / 2, y + 22, { align: "center" });

  // UFPR logo
  if (p.ufprLogo) {
    doc.addImage(p.ufprLogo, "PNG", PW - MR - 26, y + 2, 22, 22);
  }

  y += 32;

  // ── Section 1: Candidato ─────────────────────────────────────────────────────
  sectionHeader(doc, ML, y, CW, "INFORMAÇÕES SOBRE O(A) CANDIDATO(A)");
  y += 7;

  const infoRows = [
    ["Nome do candidato", p.studentName],
    ["Projeto / Sede", p.studentSede || "—"],
    ["Curso", "Medicina"],
    ["ID FLEMING", p.studentId || "—"],
    ["Língua Estrangeira Moderna", p.languageVariant || "—"],
  ];

  const labelW = 68, valW = CW - labelW;
  infoRows.forEach((row, i) => {
    const rowY = y + i * 8;
    // label cell
    doc.setFillColor(...(i % 2 === 0 ? GREEN_LITE : WHITE));
    doc.rect(ML, rowY, labelW, 8, "F");
    doc.setFillColor(...(i % 2 === 0 ? WHITE : GREEN_LITE));
    doc.rect(ML + labelW, rowY, valW, 8, "F");
    // border
    doc.setDrawColor(200, 230, 200);
    doc.setLineWidth(0.3);
    doc.rect(ML, rowY, CW, 8, "S");
    doc.line(ML + labelW, rowY, ML + labelW, rowY + 8);
    // text
    doc.setFontSize(8); doc.setTextColor(...DARK);
    doc.setFont("helvetica", "bold");
    doc.text(row[0], ML + 2, rowY + 5.5);
    doc.setFont("helvetica", "normal");
    doc.text(row[1], ML + labelW + 3, rowY + 5.5);
  });
  y += infoRows.length * 8 + 6;

  // ── Section 2: Desempenho por disciplina ─────────────────────────────────────
  sectionHeader(doc, ML, y, CW, "INFORMAÇÕES SOBRE O DESEMPENHO DO(A) CANDIDATO(A)");
  y += 7;

  // Build rows
  const subjRows: (string | number)[][] = [];
  let totalCorrect = 0, totalQs = 0;
  const campusTotals = UFPR_CAMPUSES.map(() => 0);
  const campusMaxTotals = UFPR_CAMPUSES.map(() => 0);

  SUBJECTS_ORDER.forEach((subject) => {
    const stats = p.bySubject[subject] || { correct: 0, total: SUBJECT_TOTALS[subject] || 0 };
    const classAvg = p.classAvgCount[subject] ?? 0;
    const row: (string | number)[] = [
      SUBJECT_SHORT[subject] || subject,
      stats.total,
      fmtNum(classAvg, 2),
      stats.correct,
    ];
    UFPR_CAMPUSES.forEach((campus, ci) => {
      const w = getWeight(campus, subject);
      const pts = stats.correct * w;
      const maxPts = stats.total * w;
      row.push(pts);
      campusTotals[ci] += pts;
      campusMaxTotals[ci] += maxPts;
    });
    totalCorrect += stats.correct;
    totalQs += stats.total;
    subjRows.push(row);
  });

  // Total row
  const totalRow: (string | number)[] = ["Pontuação Total de Acertos", "", "", totalCorrect];
  UFPR_CAMPUSES.forEach((_, ci) => totalRow.push(campusTotals[ci]));

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [[
      "Disciplina",
      "Nº Questões",
      "Média Fleming",
      "Seus acertos",
      ...UFPR_CAMPUSES.map(c => `Pontuação\n${c.name}`),
    ]],
    body: subjRows,
    foot: [totalRow],
    theme: "plain",
    styles: { fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, textColor: DARK },
    headStyles: {
      fillColor: GREEN_MID, textColor: WHITE, fontStyle: "bold",
      fontSize: 7.5, halign: "center", valign: "middle",
    },
    footStyles: {
      fillColor: GREEN, textColor: WHITE, fontStyle: "bold",
      fontSize: 8, halign: "center",
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 50 },
      1: { halign: "center", cellWidth: 22 },
      2: { halign: "center", cellWidth: 26 },
      3: { halign: "center", cellWidth: 26, fontStyle: "bold" },
      4: { halign: "center", cellWidth: 31, fillColor: GOLD_LITE },
      5: { halign: "center", cellWidth: 31, fillColor: BLUE_LITE },
    },
    alternateRowStyles: { fillColor: GREEN_LITE },
    didParseCell: (data) => {
      // Highlight Curitiba/Toledo columns in foot
      if (data.section === "foot" && data.column.index >= 4) {
        data.cell.styles.fillColor = GREEN;
      }
      // Highlight weighted cells (>1) in body
      if (data.section === "body" && data.column.index >= 4) {
        const subject = SUBJECTS_ORDER[data.row.index];
        const campus = UFPR_CAMPUSES[data.column.index - 4];
        if (subject && campus && getWeight(campus, subject) > 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = GREEN;
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Section 3: Composição da nota ────────────────────────────────────────────
  sectionHeader(doc, ML, y, CW, "INFORMAÇÕES SOBRE COMPOSIÇÃO DA NOTA DO(A) CANDIDATO(A)");
  y += 7;

  const maxDisc = p.discursiveMax;  // 20
  const discEarned = p.discursiveEarned;
  const essay = p.essayScore;

  const compRows: [string, string, string][] = [
    [
      "Parte objetiva",
      `Pontuação na prova de Conhecimentos Gerais (Curitiba / Toledo)`,
      `${campusTotals[0]} / ${campusTotals[1]}   (máx: ${campusMaxTotals[0]}/${campusMaxTotals[1]})`,
    ],
    [
      "Discursiva (CPT)",
      `Soma das notas das ${maxDisc / 10 === 2 ? "duas" : `${maxDisc / 10}`} questões discursivas (0 a 10 cada)`,
      maxDisc > 0
        ? `${fmtNum(discEarned, 1)}   (máx: ${maxDisc})`
        : "Aguardando correção manual",
    ],
    [
      "Redação",
      "Nota da prova de redação (lançada manualmente)",
      essay != null ? `${fmtNum(essay, 1)}` : "Aguardando lançamento",
    ],
  ];

  // Desempenho final rows per campus — P = (Obj + CPT) / (máx Obj + maxCPT) × 1000
  // Redação é exibida separadamente mas não entra na fórmula P
  UFPR_CAMPUSES.forEach((campus, ci) => {
    const pObj = campusTotals[ci];
    const maxPObj = campusMaxTotals[ci];
    const denominator = maxPObj + maxDisc;
    const desempenho = denominator > 0 ? ((pObj + discEarned) / denominator) * 1000 : 0;
    compRows.push([
      `Desempenho Final — ${campus.name}`,
      `P = (${pObj} + ${fmtNum(discEarned, 1)}) / ${denominator} × 1000`,
      `${fmtNum(desempenho, 3)}   (máx: 1000)`,
    ]);
  });

  const compLabelW = 38, compDescW = CW - compLabelW - 58, compValW = 58;

  compRows.forEach((row, i) => {
    const rowY = y + i * 10;
    const isTotal = row[0].startsWith("Desempenho");
    const bgLabel = isTotal ? GREEN : (i % 2 === 0 ? GREEN_LITE : WHITE);
    const bgDesc  = isTotal ? GREEN : (i % 2 === 0 ? WHITE : GREEN_LITE);
    const bgVal   = isTotal ? GREEN_MID : (i % 2 === 0 ? GREEN_LITE : WHITE);
    const txtColor: [number, number, number] = isTotal ? WHITE : DARK;

    doc.setFillColor(...bgLabel); doc.rect(ML, rowY, compLabelW, 10, "F");
    doc.setFillColor(...bgDesc);  doc.rect(ML + compLabelW, rowY, compDescW, 10, "F");
    doc.setFillColor(...bgVal);   doc.rect(ML + compLabelW + compDescW, rowY, compValW, 10, "F");

    doc.setDrawColor(200, 230, 200); doc.setLineWidth(0.3);
    doc.rect(ML, rowY, CW, 10, "S");
    doc.line(ML + compLabelW, rowY, ML + compLabelW, rowY + 10);
    doc.line(ML + compLabelW + compDescW, rowY, ML + compLabelW + compDescW, rowY + 10);

    doc.setFontSize(7.5); doc.setTextColor(...txtColor);
    doc.setFont("helvetica", "bold");
    doc.text(row[0], ML + 2, rowY + 6.5);
    doc.setFont("helvetica", "normal");
    doc.text(row[1], ML + compLabelW + 2, rowY + 6.5, { maxWidth: compDescW - 4 });
    doc.setFont("helvetica", isTotal ? "bold" : "normal");
    doc.text(row[2], ML + compLabelW + compDescW + compValW / 2, rowY + 6.5, { align: "center" });
  });

  y += compRows.length * 10 + 6;

  // ── Footer notes ──────────────────────────────────────────────────────────────
  const notes = [
    `A pontuação total de acertos foi definida atribuindo peso 2 aos acertos de Biologia e Língua Portuguesa (Curitiba) / Biologia e Química (Toledo); peso 1 às demais.`,
    `A pontuação na prova discursiva é a soma das notas das duas questões (0 a 10 cada questão; máximo 20 pontos).`,
    `O Desempenho Final usa base 1000: P = (Obj + CPT) / (máx Obj + ${maxDisc}) × 1000.`,
  ];

  doc.setFontSize(7); doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  notes.forEach((note, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${note}`, CW);
    doc.text(lines, ML, y);
    y += lines.length * 4 + 1;
  });

  // ── Wrong / blank questions — always rendered, autoTable handles page breaks ──
  if (p.wrongQuestions.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = 12;
    } else {
      y += 4;
    }

    const label = p.wrongQuestions.length === 1
      ? "1 questão para revisar"
      : `${p.wrongQuestions.length} questões para revisar`;
    sectionHeader(doc, ML, y, CW, `QUESTÕES A REVISAR — ${label.toUpperCase()}`);
    y += 7;

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [["Q#", "Disciplina", "Conteúdo / Tópico", "Resposta do aluno", "Gabarito"]],
      body: p.wrongQuestions.map(q => [
        `Q${String(q.number).padStart(2, "0")}`,
        q.subject,
        q.topic || "—",
        q.studentAnswer === "—" || !q.studentAnswer ? "Em branco" : q.studentAnswer,
        q.correctAnswer,
      ]),
      theme: "plain",
      styles: { fontSize: 7.5, cellPadding: 2, textColor: DARK },
      headStyles: { fillColor: GREEN_MID, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 13, halign: "center", fontStyle: "bold" },
        1: { cellWidth: 40 },
        2: { cellWidth: 86 },
        3: { cellWidth: 24, halign: "center", textColor: [200, 50, 50] as [number, number, number], fontStyle: "bold" },
        4: { cellWidth: 23, halign: "center", textColor: GREEN as [number, number, number], fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: GREEN_LITE },
      didDrawPage: (data) => {
        // On continuation pages, print student name as mini-header
        if (data.pageNumber > 1) {
          doc.setFontSize(7); doc.setTextColor(...GRAY); doc.setFont("helvetica", "italic");
          doc.text(
            `${p.studentName} — ${p.templateName} — QUESTÕES A REVISAR (continuação)`,
            ML, 8,
          );
          doc.setFont("helvetica", "normal");
        }
      },
    });
  }

  // ── Page numbers on all pages of this student ─────────────────────────────
  const endPage = doc.getNumberOfPages();
  const totalPages = endPage - startPage + 1;
  for (let pg = startPage; pg <= endPage; pg++) {
    doc.setPage(pg);
    doc.setFontSize(7); doc.setTextColor(...GRAY); doc.setFont("helvetica", "normal");
    doc.text(`Página ${pg - startPage + 1} de ${totalPages}`, PW / 2, 291, { align: "center" });
  }
  doc.setPage(endPage);
}

// ── Section header helper ─────────────────────────────────────────────────────
function sectionHeader(doc: jsPDF, x: number, y: number, w: number, text: string) {
  doc.setFillColor(...GREEN);
  doc.rect(x, y, w, 6.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...WHITE);
  doc.text(text, x + w / 2, y + 4.5, { align: "center" });
}
