import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, UserPlus, UserMinus, Save, GraduationCap } from "lucide-react";
import OmrStepHeader, { OmrEmptyState } from "@/components/omr/OmrStepHeader";

const CAMPUSES = ["TODAS", "CHAPECÓ", "CRICIÚMA", "FLORIANÓPOLIS", "ON-LINE", "PORTO ALEGRE"];

interface Student {
  id: string;
  name: string;
  student_id: string | null;
  campus: string | null;
  class_id?: string | null;
}

interface ClassRow {
  id: string;
  campus: string;
  name: string;
  year: number | null;
}

const OmrEnroll = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const { toast } = useToast();

  const [templateName, setTemplateName] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [originalEnrolled, setOriginalEnrolled] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [campusFilter, setCampusFilter] = useState("TODAS");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!templateId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return navigate("/auth");

      const [{ data: tpl }, { data: studs }, { data: enr }, { data: cls }] = await Promise.all([
        supabase.from("templates").select("name").eq("id", templateId).maybeSingle(),
        supabase.from("students").select("id, name, student_id, campus, class_id").order("name"),
        supabase.from("template_students").select("student_id").eq("template_id", templateId),
        supabase.from("classes").select("id, campus, name, year").order("campus").order("name"),
      ]);
      setTemplateName(tpl?.name || "");
      setStudents(studs || []);
      setClasses(cls || []);
      const ids = new Set((enr || []).map((r: any) => r.student_id));
      setEnrolledIds(ids);
      setOriginalEnrolled(new Set(ids));
      setLoading(false);
    })();
  }, [templateId, navigate]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const term = search.toLowerCase();
      const matchesSearch =
        !term ||
        s.name.toLowerCase().includes(term) ||
        (s.student_id || "").toLowerCase().includes(term);
      const matchesCampus = campusFilter === "TODAS" || s.campus === campusFilter;
      return matchesSearch && matchesCampus;
    });
  }, [students, search, campusFilter]);

  const toggle = (id: string) => {
    setEnrolledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enrollAllFiltered = () => {
    setEnrolledIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((s) => next.add(s.id));
      return next;
    });
  };
  const removeAllFiltered = () => {
    setEnrolledIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((s) => next.delete(s.id));
      return next;
    });
  };

  // Liberar prova para uma turma inteira: marca todos os alunos da turma
  const enrollWholeClass = (classId: string) => {
    const studentIds = students.filter((s) => s.class_id === classId).map((s) => s.id);
    if (studentIds.length === 0) {
      toast({ title: "Turma vazia", description: "Esta turma ainda não tem alunos vinculados.", variant: "destructive" });
      return;
    }
    setEnrolledIds((prev) => {
      const next = new Set(prev);
      studentIds.forEach((id) => next.add(id));
      return next;
    });
    const cls = classes.find((c) => c.id === classId);
    toast({
      title: "Turma liberada",
      description: `${studentIds.length} aluno(s) da turma "${cls?.name}" foram adicionados. Clique em "Salvar matrículas" para confirmar.`,
    });
  };

  // Agrupa turmas por sede para dropdown hierárquico
  const classesByCampus = useMemo(() => {
    const map = new Map<string, ClassRow[]>();
    classes.forEach((c) => {
      if (!map.has(c.campus)) map.set(c.campus, []);
      map.get(c.campus)!.push(c);
    });
    return map;
  }, [classes]);

  const save = async () => {
    if (!templateId) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const toAdd = [...enrolledIds].filter((id) => !originalEnrolled.has(id));
      const toRemove = [...originalEnrolled].filter((id) => !enrolledIds.has(id));

      if (toAdd.length > 0) {
        const { error } = await supabase.from("template_students").insert(
          toAdd.map((sid) => ({ template_id: templateId, student_id: sid, user_id: user.id }))
        );
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("template_students")
          .delete()
          .eq("template_id", templateId)
          .in("student_id", toRemove);
        if (error) throw error;
      }
      setOriginalEnrolled(new Set(enrolledIds));
      toast({ title: "Matrículas salvas", description: `${enrolledIds.size} alunos vinculados a esta prova.` });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const dirty = enrolledIds.size !== originalEnrolled.size ||
    [...enrolledIds].some((id) => !originalEnrolled.has(id));

  if (!templateId) {
    return (
      <div className="min-h-screen bg-background">
        <OmrStepHeader step="enroll" title="Matricular Alunos" />
        <OmrEmptyState stepLabel="Matricular Alunos" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <OmrStepHeader step="enroll" title={templateName ? `Matricular Alunos · ${templateName}` : "Matricular Alunos"} templateId={templateId} />

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Liberação rápida por turma */}
        <Card className="mb-4 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-5 w-5 text-primary" />
              Liberar prova para uma turma inteira
            </CardTitle>
            <CardDescription>
              Selecione uma turma para adicionar automaticamente todos os seus alunos à lista de matriculados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma turma cadastrada.{" "}
                <button className="text-primary underline" onClick={() => navigate("/classes")}>
                  Criar uma turma
                </button>
              </p>
            ) : (
              <Select onValueChange={enrollWholeClass}>
                <SelectTrigger className="md:w-96">
                  <SelectValue placeholder="Escolha uma turma para liberar..." />
                </SelectTrigger>
                <SelectContent>
                  {[...classesByCampus.entries()].map(([campus, list]) => (
                    <div key={campus}>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">{campus}</div>
                      {list.map((c) => {
                        const count = students.filter((s) => s.class_id === c.id).length;
                        return (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {c.year ? `(${c.year})` : ""} — {count} aluno(s)
                          </SelectItem>
                        );
                      })}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Alunos da prova
              <Badge variant="secondary">{enrolledIds.size} selecionados</Badge>
            </CardTitle>
            <CardDescription>
              Marque os alunos que receberão a folha impressa para esta prova.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar nome ou matrícula..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={campusFilter} onValueChange={setCampusFilter}>
                <SelectTrigger className="md:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPUSES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={enrollAllFiltered}>
                <UserPlus className="h-4 w-4 mr-1" /> Selecionar visíveis
              </Button>
              <Button variant="outline" size="sm" onClick={removeAllFiltered}>
                <UserMinus className="h-4 w-4 mr-1" /> Remover visíveis
              </Button>
            </div>

            <ScrollArea className="h-[500px] border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Sede</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8">Carregando...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum aluno encontrado</TableCell></TableRow>
                  ) : (
                    filtered.map((s) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => toggle(s.id)}
                      >
                        <TableCell>
                          <Checkbox checked={enrolledIds.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.student_id || "-"}</TableCell>
                        <TableCell>{s.campus || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate("/omr")}>Cancelar</Button>
              <Button onClick={save} disabled={!dirty || saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? "Salvando..." : "Salvar matrículas"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default OmrEnroll;