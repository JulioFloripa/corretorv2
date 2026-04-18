import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


interface ExamDetail {
  id: string;
  name: string;
  type: string;
  date: string;
  score: string;
  percentage: number;
}

interface ExamsDetailTableProps {
  exams: ExamDetail[];
}

const ExamsDetailTable = ({ exams }: ExamsDetailTableProps) => {
  const getPerformanceColor = (percentage: number) => {
    if (percentage >= 70) return "text-primary";
    if (percentage >= 50) return "text-accent";
    return "text-destructive";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalhamento por Prova</CardTitle>
        <CardDescription>
          Comparação entre provas consecutivas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prova</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-center">Pontuação</TableHead>
                <TableHead className="text-center">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((exam) => (
                <TableRow key={exam.id}>
                  <TableCell className="font-medium">{exam.name}</TableCell>
                  <TableCell>{exam.type}</TableCell>
                  <TableCell>{exam.date}</TableCell>
                  <TableCell className="text-center">{exam.score}</TableCell>
                  <TableCell className="text-center">
                    <span className={`font-bold ${getPerformanceColor(exam.percentage)}`}>
                      {exam.percentage.toFixed(1)}%
                    </span>
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

export default ExamsDetailTable;
