import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Users, Search, UserPlus } from "lucide-react";

const CAMPUSES = ["CHAPECÓ", "CRICIÚMA", "FLORIANÓPOLIS", "ON-LINE", "PORTO ALEGRE"];

interface ClassRow {
  id: string;
  campus: string;
  name: string;
  year: number | null;
  student_count?: number;
}

interface Student {
  id: string;
  name: string;
  student_id: string | null;
  campus: string | null;
  class_id: string | null;
}

const Classes = () => {
  const { toast } = useToast();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCampus, setFilterCampus] = useState<string>("TODAS");

  // create/edit
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [formCampus, setFormCampus] = useState("CHAPECÓ");
  const [formName, setFormName] = useState("");
  const [formYear, setFormYear] = useState<string>(String(new Date().getFullYear()));

  // assign students dialog
  const [openAssign, setOpenAssign] = useState(false);
  const [assignClass, setAssignClass] = useState<ClassRow | null>(null);
  const [assignSelected, setAssignSelected] = useState<Set<string>>(new Set());
  const [assignSearch, setAssignSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: cls }, { data: studs }] = await Promise.all([
      supabase.from("classes").select("id, campus, name, year").order("campus").order("name"),
      supabase.from("students").select("id, name, student_id, campus, class_id").order("name"),
    ]);
    const studentsList = (studs || []) as Student[];
    const counts = new Map<string, number>();
    studentsList.forEach((s) => {
      if (s.class_id) counts.set(s.class_id, (counts.get(s.class_id) || 0) + 1);
    });
    const classList = (cls || []).map((c: any) => ({ ...c, student_count: counts.get(c.id) || 0 }));
    setClasses(classList);
    setStudents(studentsList);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filterCampus === "TODAS") return classes;
    return classes.filter((c) => c.campus === filterCampus);
  }, [classes, filterCampus]);

  const openCreate = () => {
    setEditing(null);
    setFormCampus("CHAPECÓ");
    setFormName("");
    setFormYear(String(new Date().getFullYear()));
    setOpenForm(true);
  };
  const openEdit = (c: ClassRow) => {
    setEditing(c);
    setFormCampus(c.campus);
    setFormName(c.name);
    setFormYear(c.year ? String(c.year) : "");
    setOpenForm(true);
  };

  const saveClass = async () => {
    if (!formName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    try {
      const yearNum = formYear ? parseInt(formYear, 10) : null;
      if (editing) {
        const { error } = await supabase
          .from("classes")
          .update({ campus: formCampus, name: formName.trim(), year: yearNum })
          .eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Turma atualizada" });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Não autenticado");
        const { error } = await supabase.from("classes").insert({
          campus: formCampus,
          name: formName.trim(),
          year: yearNum,
          user_id: user.id,
        });
        if (error) throw error;
        toast({ title: "Turma criada" });
      }
      setOpenForm(false);
      load();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
  };

  const deleteClass = async (c: ClassRow) => {
    if (!confirm(`Excluir a turma "${c.name}" (${c.campus})? Os alunos vinculados ficarão sem turma.`)) return;
    const { error } = await supabase.from("classes").delete().eq("id", c.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Turma excluída" });
    load();
  };

  const openAssignDialog = (c: ClassRow) => {
    setAssignClass(c);
    const ids = new Set(students.filter((s) => s.class_id === c.id).map((s) => s.id));
    setAssignSelected(ids);
    setAssignSearch("");
    setOpenAssign(true);
  };

  const assignStudents = useMemo(() => {
    if (!assignClass) return [];
    const term = assignSearch.toLowerCase();
    return students
      .filter((s) => !s.campus || s.campus === assignClass.campus)
      .filter((s) =>
        !term ||
        s.name.toLowerCase().includes(term) ||
        (s.student_id || "").toLowerCase().includes(term),
      );
  }, [students, assignClass, assignSearch]);

  const toggleAssign = (id: string) => {
    setAssignSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveAssign = async () => {
    if (!assignClass) return;
    try {
      const currentlyInClass = new Set(
        students.filter((s) => s.class_id === assignClass.id).map((s) => s.id),
      );
      const toAdd = [...assignSelected].filter((id) => !currentlyInClass.has(id));
      const toRemove = [...currentlyInClass].filter((id) => !assignSelected.has(id));

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("students")
          .update({ class_id: assignClass.id })
          .in("id", toAdd);
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("students")
          .update({ class_id: null })
          .in("id", toRemove);
        if (error) throw error;
      }
      toast({ title: "Alunos atualizados", description: `${assignSelected.size} aluno(s) na turma.` });
      setOpenAssign(false);
      load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Turmas
          </h1>
          <p className="text-sm text-muted-foreground">
            Organize alunos por Sede → Turma. Use turmas para liberar provas em massa.
          </p>
        </div>
        <Dialog open={openForm} onOpenChange={setOpenForm}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Nova turma
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar turma" : "Nova turma"}</DialogTitle>
              <DialogDescription>Defina a sede, o nome e o ano letivo.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Sede</label>
                <Select value={formCampus} onValueChange={setFormCampus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAMPUSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Nome da turma</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex.: 3ºA Manhã"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Ano letivo (opcional)</label>
                <Input
                  type="number"
                  value={formYear}
                  onChange={(e) => setFormYear(e.target.value)}
                  placeholder="2025"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
              <Button onClick={saveClass}>{editing ? "Salvar" : "Criar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de turmas</CardTitle>
          <CardDescription>Filtre por sede e gerencie os alunos vinculados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={filterCampus} onValueChange={setFilterCampus}>
            <SelectTrigger className="md:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas as sedes</SelectItem>
              {CAMPUSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sede</TableHead>
                  <TableHead>Turma</TableHead>
                  <TableHead>Ano</TableHead>
                  <TableHead>Alunos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhuma turma cadastrada</TableCell></TableRow>
                ) : (
                  filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell><Badge variant="secondary">{c.campus}</Badge></TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.year || "-"}</TableCell>
                      <TableCell>{c.student_count}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => openAssignDialog(c)}>
                          <UserPlus className="h-4 w-4 mr-1" /> Alunos
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteClass(c)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Assign students dialog */}
      <Dialog open={openAssign} onOpenChange={setOpenAssign}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Alunos da turma {assignClass?.name}</DialogTitle>
            <DialogDescription>
              Selecione os alunos da sede {assignClass?.campus} que pertencem a esta turma.
              <br />
              <Badge variant="secondary" className="mt-2">{assignSelected.size} selecionados</Badge>
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar nome ou matrícula..."
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <ScrollArea className="h-[400px] border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Turma atual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignStudents.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Nenhum aluno</TableCell></TableRow>
                ) : (
                  assignStudents.map((s) => {
                    const currentClass = classes.find((c) => c.id === s.class_id);
                    const inOther = s.class_id && s.class_id !== assignClass?.id;
                    return (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => toggleAssign(s.id)}>
                        <TableCell>
                          <Checkbox checked={assignSelected.has(s.id)} onCheckedChange={() => toggleAssign(s.id)} />
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.student_id || "-"}</TableCell>
                        <TableCell>
                          {currentClass ? (
                            <Badge variant={inOther ? "destructive" : "secondary"}>
                              {currentClass.name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">sem turma</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAssign(false)}>Cancelar</Button>
            <Button onClick={saveAssign}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Classes;