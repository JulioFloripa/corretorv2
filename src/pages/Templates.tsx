import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, ArrowLeft } from "lucide-react";
import FlemingLogo from "@/components/FlemingLogo";
import { Textarea } from "@/components/ui/textarea";
import { EXAM_PRESETS, generatePresetQuestions } from "@/lib/exam-presets";

interface Template {
  id: string;
  name: string;
  description: string | null;
  total_questions: number;
  exam_type: string;
  created_at: string;
}

const Templates = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [selectedExamType, setSelectedExamType] = useState("");
  const [totalQuestions, setTotalQuestions] = useState("");

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  const checkAuthAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    loadTemplates();
  };

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar gabaritos",
        description: error.message,
      });
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  };

  const handleCreateTemplate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const examType = selectedExamType;
    const numQuestions = parseInt(totalQuestions);

    const templateData = {
      user_id: session.user.id,
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      total_questions: numQuestions,
      exam_type: examType,
    };

    const { data: inserted, error } = await supabase.from("templates").insert([templateData]).select().single();

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao criar gabarito",
        description: error.message,
      });
      return;
    }

    // If there's a preset, auto-create questions with subjects
    const preset = EXAM_PRESETS[examType];
    if (preset) {
      const presetQuestions = generatePresetQuestions(preset).map((q) => ({
        ...q,
        template_id: inserted.id,
      }));
      await supabase.from("template_questions").insert(presetQuestions);
    }

    toast({ title: "Gabarito criado com sucesso!" });
    setDialogOpen(false);
    setSelectedExamType("");
    setTotalQuestions("");
    loadTemplates();
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este gabarito?")) return;

    const { error } = await supabase.from("templates").delete().eq("id", id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir gabarito",
        description: error.message,
      });
    } else {
      toast({
        title: "Gabarito excluído!",
      });
      loadTemplates();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <FlemingLogo size="sm" showText={false} />
              <h1 className="text-xl font-bold">Gerenciar Gabaritos</h1>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Gabarito
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Gabarito</DialogTitle>
                <DialogDescription>
                  Preencha as informações básicas do gabarito
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateTemplate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Gabarito</Label>
                  <Input id="name" name="name" placeholder="Ex: Prova Matemática 1º Bimestre" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Textarea id="description" name="description" placeholder="Detalhes adicionais..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exam_type">Tipo de Prova</Label>
                  <Select
                    value={selectedExamType}
                    onValueChange={(value) => {
                      setSelectedExamType(value);
                      const preset = EXAM_PRESETS[value];
                      if (preset) {
                        setTotalQuestions(String(preset.totalQuestions));
                      } else {
                        setTotalQuestions("");
                      }
                    }}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Múltipla Escolha</SelectItem>
                      <SelectItem value="enem">ENEM</SelectItem>
                      <SelectItem value="ufsc">UFSC (Somatório)</SelectItem>
                      <SelectItem value="acafe">ACAFE</SelectItem>
                      <SelectItem value="acafe_criciuma">ACAFE - Criciúma</SelectItem>
                      <SelectItem value="custom">Personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                  {EXAM_PRESETS[selectedExamType] && (
                    <p className="text-xs text-muted-foreground">
                      Pré-configurado: {EXAM_PRESETS[selectedExamType].totalQuestions} questões com distribuição de disciplinas automática
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total_questions">Número de Questões</Label>
                  <Input
                    id="total_questions"
                    name="total_questions"
                    type="number"
                    min="1"
                    max="200"
                    value={totalQuestions}
                    onChange={(e) => setTotalQuestions(e.target.value)}
                    placeholder="40"
                    required
                    readOnly={!!EXAM_PRESETS[selectedExamType]}
                  />
                </div>
                <Button type="submit" className="w-full">Criar Gabarito</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando gabaritos...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">Nenhum gabarito cadastrado ainda</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Gabarito
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="truncate">{template.name}</span>
                  </CardTitle>
                  <CardDescription>{template.description || "Sem descrição"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm mb-4">
                    <p className="text-muted-foreground">
                      <span className="font-medium">Tipo:</span> {template.exam_type}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium">Questões:</span> {template.total_questions}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate(`/templates/${template.id}`)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteTemplate(template.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Templates;
