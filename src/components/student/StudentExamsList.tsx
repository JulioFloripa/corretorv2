import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StudentExam {
  id: string;
  student_name: string;
  student_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  created_at: string | null;
  templates: {
    id: string;
    name: string;
    exam_type: string;
    total_questions: number;
  } | null;
}

interface StudentExamsListProps {
  exams: StudentExam[];
  studentName: string;
  studentId: string;
  onEditExam: (examId: string) => void;
}

const StudentExamsList = ({ exams, studentName, studentId, onEditExam }: StudentExamsListProps) => {
  if (exams.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Nenhuma prova encontrada para este aluno
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provas de {studentName}</CardTitle>
        <CardDescription>
          Matrícula: {studentId} • {exams.length} prova(s) realizada(s)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prova</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-center">Nota</TableHead>
              <TableHead className="text-center">%</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exams.map((exam) => (
              <TableRow key={exam.id}>
                <TableCell className="font-medium">
                  {exam.templates?.name || "-"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {exam.templates?.exam_type || "-"}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {exam.total_score != null && exam.max_score != null
                    ? `${exam.total_score}/${exam.max_score}`
                    : "-"}
                </TableCell>
                <TableCell className="text-center font-bold">
                  {exam.percentage != null
                    ? `${Number(exam.percentage).toFixed(1)}%`
                    : "-"}
                </TableCell>
                <TableCell>
                  {exam.created_at
                    ? new Date(exam.created_at).toLocaleDateString("pt-BR")
                    : "-"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEditExam(exam.id)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default StudentExamsList;
