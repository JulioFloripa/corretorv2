import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Eye, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StudentSummary } from "@/lib/student-queries";
import PaginationControls from "./PaginationControls";

interface StudentListPaginatedProps {
  students: StudentSummary[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (items: number) => void;
  onSelectStudent: (studentId: string) => void;
}

const StudentListPaginated = ({
  students,
  loading,
  currentPage,
  totalPages,
  itemsPerPage,
  totalItems,
  onPageChange,
  onItemsPerPageChange,
  onSelectStudent,
}: StudentListPaginatedProps) => {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="animate-pulse text-muted-foreground">Carregando alunos...</div>
        </CardContent>
      </Card>
    );
  }

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Nenhum aluno encontrado
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Tente ajustar os filtros de busca
          </p>
        </CardContent>
      </Card>
    );
  }

  const getPerformanceColor = (percentage: number) => {
    if (percentage >= 70) return "text-primary";
    if (percentage >= 50) return "text-accent";
    return "text-destructive";
  };

  const getPerformanceBadgeColor = (percentage: number) => {
    if (percentage >= 70) return "bg-primary";
    if (percentage >= 50) return "bg-accent";
    return "bg-destructive";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lista de Alunos</CardTitle>
        <CardDescription>
          Selecione um aluno para visualizar suas provas e resultados
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matrícula</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-center">Provas</TableHead>
                <TableHead className="text-center">Média</TableHead>
                <TableHead>Última Prova</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.student_id || student.student_name}>
                  <TableCell className="font-mono">
                    {student.student_id || "-"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {student.student_name}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">
                      {student.total_exams}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${getPerformanceBadgeColor(
                          student.avg_percentage
                        )}`}
                      />
                      <span
                        className={`font-bold ${getPerformanceColor(
                          student.avg_percentage
                        )}`}
                      >
                        {student.avg_percentage.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {student.last_exam_date
                      ? new Date(student.last_exam_date).toLocaleDateString("pt-BR")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelectStudent(student.student_name)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          totalItems={totalItems}
          onPageChange={onPageChange}
          onItemsPerPageChange={onItemsPerPageChange}
        />
      </CardContent>
    </Card>
  );
};

export default StudentListPaginated;
