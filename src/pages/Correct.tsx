import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, FileText, CheckCircle2, ScanLine, ArrowRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { calculateSummationScore, calculateOpenNumericScore } from "@/lib/ufsc-scoring";

interface NameConflict {
  studentId: string;
  existingName: string;
  newName: string;
  existingStudentDbId: string;
}

const Correct = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  
  // Estados do dialog de progresso
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentStudent, setCurrentStudent] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  
  // Estados para detecção de duplicatas
  const [nameConflicts, setNameConflicts] = useState<NameConflict[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [pendingParsedData, setPendingParsedData] = useState<any[] | null>(null);
  const [conflictChoices, setConflictChoices] = useState<Record<string, "existing" | "new">>({});
  
  // Ref para controlar cancelamento
  const cancelProcessing = useRef(false);

  useEffect(() => {
    checkAuth();
    loadTemplates();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      toast({
        title: "Erro ao carregar gabaritos",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    
    setTemplates(data || []);
  };

  const downloadTemplate = async () => {
    if (!selectedTemplate) return;
    const template = templates.find(t => t.id === selectedTemplate);
    if (!template) return;

    const headers = ["ID", "E-mail", "Nome", "Sede", "Idioma escolhido"];
    for (let i = 1; i <= template.total_questions; i++) {
      headers.push(`Questão ${String(i).padStart(2, '0')}`);
    }
    headers.push("Redação");

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Respostas");
    ws.addRow(headers);
    headers.forEach((h, i) => {
      ws.getColumn(i + 1).width = Math.max(h.length + 2, 12);
    });
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modelo_${template.name.replace(/\s+/g, '_')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_ROWS = 2000;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const isCSV = selectedFile.name.endsWith('.csv');
      const isXLSX = selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls');
      
      if (!isCSV && !isXLSX) {
        toast({
          title: "Formato inválido",
          description: "Por favor, envie um arquivo CSV ou XLSX",
          variant: "destructive",
        });
        return;
      }
      if (selectedFile.size > MAX_FILE_SIZE) {
        toast({
          title: "Arquivo muito grande",
          description: "O tamanho máximo permitido é 10MB",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleCloseDialog = () => {
    setShowProgressDialog(false);
    setIsCompleted(false);
    setProgressPercent(0);
    setCurrentStudent(0);
    setTotalStudents(0);
    cancelProcessing.current = false;
    navigate("/history");
  };

  const handleCancelRequest = () => {
    if (!isCompleted) {
      setShowCancelConfirm(true);
    }
  };

  const handleConfirmCancel = () => {
    console.log('⚠️ Usuário solicitou cancelamento');
    cancelProcessing.current = true;
    setShowCancelConfirm(false);
    setShowProgressDialog(false);
    setProcessing(false);
    setProgressPercent(0);
    setCurrentStudent(0);
    setTotalStudents(0);
    toast({
      title: "Processamento cancelado",
      description: "A correção foi interrompida pelo usuário",
      variant: "default",
    });
  };

  // Detectar conflitos de nomes e resolver antes de processar
  const detectAndResolveConflicts = async (parsedData: any[]): Promise<boolean> => {
    const { data: allStudents } = await supabase
      .from("students")
      .select("id, student_id, name");

    const studentByIdMap = new Map<string, { id: string; name: string }>();
    (allStudents || []).forEach(s => {
      if (s.student_id) studentByIdMap.set(s.student_id, { id: s.id, name: s.name });
    });

    const conflicts: NameConflict[] = [];
    const seen = new Set<string>();

    for (const row of parsedData) {
      const studentName = (row.Nome || row.nome || row.NOME || "").toString().trim();
      const studentId = (row.ID || row.id || row.matricula || row.Matricula || row.MATRICULA || "").toString().trim();
      
      if (!studentId || !studentName || seen.has(studentId)) continue;
      seen.add(studentId);

      const existing = studentByIdMap.get(studentId);
      if (existing && existing.name.toLowerCase() !== studentName.toLowerCase()) {
        conflicts.push({
          studentId,
          existingName: existing.name,
          newName: studentName,
          existingStudentDbId: existing.id,
        });
      }
    }

    if (conflicts.length > 0) {
      setNameConflicts(conflicts);
      // Default: usar o nome novo da planilha
      const defaultChoices: Record<string, "existing" | "new"> = {};
      conflicts.forEach(c => { defaultChoices[c.studentId] = "new"; });
      setConflictChoices(defaultChoices);
      setShowConflictDialog(true);
      setPendingParsedData(parsedData);
      return false; // não continuar processamento ainda
    }

    return true; // sem conflitos, pode continuar
  };

  const applyConflictResolutions = async () => {
    // Aplicar as escolhas do usuário: atualizar nome do aluno e das correções
    for (const conflict of nameConflicts) {
      const chosenName = conflictChoices[conflict.studentId] === "new" 
        ? conflict.newName 
        : conflict.existingName;

      // Atualizar nome na tabela students
      await supabase.from("students")
        .update({ name: chosenName })
        .eq("id", conflict.existingStudentDbId);

      // Atualizar nome em todas as correções com essa matrícula
      await supabase.from("corrections")
        .update({ student_name: chosenName })
        .eq("student_id", conflict.studentId);
    }

    setShowConflictDialog(false);
    
    // Continuar com o processamento
    if (pendingParsedData) {
      await startProcessing(pendingParsedData);
      setPendingParsedData(null);
    }
  };

  const processCorrection = async () => {
    if (!selectedTemplate || !file) {
      toast({
        title: "Dados incompletos",
        description: "Selecione um gabarito e envie um arquivo",
        variant: "destructive",
      });
      return;
    }

    try {
      // Detectar tipo de arquivo e parsear
      const isXLSX = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      
      const cellToString = (val: any): string => {
        if (val == null) return "";
        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return String(val);
        if (typeof val === "object") {
          if (val.richText && Array.isArray(val.richText)) return val.richText.map((rt: any) => rt.text || "").join("");
          if (val.text != null) return String(val.text);
          if (val.result != null) return String(val.result);
        }
        return String(val);
      };

      const parseFile = async (): Promise<any[]> => {
        if (isXLSX) {
          const buffer = await file.arrayBuffer();
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(buffer);
          const sheet = wb.worksheets[0];
          if (!sheet || sheet.rowCount < 2) return [];
          const headers = (sheet.getRow(1).values as any[]).slice(1).map(cellToString);
          const rows: any[] = [];
          sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const obj: any = {};
            (row.values as any[]).slice(1).forEach((val, i) => { obj[headers[i]] = cellToString(val); });
            rows.push(obj);
          });
          return rows;
        } else {
          return new Promise((resolve, reject) => {
            Papa.parse(file, {
              header: true, skipEmptyLines: true,
              complete: (results) => resolve(results.data as any[]),
              error: (error) => reject(error),
            });
          });
        }
      };

      const parsedData = await parseFile();

      if (!Array.isArray(parsedData) || parsedData.length === 0) {
        throw new Error("Arquivo vazio ou formato inválido");
      }
      if (parsedData.length > MAX_ROWS) {
        throw new Error(`Máximo de ${MAX_ROWS} registros por arquivo. O arquivo contém ${parsedData.length} registros.`);
      }

      // Verificar conflitos de nomes antes de processar
      const canProceed = await detectAndResolveConflicts(parsedData);
      if (!canProceed) return; // Dialog de conflitos aberto, processamento será retomado após resolução

      await startProcessing(parsedData);
    } catch (error: any) {
      toast({
        title: "Erro ao processar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const startProcessing = async (parsedData: any[]) => {
    setProcessing(true);
    setShowProgressDialog(true);
    setIsCompleted(false);
    setProgressPercent(0);
    cancelProcessing.current = false;

    try {
      const { data: questions, error: questionsError } = await supabase
        .from("template_questions")
        .select("*")
        .eq("template_id", selectedTemplate)
        .order("question_number");

      if (questionsError) throw questionsError;

      // Função para processar dados
      const processData = async (data: any[]) => {
        console.log('🚀 Iniciando processamento de', data.length, 'alunos');
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id ?? "";
        setTotalStudents(data.length);
        
        // Pré-carregar correções existentes para este template de uma só vez
        const { data: allExistingCorrections } = await supabase
          .from("corrections")
          .select("id, student_name")
          .eq("template_id", selectedTemplate)
          .eq("user_id", userId);
        
        const correctionMap = new Map<string, string>();
        (allExistingCorrections || []).forEach(c => correctionMap.set(c.student_name, c.id));

        // Pré-carregar alunos existentes (agora busca todos, não apenas do user)
        const { data: allExistingStudents } = await supabase
          .from("students")
          .select("id, student_id, name");
        
        const studentByIdMap = new Map<string, string>();
        const studentByNameMap = new Map<string, string>();
        (allExistingStudents || []).forEach(s => {
          if (s.student_id) studentByIdMap.set(s.student_id, s.id);
          else studentByNameMap.set(s.name, s.id);
        });

        const BATCH_SIZE = 10;
        let processedCount = 0;
        let errorCount = 0;
        
        for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
          if (cancelProcessing.current) {
            console.log('❌ Processamento cancelado pelo usuário');
            break;
          }

          const batch = data.slice(batchStart, Math.min(batchStart + BATCH_SIZE, data.length));
          
          const batchPromises = batch.map(async (row, batchIdx) => {
            const index = batchStart + batchIdx;
            try {
              let studentName = (row.Nome || row.nome || row.NOME || "").toString().trim();
              const studentId = (row.ID || row.id || row.matricula || row.Matricula || row.MATRICULA || "").toString().trim();
              const studentCampus = (row.Sede || row.sede || row.SEDE || "").toString().trim() || null;
              const studentLanguage = (row["Idioma escolhido"] || row["idioma escolhido"] || row["Lingua estrangeira"] || row["lingua estrangeira"] || "").toString().trim() || null;
              
              if (!studentName || studentName.length > 255) return;
              if (studentId && studentId.length > 100) return;

              // Se houve resolução de conflito, usar o nome escolhido
              if (studentId && conflictChoices[studentId]) {
                const conflict = nameConflicts.find(c => c.studentId === studentId);
                if (conflict) {
                  studentName = conflictChoices[studentId] === "new" ? conflict.newName : conflict.existingName;
                }
              }

              // Registrar/atualizar aluno na tabela students (student_id como chave global)
              if (studentId) {
                if (studentByIdMap.has(studentId)) {
                  const updateData: any = { name: studentName };
                  if (studentCampus) updateData.campus = studentCampus;
                  if (studentLanguage) updateData.foreign_language = studentLanguage;
                  await supabase.from("students").update(updateData)
                    .eq("id", studentByIdMap.get(studentId)!);
                } else {
                  const { data: inserted } = await supabase.from("students").insert({
                    user_id: userId, name: studentName, student_id: studentId,
                    campus: studentCampus, foreign_language: studentLanguage,
                  }).select("id").single();
                  studentByIdMap.set(studentId, inserted?.id || "inserted");
                }
              } else if (!studentByNameMap.has(studentName)) {
                const { data: inserted } = await supabase.from("students").insert({
                  user_id: userId, name: studentName,
                  campus: studentCampus, foreign_language: studentLanguage,
                }).select("id").single();
                studentByNameMap.set(studentName, inserted?.id || "inserted");
              }

              // Correção: verificar existente via mapa pré-carregado
              let correctionId: string;
              const existingCorrectionId = correctionMap.get(studentName);

              if (existingCorrectionId) {
                correctionId = existingCorrectionId;
                await Promise.all([
                  supabase.from("corrections")
                    .update({ status: "processing", student_id: studentId?.toString() })
                    .eq("id", correctionId),
                  supabase.from("student_answers")
                    .delete()
                    .eq("correction_id", correctionId),
                ]);
              } else {
                const { data: correction, error: correctionError } = await supabase
                  .from("corrections")
                  .insert({
                    user_id: userId,
                    template_id: selectedTemplate,
                    student_name: studentName,
                    student_id: studentId?.toString(),
                    status: "processing",
                  })
                  .select("id")
                  .single();

                if (correctionError) throw correctionError;
                correctionId = correction.id;
                correctionMap.set(studentName, correctionId);
              }

              // Processar todas as respostas e inserir em lote
              let totalScore = 0;
              let maxScore = 0;
              const answersToInsert: any[] = [];

              const studentLang = studentLanguage || "Inglês";
              const filteredQuestions = (questions || []).filter(q => {
                const variant = (q as any).language_variant;
                if (!variant) return true;
                return variant === studentLang;
              });

              for (const question of filteredQuestions) {
                const qNum = question.question_number;
                const paddedNum = String(qNum).padStart(2, '0');
                const rawAnswer = row[`Questão ${paddedNum}`] || row[`questão ${paddedNum}`] || row[`q${qNum}`] || row[`Q${qNum}`];
                const studentAnswer = rawAnswer?.toString().trim().substring(0, 50) || null;
                
                const questionType = (question as any).question_type || "objective";
                const numPropositions = (question as any).num_propositions || 5;
                let isCorrect = false;
                let pointsEarned = 0;

                if (questionType === "summation") {
                  const studentSum = parseInt(studentAnswer || "0") || 0;
                  const correctSum = parseInt(question.correct_answer || "0") || 0;
                  const result = calculateSummationScore(studentSum, correctSum, numPropositions, Number(question.points));
                  pointsEarned = result.score;
                  isCorrect = pointsEarned > 0;
                  maxScore += result.maxScore;
                } else if (questionType === "open_numeric") {
                  const studentNum = studentAnswer != null ? parseInt(studentAnswer) : null;
                  const correctNum = parseInt(question.correct_answer || "0") || 0;
                  const result = calculateOpenNumericScore(studentNum, correctNum, Number(question.points));
                  pointsEarned = result.score;
                  isCorrect = result.isCorrect;
                  maxScore += result.maxScore;
                } else if (questionType === "discursive") {
                  const discScore = studentAnswer != null ? parseFloat(studentAnswer.replace(",", ".")) : 0;
                  pointsEarned = isNaN(discScore) ? 0 : Math.min(5, Math.max(0, discScore));
                  isCorrect = pointsEarned > 0;
                  maxScore += question.points ?? 5;
                } else {
                  isCorrect = studentAnswer?.toUpperCase() === question.correct_answer.toUpperCase();
                  pointsEarned = isCorrect ? Number(question.points) : 0;
                  maxScore += Number(question.points);
                }

                totalScore += pointsEarned;

                answersToInsert.push({
                  correction_id: correctionId,
                  question_number: question.question_number,
                  student_answer: studentAnswer,
                  correct_answer: question.correct_answer,
                  is_correct: isCorrect,
                  points_earned: pointsEarned,
                });
              }

              const { error: answerError } = await supabase.from("student_answers").insert(answersToInsert);
              if (answerError) throw answerError;

              const rawEssay = row["Redação"] || row["Redacao"] || row["redação"] || row["redacao"] || row["REDAÇÃO"] || row["REDACAO"];
              const essayScore = rawEssay != null && rawEssay !== "" ? Math.min(10, Math.max(0, parseFloat(String(rawEssay).replace(",", ".")))) : null;

              const { error: finalError } = await supabase
                .from("corrections")
                .update({
                  total_score: totalScore,
                  max_score: maxScore,
                  percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
                  status: "completed",
                  essay_score: isNaN(essayScore as number) ? null : essayScore,
                })
                .eq("id", correctionId);

              if (finalError) throw finalError;
              processedCount++;
            } catch (error: any) {
              errorCount++;
              console.error(`❌ Erro ao processar aluno ${index + 1}:`, error);
            }
          });

          await Promise.all(batchPromises);
          
          const processed = Math.min(batchStart + BATCH_SIZE, data.length);
          setCurrentStudent(processed);
          setProgressPercent(Math.round((processed / data.length) * 100));
        }

        console.log(`🎉 Processamento concluído! ${processedCount} alunos processados, ${errorCount} erros`);
        setIsCompleted(true);
      };

      await processData(parsedData);
    } catch (error: any) {
      setShowProgressDialog(false);
      toast({
        title: "Erro ao processar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">Corrigir Prova</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Tabs defaultValue="csv" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="csv" className="gap-2">
                <FileText className="h-4 w-4" />
                Importar Planilha
              </TabsTrigger>
              <TabsTrigger value="omr" className="gap-2">
                <ScanLine className="h-4 w-4" />
                Escanear Gabarito
              </TabsTrigger>
            </TabsList>

            {/* ABA 1: IMPORTAR PLANILHA (lógica original preservada) */}
            <TabsContent value="csv" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Importar Planilha de Respostas</CardTitle>
                  <CardDescription>
                    Envie um arquivo CSV ou Excel com as respostas dos alunos para correção automática
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Gabarito</Label>
                    <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o gabarito" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name} ({template.total_questions} questões)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTemplate && (
                      <Button variant="outline" size="sm" onClick={downloadTemplate} className="mt-2">
                        <FileText className="h-4 w-4 mr-1" />
                        Baixar modelo Excel
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Arquivo de Respostas</Label>
                    <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                      <Input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileChange}
                        className="hidden"
                        id="csv-upload"
                      />
                      <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center gap-2">
                        {file ? (
                          <>
                            <FileText className="h-12 w-12 text-primary" />
                            <p className="font-medium">{file.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Clique para trocar o arquivo
                            </p>
                          </>
                        ) : (
                          <>
                            <Upload className="h-12 w-12 text-muted-foreground" />
                            <p className="font-medium">Clique para enviar CSV ou Excel</p>
                            <p className="text-sm text-muted-foreground">
                              Formato: CSV/XLSX com colunas nome, matricula, q1, q2, q3...
                            </p>
                          </>
                        )}
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={processCorrection}
                      disabled={!selectedTemplate || !file || processing}
                      className="flex-1"
                    >
                      {processing ? "Processando..." : "Corrigir Provas"}
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/templates")}>
                      Gerenciar Gabaritos
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA 2: ESCANEAR GABARITO (entrada para o fluxo OMR) */}
            <TabsContent value="omr" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Escanear Gabarito (Leitura Óptica)</CardTitle>
                  <CardDescription>
                    Envie imagens dos gabaritos digitalizados. O sistema identifica o aluno pelo QR Code
                    impresso na folha e detecta as marcações automaticamente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Prova</Label>
                    <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a prova" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name} ({template.total_questions} questões)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                      onClick={() => selectedTemplate && navigate(`/omr/upload/${selectedTemplate}`)}
                      disabled={!selectedTemplate}
                      className="h-auto py-4 flex flex-col items-start gap-1"
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <Upload className="h-4 w-4" />
                        Enviar imagens para leitura
                      </div>
                      <span className="text-xs opacity-90 font-normal">
                        Faça upload das folhas escaneadas
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => selectedTemplate && navigate(`/omr/review/${selectedTemplate}`)}
                      disabled={!selectedTemplate}
                      className="h-auto py-4 flex flex-col items-start gap-1"
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <CheckCircle2 className="h-4 w-4" />
                        Revisar leituras pendentes
                      </div>
                      <span className="text-xs opacity-90 font-normal">
                        Valide respostas detectadas
                      </span>
                    </Button>
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Precisa gerar folhas com QR Code, matricular alunos ou ver todos os passos?{" "}
                    <Button
                      variant="link"
                      className="h-auto p-0 text-sm"
                      onClick={() => navigate(selectedTemplate ? `/omr` : `/omr`)}
                    >
                      Abrir fluxo OMR completo
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Dialog de Progresso e Conclusão */}
      <Dialog open={showProgressDialog} onOpenChange={(open) => !open && handleCancelRequest()}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => { e.preventDefault(); handleCancelRequest(); }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isCompleted ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Processo Concluído
                </>
              ) : (
                "Processando Correções"
              )}
            </DialogTitle>
            <DialogDescription>
              {isCompleted ? (
                `${totalStudents} ${totalStudents === 1 ? 'estudante foi encontrado' : 'estudantes foram encontrados'} e corrigido${totalStudents === 1 ? '' : 's'} com sucesso!`
              ) : (
                `Processando aluno ${currentStudent} de ${totalStudents}...`
              )}
            </DialogDescription>
          </DialogHeader>

          {!isCompleted && (
            <div className="space-y-4 py-4">
              <Progress value={progressPercent} className="w-full" />
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{progressPercent}%</p>
                <p className="text-sm text-muted-foreground">
                  Aguarde enquanto processamos as correções...
                </p>
              </div>
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" onClick={handleCancelRequest}>
                  Cancelar Processamento
                </Button>
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="py-6 text-center">
              <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">
                Todas as provas foram corrigidas!
              </p>
              <p className="text-sm text-muted-foreground">
                Você pode visualizar os resultados no histórico de correções.
              </p>
            </div>
          )}

          {isCompleted && (
            <DialogFooter>
              <Button onClick={handleCloseDialog} className="w-full">
                OK
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* AlertDialog de Confirmação de Cancelamento */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar processamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar o processamento? As correções já realizadas serão mantidas, mas o restante não será processado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar processando</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Conflitos de Nomes */}
      <Dialog open={showConflictDialog} onOpenChange={(open) => {
        if (!open) {
          setShowConflictDialog(false);
          setPendingParsedData(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              ⚠️ Alunos com nomes diferentes
            </DialogTitle>
            <DialogDescription>
              Foram encontrados alunos com a mesma matrícula mas nomes diferentes. 
              Escolha qual nome manter para cada caso:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {nameConflicts.map((conflict) => (
              <div key={conflict.studentId} className="border rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium">
                  Matrícula: <span className="font-mono text-primary">{conflict.studentId}</span>
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-2 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
                    <input
                      type="radio"
                      name={`conflict-${conflict.studentId}`}
                      checked={conflictChoices[conflict.studentId] === "existing"}
                      onChange={() => setConflictChoices(prev => ({ ...prev, [conflict.studentId]: "existing" }))}
                      className="accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium">Manter nome atual</p>
                      <p className="text-sm text-muted-foreground">{conflict.existingName}</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-2 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
                    <input
                      type="radio"
                      name={`conflict-${conflict.studentId}`}
                      checked={conflictChoices[conflict.studentId] === "new"}
                      onChange={() => setConflictChoices(prev => ({ ...prev, [conflict.studentId]: "new" }))}
                      className="accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium">Usar nome da planilha</p>
                      <p className="text-sm text-muted-foreground">{conflict.newName}</p>
                    </div>
                  </label>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowConflictDialog(false); setPendingParsedData(null); }}>
              Cancelar
            </Button>
            <Button onClick={applyConflictResolutions}>
              Confirmar e Processar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Correct;
