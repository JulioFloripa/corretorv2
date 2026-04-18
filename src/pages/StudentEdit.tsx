import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FlemingLogo from "@/components/FlemingLogo";
import StudentSearchAdvanced from "@/components/student/StudentSearchAdvanced";
import StudentListPaginated from "@/components/student/StudentListPaginated";
import StudentExamsList from "@/components/student/StudentExamsList";
import ExamAnswersEditor from "@/components/student/ExamAnswersEditor";
import { searchStudents, getExamTypes, getStudentExams, SearchFilters, StudentSummary } from "@/lib/student-queries";

interface StudentExam {
  id: string;
  student_name: string;
  student_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  created_at: string | null;
  essay_score: number | null;
  templates: {
    id: string;
    name: string;
    exam_type: string;
    total_questions: number;
  } | null;
}

interface StudentAnswer {
  id: string;
  question_number: number;
  student_answer: string | null;
  correct_answer: string;
  is_correct: boolean | null;
  points_earned: number | null;
  points: number;
}

const StudentEdit = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Estado da lista de alunos
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [examTypes, setExamTypes] = useState<string[]>([]);

  // Estado do aluno selecionado
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [studentExams, setStudentExams] = useState<StudentExam[]>([]);
  const [selectedExam, setSelectedExam] = useState<StudentExam | null>(null);
  const [examAnswers, setExamAnswers] = useState<StudentAnswer[]>([]);

  useEffect(() => {
    checkAuth();
    loadExamTypes();
  }, []);

  useEffect(() => {
    loadStudents();
  }, [currentPage, itemsPerPage, searchTerm, filters]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const loadExamTypes = async () => {
    const types = await getExamTypes();
    setExamTypes(types);
  };

  const loadStudents = async () => {
    setLoading(true);
    const result = await searchStudents(searchTerm, currentPage, itemsPerPage, filters);
    setStudents(result.students);
    setTotalItems(result.total);
    setLoading(false);
  };

  const handleSearch = (term: string, newFilters?: SearchFilters) => {
    setSearchTerm(term);
    setFilters(newFilters || {});
    setCurrentPage(1); // Reset para primeira página ao buscar
  };

  const handleSelectStudent = async (studentName: string) => {
    setLoading(true);
    setSelectedStudentId(studentName);
    
    const exams = await getStudentExams(studentName);
    setStudentExams(exams as StudentExam[]);
    setLoading(false);

    if (exams.length === 0) {
      toast({
        title: "Nenhuma prova encontrada",
        description: "Este aluno não possui provas cadastradas",
        variant: "destructive",
      });
    }
  };

  const handleEditExam = async (examId: string) => {
    setLoading(true);
    const exam = studentExams.find((e) => e.id === examId);
    if (!exam) return;

    try {
      // Buscar respostas do aluno
      const { data: answersData, error: answersError } = await supabase
        .from("student_answers")
        .select("id, question_number, student_answer, correct_answer, is_correct, points_earned")
        .eq("correction_id", examId)
        .order("question_number", { ascending: true });

      if (answersError) throw answersError;

      // Buscar pontuação de cada questão do template
      const { data: questionsData, error: questionsError } = await supabase
        .from("template_questions")
        .select("question_number, points")
        .eq("template_id", exam.templates?.id)
        .order("question_number", { ascending: true });

      if (questionsError) throw questionsError;

      // Combinar dados
      const pointsMap = new Map(
        questionsData?.map((q) => [q.question_number, q.points]) || []
      );

      const answersWithPoints: StudentAnswer[] = (answersData || []).map((a) => ({
        ...a,
        points: pointsMap.get(a.question_number) || 0,
      }));

      setSelectedExam(exam);
      setExamAnswers(answersWithPoints);
    } catch (error) {
      console.error("Erro ao carregar respostas:", error);
      toast({
        title: "Erro ao carregar",
        description: "Não foi possível carregar as respostas da prova",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToExams = () => {
    setSelectedExam(null);
    setExamAnswers([]);
  };

  const handleBackToList = () => {
    setSelectedStudentId("");
    setStudentExams([]);
    setSelectedExam(null);
    setExamAnswers([]);
  };

  const handleSaveSuccess = async () => {
    // Recarregar lista de provas para atualizar notas
    if (selectedStudentId) {
      const exams = await getStudentExams(selectedStudentId); // selectedStudentId agora é student_name
      setStudentExams(exams as StudentExam[]);
    }
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FlemingLogo size="sm" />
          <h1 className="text-xl font-bold">Editar Respostas de Alunos</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {!selectedStudentId && !selectedExam && (
            <>
              <StudentSearchAdvanced
                onSearch={handleSearch}
                examTypes={examTypes}
                loading={loading}
              />
              
              <StudentListPaginated
                students={students}
                loading={loading}
                currentPage={currentPage}
                totalPages={totalPages}
                itemsPerPage={itemsPerPage}
                totalItems={totalItems}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(items) => {
                  setItemsPerPage(items);
                  setCurrentPage(1);
                }}
                onSelectStudent={handleSelectStudent}
              />
            </>
          )}

          {selectedStudentId && !selectedExam && studentExams.length > 0 && (
            <>
              <Button variant="outline" onClick={handleBackToList}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar para lista
              </Button>
              
              <StudentExamsList
                exams={studentExams}
                studentName={studentExams[0].student_name}
                studentId={studentExams[0].student_id || ""}
                onEditExam={handleEditExam}
              />
            </>
          )}

          {selectedExam && examAnswers.length > 0 && (
            <ExamAnswersEditor
              correctionId={selectedExam.id}
              examName={selectedExam.templates?.name || "Prova"}
              studentName={selectedExam.student_name}
              answers={examAnswers}
              essayScore={selectedExam.essay_score}
              onBack={handleBackToExams}
              onSaveSuccess={handleSaveSuccess}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default StudentEdit;
