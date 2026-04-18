import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, Search, Users, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import FlemingLogo from "@/components/FlemingLogo";

interface Student {
  id: string;
  name: string;
  student_id: string | null;
  campus: string | null;
  foreign_language: string | null;
  email: string | null;
}

const FOREIGN_LANGUAGES = ["Inglês", "Espanhol"];
const CAMPUSES = ["CHAPECÓ", "CRICIÚMA", "FLORIANÓPOLIS", "ON-LINE", "PORTO ALEGRE"];

const Students = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof Student | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formStudentId, setFormStudentId] = useState("");
  const [formCampus, setFormCampus] = useState("");
  const [formLanguage, setFormLanguage] = useState("");
  const [formEmail, setFormEmail] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    fetchStudents();
  };

  const fetchStudents = async () => {
    setLoading(true);
    // Agora busca todos os alunos (RLS permite leitura compartilhada)
    const { data, error } = await supabase
      .from("students")
      .select("id, name, student_id, campus, foreign_language, email")
      .order("name");

    if (error) {
      toast({ title: "Erro ao carregar alunos", description: error.message, variant: "destructive" });
    } else {
      setStudents(data || []);
    }
    setLoading(false);
  };

  const openNewDialog = () => {
    setEditingStudent(null);
    setFormName("");
    setFormStudentId("");
    setFormCampus("");
    setFormLanguage("");
    setFormEmail("");
    setDialogOpen(true);
  };

  const openEditDialog = (student: Student) => {
    setEditingStudent(student);
    setFormName(student.name);
    setFormStudentId(student.student_id || "");
    setFormCampus(student.campus || "");
    setFormLanguage(student.foreign_language || "");
    setFormEmail(student.email || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const payload = {
      name: formName.trim(),
      student_id: formStudentId.trim() || null,
      campus: formCampus || null,
      foreign_language: formLanguage || null,
      email: formEmail.trim() || null,
      user_id: session.user.id,
    };

    if (editingStudent) {
      const { error } = await supabase.from("students").update(payload).eq("id", editingStudent.id);

      if (error) {
        toast({ title: "Erro ao atualizar aluno", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Aluno atualizado com sucesso" });
    } else {
      const { error } = await supabase.from("students").insert(payload);
      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Matrícula já cadastrada",
            description: "Já existe um aluno com essa matrícula.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Erro ao cadastrar aluno", description: error.message, variant: "destructive" });
        }
        return;
      }
      toast({ title: "Aluno cadastrado com sucesso" });
    }

    setDialogOpen(false);
    fetchStudents();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("students").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erro ao excluir aluno", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Aluno excluído" });
      fetchStudents();
    }
    setDeleteId(null);
  };

  const handleSort = (field: keyof Student) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: keyof Student }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 text-primary" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-primary" />
    );
  };

  const filtered = students
    .filter((s) => {
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.student_id && s.student_id.toLowerCase().includes(q)) ||
        (s.campus && s.campus.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (!sortField) return 0;
      const valA = (a[sortField] || "").toString().toLowerCase();
      const valB = (b[sortField] || "").toString().toLowerCase();
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <FlemingLogo size="sm" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Cadastro de Alunos</h1>
          </div>
          <Button onClick={openNewDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Aluno
          </Button>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, matrícula ou sede..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Alunos cadastrados ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-center py-8">Carregando...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {search ? "Nenhum aluno encontrado." : "Nenhum aluno cadastrado. Clique em 'Novo Aluno' para começar."}
              </p>
            ) : (
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[25%] cursor-pointer select-none" onClick={() => handleSort("name")}>
                      <span className="flex items-center">Nome <SortIcon field="name" /></span>
                    </TableHead>
                    <TableHead className="w-[12%] cursor-pointer select-none" onClick={() => handleSort("student_id")}>
                      <span className="flex items-center">Matrícula <SortIcon field="student_id" /></span>
                    </TableHead>
                    <TableHead className="w-[14%] cursor-pointer select-none" onClick={() => handleSort("campus")}>
                      <span className="flex items-center">Sede <SortIcon field="campus" /></span>
                    </TableHead>
                    <TableHead className="w-[14%] cursor-pointer select-none" onClick={() => handleSort("foreign_language")}>
                      <span className="flex items-center">Língua <SortIcon field="foreign_language" /></span>
                    </TableHead>
                    <TableHead className="w-[20%] cursor-pointer select-none" onClick={() => handleSort("email")}>
                      <span className="flex items-center">E-mail <SortIcon field="email" /></span>
                    </TableHead>
                    <TableHead className="w-[15%] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>{student.student_id || "—"}</TableCell>
                      <TableCell>{student.campus || "—"}</TableCell>
                      <TableCell>{student.foreign_language || "—"}</TableCell>
                      <TableCell className="truncate max-w-[150px]">{student.email || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(student)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(student.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Dialog de Cadastro/Edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStudent ? "Editar Aluno" : "Novo Aluno"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome completo do aluno"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentId">Matrícula</Label>
              <Input
                id="studentId"
                value={formStudentId}
                onChange={(e) => setFormStudentId(e.target.value)}
                placeholder="Número de matrícula"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campus">Sede</Label>
              <Select value={formCampus} onValueChange={setFormCampus}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a sede" />
                </SelectTrigger>
                <SelectContent>
                  {CAMPUSES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Língua Estrangeira</Label>
              <Select value={formLanguage} onValueChange={setFormLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a língua" />
                </SelectTrigger>
                <SelectContent>
                  {FOREIGN_LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>{editingStudent ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aluno?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O aluno será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Students;
