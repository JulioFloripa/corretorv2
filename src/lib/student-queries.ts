import { supabase } from "@/integrations/supabase/client";

export interface StudentSummary {
  student_id: string;
  student_name: string;
  total_exams: number;
  last_exam_date: string;
  avg_percentage: number;
}

export interface SearchFilters {
  examType?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Busca alunos únicos com informações agregadas
 */
export const searchStudents = async (
  searchTerm: string = "",
  page: number = 1,
  itemsPerPage: number = 20,
  filters?: SearchFilters
): Promise<{ students: StudentSummary[]; total: number }> => {
  try {
    console.log('🔍 Buscando alunos com:', { searchTerm, page, itemsPerPage, filters });
    
    const offset = (page - 1) * itemsPerPage;
    
    // Primeiro, buscar todas as correções do usuário atual
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('❌ Usuário não autenticado');
      return { students: [], total: 0 };
    }

    // Construir query base - buscar todas as correções do usuário
    let query = supabase
      .from("corrections")
      .select(`
        student_id,
        student_name,
        percentage,
        created_at,
        template_id,
        templates!inner (
          name,
          exam_type
        )
      `, { count: "exact" })
      .eq("user_id", user.id)
      .eq("status", "completed");

    // Aplicar filtro de busca universal
    if (searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(
        `student_name.ilike.${term},student_id.ilike.${term}`
      );
    }

    // Aplicar filtros adicionais
    if (filters?.dateFrom) {
      query = query.gte("created_at", filters.dateFrom);
    }

    if (filters?.dateTo) {
      query = query.lte("created_at", filters.dateTo);
    }

    // Executar query
    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Erro na query:', error);
      throw error;
    }

    console.log('📊 Correções encontradas:', data?.length || 0);

    // Filtrar por tipo de prova se necessário (após busca, pois templates é relacionamento)
    let filteredData = data || [];
    if (filters?.examType) {
      filteredData = filteredData.filter(
        (correction: any) => correction.templates?.exam_type === filters.examType
      );
    }

    // Agrupar por aluno e calcular estatísticas
    const studentMap = new Map<string, {
      student_id: string;
      student_name: string;
      exams: { percentage: number; date: string }[];
    }>();

    filteredData.forEach((correction: any) => {
      // Usar student_name como chave principal (mais confiável que student_id que pode estar vazio)
      const key = correction.student_name;
      
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          student_id: correction.student_id || "",
          student_name: correction.student_name,
          exams: [],
        });
      }

      studentMap.get(key)!.exams.push({
        percentage: correction.percentage || 0,
        date: correction.created_at,
      });
    });

    console.log('👥 Alunos únicos encontrados:', studentMap.size);

    // Converter para array e calcular estatísticas
    const students: StudentSummary[] = Array.from(studentMap.values()).map((student) => {
      const sortedExams = student.exams.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      const avgPercentage =
        student.exams.reduce((sum, exam) => sum + exam.percentage, 0) /
        student.exams.length;

      return {
        student_id: student.student_id,
        student_name: student.student_name,
        total_exams: student.exams.length,
        last_exam_date: sortedExams[0]?.date || "",
        avg_percentage: avgPercentage,
      };
    });

    // Ordenar por nome
    students.sort((a, b) => a.student_name.localeCompare(b.student_name));

    // Aplicar paginação
    const paginatedStudents = students.slice(offset, offset + itemsPerPage);

    console.log('✅ Retornando', paginatedStudents.length, 'alunos de', students.length, 'total');

    return {
      students: paginatedStudents,
      total: students.length,
    };
  } catch (error) {
    console.error("❌ Erro ao buscar alunos:", error);
    return { students: [], total: 0 };
  }
};

/**
 * Busca todos os tipos de prova disponíveis
 */
export const getExamTypes = async (): Promise<string[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return [];

    const { data, error } = await supabase
      .from("templates")
      .select("exam_type")
      .eq("user_id", user.id)
      .order("exam_type");

    if (error) throw error;

    // Retornar tipos únicos
    const types = Array.from(
      new Set((data || []).map((t) => t.exam_type).filter(Boolean))
    );

    return types;
  } catch (error) {
    console.error("Erro ao buscar tipos de prova:", error);
    return [];
  }
};

/**
 * Busca provas de um aluno específico por nome
 */
export const getStudentExams = async (studentName: string) => {
  try {
    console.log('🔍 Buscando provas do aluno:', studentName);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('❌ Usuário não autenticado');
      return [];
    }

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
        essay_score,
        template_id,
        templates (
          id,
          name,
          exam_type,
          total_questions
        )
      `)
      .eq("user_id", user.id)
      .eq("student_name", studentName)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar provas:', error);
      throw error;
    }

    console.log('📊 Provas encontradas:', data?.length || 0);

    return data || [];
  } catch (error) {
    console.error("❌ Erro ao buscar provas do aluno:", error);
    return [];
  }
};
