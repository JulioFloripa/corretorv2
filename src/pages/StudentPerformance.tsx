import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FlemingLogo from "@/components/FlemingLogo";
import flemingLogo from "@/assets/fleming-logo.png";
import StudentSearchAdvanced from "@/components/student/StudentSearchAdvanced";
import StudentListPaginated from "@/components/student/StudentListPaginated";
import PerformanceOverview from "@/components/student/PerformanceOverview";
import PerformanceChart from "@/components/student/PerformanceChart";
import ExamsDetailTable from "@/components/student/ExamsDetailTable";
import SubjectPerformanceCards from "@/components/student/SubjectPerformanceCards";
import PrintPerformanceButton from "@/components/student/PrintPerformanceButton";
import {
  calculatePerformanceStats,
  prepareChartData,
  prepareTableData,
} from "@/lib/performance-stats";
import { searchStudents, getExamTypes, SearchFilters, StudentSummary } from "@/lib/student-queries";

interface StudentExam {
  id: string;
  student_name: string;
  student_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number;
  created_at: string;
  templates: {
    id: string;
    name: string;
    exam_type: string;
    total_questions: number;
  } | null;
}

const StudentPerformance = () => {
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
  const [studentName, setStudentName] = useState("");

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

    try {
      const { data, error } = await supabase
        .from("corrections")
        .select(`
          id,
          student_name,
          student_id,
          total_score,
          max_score,
          percentage,
          created_at,
          templates (
            id,
            name,
            exam_type,
            total_questions
          )
        `)
        .eq("student_name", studentName)
        .eq("status", "completed")
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          title: "Aluno não encontrado",
          description: `Nenhuma prova encontrada para este aluno`,
          variant: "destructive",
        });
        setStudentExams([]);
        setStudentName("");
      } else {
        // Filtrar apenas provas com percentual válido
        const validExams = data.filter((e) => e.percentage != null) as StudentExam[];
        
        if (validExams.length === 0) {
          toast({
            title: "Dados insuficientes",
            description: "Não há provas com notas válidas para análise",
            variant: "destructive",
          });
          setStudentExams([]);
          setStudentName("");
        } else {
          setStudentExams(validExams);
          setStudentName(validExams[0].student_name);
        }
      }
    } catch (error) {
      console.error("Erro ao buscar aluno:", error);
      toast({
        title: "Erro na busca",
        description: "Não foi possível buscar os dados do aluno",
        variant: "destructive",
      });
      setStudentExams([]);
      setStudentName("");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToList = () => {
    setSelectedStudentId("");
    setStudentExams([]);
    setStudentName("");
  };

  const stats = calculatePerformanceStats(studentExams);
  const chartData = prepareChartData(studentExams);
  const tableData = prepareTableData(studentExams);
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FlemingLogo size="sm" />
          <h1 className="text-xl font-bold">Análise de Desempenho</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {!selectedStudentId && (
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

          {selectedStudentId && studentExams.length > 0 && (
            <>
              <div className="flex gap-2 print:hidden">
                <Button variant="outline" onClick={handleBackToList}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar para lista
                </Button>
                <PrintPerformanceButton />
              </div>

              <div id="print-area">
                {/* Print-only header with Fleming branding */}
                <div className="print-header hidden items-center gap-3 mb-4 pb-3 border-b-2 border-primary">
                  <img src={flemingLogo} alt="Fleming" className="h-10 w-auto" />
                  <div>
                    <h2 className="text-xl font-bold text-primary">Fleming Medicina</h2>
                    <p className="text-xs text-muted-foreground">
                      Relatório de Desempenho — {studentName} — {new Date().toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>

                <PerformanceOverview stats={stats} studentName={studentName} />

                <div className="charts-grid grid gap-6 lg:grid-cols-2 mt-6">
                  <PerformanceChart data={chartData} type="bar" />
                  <PerformanceChart data={chartData} type="line" />
                </div>

                <div className="mt-6">
                  <SubjectPerformanceCards
                    correctionIds={studentExams.map(e => e.id)}
                    examNames={studentExams.map((e, i) => e.templates?.name || `Prova ${i + 1}`)}
                  />
                </div>

                <div className="mt-6">
                  <ExamsDetailTable exams={tableData} />
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default StudentPerformance;
