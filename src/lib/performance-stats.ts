interface ExamData {
  percentage: number;
  created_at: string;
}

export interface PerformanceStats {
  totalExams: number;
  averagePercentage: number;
  bestScore: number;
  worstScore: number;
  trend: number;
  improvementRate: number;
}

/**
 * Calcula estatísticas de desempenho a partir de uma lista de provas
 */
export const calculatePerformanceStats = (exams: ExamData[]): PerformanceStats => {
  if (exams.length === 0) {
    return {
      totalExams: 0,
      averagePercentage: 0,
      bestScore: 0,
      worstScore: 0,
      trend: 0,
      improvementRate: 0,
    };
  }

  const percentages = exams
    .map((e) => e.percentage)
    .filter((p) => p != null && !isNaN(p));

  if (percentages.length === 0) {
    return {
      totalExams: exams.length,
      averagePercentage: 0,
      bestScore: 0,
      worstScore: 0,
      trend: 0,
      improvementRate: 0,
    };
  }

  const totalExams = exams.length;
  const averagePercentage =
    percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
  const bestScore = Math.max(...percentages);
  const worstScore = Math.min(...percentages);
  const trend = calculateTrend(percentages);
  const improvementRate = calculateImprovementRate(percentages);

  return {
    totalExams,
    averagePercentage,
    bestScore,
    worstScore,
    trend,
    improvementRate,
  };
};

/**
 * Calcula a tendência comparando as últimas 3 provas com as primeiras 3
 */
const calculateTrend = (percentages: number[]): number => {
  if (percentages.length < 3) {
    // Se tem menos de 3 provas, compara a última com a primeira
    if (percentages.length === 2) {
      return percentages[1] - percentages[0];
    }
    return 0;
  }

  const firstThree = percentages.slice(0, 3);
  const lastThree = percentages.slice(-3);

  const avgFirst = firstThree.reduce((a, b) => a + b, 0) / firstThree.length;
  const avgLast = lastThree.reduce((a, b) => a + b, 0) / lastThree.length;

  return avgLast - avgFirst;
};

/**
 * Calcula a taxa de melhoria usando regressão linear simples
 */
const calculateImprovementRate = (percentages: number[]): number => {
  if (percentages.length < 2) return 0;

  const n = percentages.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const x = i + 1; // Índice da prova (1, 2, 3, ...)
    const y = percentages[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  // Coeficiente angular da regressão linear (slope)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Retorna o slope como taxa de melhoria por prova
  return slope;
};

/**
 * Prepara dados para gráficos
 */
export const prepareChartData = (
  exams: Array<{
    templates: { name: string } | null;
    percentage: number;
    created_at: string;
  }>
) => {
  return exams.map((exam, index) => ({
    name: exam.templates?.name || `Prova ${index + 1}`,
    nota: exam.percentage || 0,
    data: new Date(exam.created_at).toLocaleDateString("pt-BR"),
    index: index + 1,
  }));
};

/**
 * Prepara dados para tabela detalhada
 */
export const prepareTableData = (
  exams: Array<{
    id: string;
    templates: { name: string; exam_type: string } | null;
    total_score: number | null;
    max_score: number | null;
    percentage: number;
    created_at: string;
  }>
) => {
  return exams.map((exam) => ({
    id: exam.id,
    name: exam.templates?.name || "Prova sem nome",
    type: exam.templates?.exam_type || "-",
    date: new Date(exam.created_at).toLocaleDateString("pt-BR"),
    score:
      exam.total_score != null && exam.max_score != null
        ? `${exam.total_score}/${exam.max_score}`
        : "-",
    percentage: exam.percentage || 0,
  }));
};
