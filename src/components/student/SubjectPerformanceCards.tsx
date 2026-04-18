import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface SubjectPerformanceCardsProps {
  correctionIds: string[];
  examNames: string[];
}

interface SubjectExamData {
  subject: string;
  examData: { examName: string; percentage: number; correct: number; total: number }[];
}

const COLORS = [
  "hsl(150, 55%, 45%)",  // primary green
  "hsl(200, 60%, 50%)",  // blue
  "hsl(35, 80%, 55%)",   // orange
  "hsl(280, 50%, 55%)",  // purple
  "hsl(350, 65%, 55%)",  // red
  "hsl(170, 50%, 45%)",  // teal
  "hsl(45, 75%, 50%)",   // yellow
  "hsl(220, 55%, 55%)",  // indigo
];

const SubjectPerformanceCards = ({ correctionIds, examNames }: SubjectPerformanceCardsProps) => {
  const [subjectData, setSubjectData] = useState<SubjectExamData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (correctionIds.length === 0) return;
    loadSubjectData();
  }, [correctionIds]);

  const loadSubjectData = async () => {
    setLoading(true);
    try {
      // Fetch all student_answers for these corrections
      const { data: answers, error: aErr } = await supabase
        .from("student_answers")
        .select("correction_id, question_number, is_correct")
        .in("correction_id", correctionIds);

      if (aErr) throw aErr;

      // Fetch template_questions for subjects - need to get template_ids from corrections
      const { data: corrections, error: cErr } = await supabase
        .from("corrections")
        .select("id, template_id")
        .in("id", correctionIds);

      if (cErr) throw cErr;

      const templateIds = [...new Set(corrections?.map(c => c.template_id) || [])];
      
      const { data: questions, error: qErr } = await supabase
        .from("template_questions")
        .select("template_id, question_number, subject")
        .in("template_id", templateIds);

      if (qErr) throw qErr;

      // Build correction -> template map
      const correctionTemplateMap: Record<string, string> = {};
      corrections?.forEach(c => { correctionTemplateMap[c.id] = c.template_id; });

      // Build correction index map (for exam names)
      const correctionIndexMap: Record<string, number> = {};
      correctionIds.forEach((id, i) => { correctionIndexMap[id] = i; });

      // Build template -> question -> subject map
      const questionSubjectMap: Record<string, Record<number, string>> = {};
      questions?.forEach(q => {
        if (!questionSubjectMap[q.template_id]) questionSubjectMap[q.template_id] = {};
        questionSubjectMap[q.template_id][q.question_number] = q.subject || "Sem disciplina";
      });

      // Aggregate: subject -> exam -> { correct, total }
      const subjectMap: Record<string, Record<string, { correct: number; total: number }>> = {};

      answers?.forEach(a => {
        const templateId = correctionTemplateMap[a.correction_id];
        const subject = questionSubjectMap[templateId]?.[a.question_number] || "Sem disciplina";
        const examIdx = correctionIndexMap[a.correction_id];
        const examName = examNames[examIdx] || `Prova ${examIdx + 1}`;

        if (!subjectMap[subject]) subjectMap[subject] = {};
        if (!subjectMap[subject][examName]) subjectMap[subject][examName] = { correct: 0, total: 0 };

        subjectMap[subject][examName].total += 1;
        if (a.is_correct) subjectMap[subject][examName].correct += 1;
      });

      // Convert to array, sorted by subject name
      const result: SubjectExamData[] = Object.entries(subjectMap)
        .filter(([subject]) => subject !== "Sem disciplina" || Object.keys(subjectMap).length === 1)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([subject, exams]) => ({
          subject,
          examData: Object.entries(exams).map(([examName, stats]) => ({
            examName,
            percentage: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
            correct: stats.correct,
            total: stats.total,
          })),
        }));

      setSubjectData(result);
    } catch (error) {
      console.error("Erro ao carregar dados por disciplina:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[120px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (subjectData.length === 0) return null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-background border border-border rounded-lg p-2 shadow-lg text-xs">
          <p className="font-semibold">{d.examName}</p>
          <p className="text-primary font-bold">{d.percentage.toFixed(1)}%</p>
          <p className="text-muted-foreground">{d.correct}/{d.total} acertos</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4" style={{ breakBefore: 'page' }}>
      <h3 className="text-lg font-semibold">Desempenho por Disciplina</h3>
      <div className="subject-cards-grid grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {subjectData.map((subject, sIdx) => (
          <Card key={subject.subject}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium truncate" title={subject.subject}>
                {subject.subject}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={subject.examData} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
                  <XAxis 
                    dataKey="examName" 
                    tick={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                    {subject.examData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-1 mt-1 px-2">
                {subject.examData.map((exam, idx) => (
                  <span 
                    key={idx} 
                    className="text-[10px] text-muted-foreground flex items-center gap-1"
                  >
                    <span 
                      className="inline-block w-2 h-2 rounded-full" 
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    {exam.percentage.toFixed(0)}%
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default SubjectPerformanceCards;
