import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Clock, Trash2, RefreshCw, UserPlus, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import FlemingLogo from "@/components/FlemingLogo";
import { recalculateByTemplate } from "@/lib/recalculate";
import AddStudentToExamDialog from "@/components/student/AddStudentToExamDialog";

interface CorrectionWithTemplate {
  id: string;
  student_name: string;
  student_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  status: string;
  created_at: string | null;
  template_id: string;
  templates: {
    name: string;
    exam_type: string;
    total_questions: number;
  } | null;
}

const History = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [corrections, setCorrections] = useState<CorrectionWithTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState<string | null>(null);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [selectedRecalcTemplate, setSelectedRecalcTemplate] = useState<string>("");
  const [allTemplates, setAllTemplates] = useState<{ id: string; name: string; exam_type: string; total_questions: number }[]>([]);

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  const checkAuthAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    await Promise.all([loadCorrections(), loadTemplates()]);
  };

  const loadTemplates = async () => {
    const { data } = await supabase
      .from("templates")
      .select("id, name, exam_type, total_questions")
      .order("name");
    setAllTemplates(data || []);
  };

  const loadCorrections = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("corrections")
      .select("*, templates(name, exam_type, total_questions)")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar histórico", variant: "destructive" });
    }
    setCorrections((data as any) || []);
    setLoading(false);
  };

  const deleteCorrection = async (id: string) => {
    // Delete student answers first, then the correction
    await supabase.from("student_answers").delete().eq("correction_id", id);
    const { error } = await supabase.from("corrections").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
      return;
    }
    toast({ title: "Correção excluída!" });
    setCorrections(prev => prev.filter(c => c.id !== id));
  };

  const handleRecalculate = async (templateId: string, templateName: string) => {
    setRecalculating(templateId);
    const result = await recalculateByTemplate(templateId);
    setRecalculating(null);

    if (result.success) {
      toast({ title: `${result.correctionsUpdated} correção(ões) de "${templateName}" recalculada(s)!` });
      await loadCorrections();
    } else {
      toast({ variant: "destructive", title: "Erro ao recalcular", description: result.error });
    }
  };

  // Get unique templates from corrections
  const uniqueTemplates = corrections.reduce((acc, c) => {
    if (!acc.find(t => t.id === c.template_id)) {
      acc.push({ id: c.template_id, name: c.templates?.name || "-" });
    }
    return acc;
  }, [] as { id: string; name: string }[]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FlemingLogo size="sm" />
          <h1 className="text-xl font-bold flex-1">Histórico de Correções</h1>
          <Button size="sm" onClick={() => setShowAddStudent(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Adicionar Aluno à Prova
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Carregando...</p>
              </CardContent>
            </Card>
          ) : corrections.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Correções Realizadas</CardTitle>
                <CardDescription>Histórico de todas as correções do sistema</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center mb-4">
                  Nenhuma correção realizada ainda
                </p>
                <Button onClick={() => navigate("/correct")}>
                  Corrigir Primeira Prova
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle>Correções Realizadas ({corrections.length})</CardTitle>
                    <CardDescription>Histórico de todas as correções do sistema</CardDescription>
                  </div>
                  {uniqueTemplates.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Select value={selectedRecalcTemplate} onValueChange={setSelectedRecalcTemplate}>
                        <SelectTrigger className="w-[280px]">
                          <SelectValue placeholder="Selecione um gabarito..." />
                        </SelectTrigger>
                        <SelectContent>
                          {uniqueTemplates.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!selectedRecalcTemplate || recalculating === selectedRecalcTemplate}
                        onClick={() => {
                          const t = uniqueTemplates.find(x => x.id === selectedRecalcTemplate);
                          if (t) handleRecalculate(t.id, t.name);
                        }}
                      >
                        <RefreshCw className={`h-4 w-4 mr-1 ${recalculating === selectedRecalcTemplate ? "animate-spin" : ""}`} />
                        Recalcular
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Acertos</TableHead>
                      <TableHead className="text-center">%</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {corrections.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.student_name}</TableCell>
                        <TableCell>{c.student_id || "-"}</TableCell>
                        <TableCell>{c.templates?.name || "-"}</TableCell>
                        <TableCell>
                          <span className="px-2 py-1 text-xs rounded-full bg-secondary text-secondary-foreground">
                            {c.templates?.exam_type || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {c.total_score != null && c.max_score != null
                            ? `${c.total_score}/${c.max_score}`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-center font-bold">
                          {c.percentage != null ? `${Number(c.percentage).toFixed(1)}%` : "-"}
                        </TableCell>
                        <TableCell>
                          {c.created_at
                            ? new Date(c.created_at).toLocaleDateString("pt-BR")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteCorrection(c.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <AddStudentToExamDialog
        open={showAddStudent}
        onOpenChange={setShowAddStudent}
        templates={allTemplates}
        onSuccess={loadCorrections}
      />
    </div>
  );
};

export default History;
