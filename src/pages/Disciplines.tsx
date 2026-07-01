import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Area {
  id: string;
  nome: string;
  cor: string | null;
  icone: string | null;
}

interface Assunto {
  id: string;
  nome: string;
  disciplina_id: string;
}

interface Disciplina {
  id: string;
  nome: string;
  area_id: string | null;
  icone: string | null;
  cor: string | null;
  assuntos: Assunto[];
}

const Disciplines = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [areas, setAreas] = useState<Area[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [loading, setLoading] = useState(true);

  // form: nova área
  const [newArea, setNewArea] = useState("");

  // form: nova disciplina
  const [newDisc, setNewDisc] = useState("");
  const [newDiscArea, setNewDiscArea] = useState<string>("__none__");

  // form: novo assunto (por disciplina)
  const [newAssunto, setNewAssunto] = useState<Record<string, string>>({});

  // estado de colapso
  const [areaOpen, setAreaOpen] = useState<Record<string, boolean>>({});
  const [discOpen, setDiscOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);

    const [{ data: areasData }, { data: discData }, { data: assuntosData }] = await Promise.all([
      supabase.from("areas_conhecimento").select("*").order("nome"),
      supabase.from("disciplinas").select("*").order("nome"),
      supabase.from("assuntos").select("*").order("nome"),
    ]);

    setAreas(areasData || []);
    setDisciplinas(
      (discData || []).map((d) => ({
        ...d,
        assuntos: (assuntosData || []).filter((a) => a.disciplina_id === d.id),
      }))
    );
    setLoading(false);
  };

  // ── Área ─────────────────────────────────────────────────────────────────
  const addArea = async () => {
    const nome = newArea.trim();
    if (!nome) return;
    const { error } = await supabase.from("areas_conhecimento").insert({ nome });
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
      return;
    }
    setNewArea("");
    toast({ title: "Área de conhecimento adicionada!" });
    loadAll();
  };

  const deleteArea = async (id: string) => {
    if (!confirm("Excluir esta área? As disciplinas vinculadas ficarão sem área.")) return;
    const { error } = await supabase.from("areas_conhecimento").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: error.message });
      return;
    }
    toast({ title: "Área excluída!" });
    loadAll();
  };

  // ── Disciplina ────────────────────────────────────────────────────────────
  const addDisciplina = async () => {
    const nome = newDisc.trim();
    if (!nome) return;
    const area_id = newDiscArea === "__none__" ? null : newDiscArea;
    const { error } = await supabase.from("disciplinas").insert({ nome, area_id });
    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message.includes("unique") ? "Disciplina já cadastrada." : error.message,
      });
      return;
    }
    setNewDisc("");
    toast({ title: "Disciplina adicionada!" });
    loadAll();
  };

  const deleteDisciplina = async (id: string) => {
    const { error } = await supabase.from("disciplinas").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: error.message });
      return;
    }
    toast({ title: "Disciplina excluída!" });
    loadAll();
  };

  // ── Assunto ───────────────────────────────────────────────────────────────
  const addAssunto = async (disciplinaId: string) => {
    const nome = (newAssunto[disciplinaId] || "").trim();
    if (!nome) return;
    const { error } = await supabase.from("assuntos").insert({ nome, disciplina_id: disciplinaId });
    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message.includes("unique") ? "Conteúdo já cadastrado nesta disciplina." : error.message,
      });
      return;
    }
    setNewAssunto((prev) => ({ ...prev, [disciplinaId]: "" }));
    loadAll();
  };

  const deleteAssunto = async (id: string) => {
    await supabase.from("assuntos").delete().eq("id", id);
    loadAll();
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const toggleArea = (id: string) =>
    setAreaOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleDisc = (id: string) =>
    setDiscOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const disciplinasSemArea = disciplinas.filter((d) => !d.area_id);

  const renderDisciplina = (disc: Disciplina) => (
    <div key={disc.id} className="border rounded-md bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          className="flex items-center gap-2 text-left flex-1"
          onClick={() => toggleDisc(disc.id)}
        >
          {discOpen[disc.id] ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="font-medium text-sm">{disc.nome}</span>
          <Badge variant="secondary" className="text-xs ml-1">
            {disc.assuntos.length}
          </Badge>
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => deleteDisciplina(disc.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {discOpen[disc.id] && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          {/* Novo assunto */}
          <div className="flex gap-2">
            <Input
              className="h-8 text-sm"
              placeholder="Novo conteúdo... Ex: Revolução Francesa"
              value={newAssunto[disc.id] || ""}
              onChange={(e) =>
                setNewAssunto((prev) => ({ ...prev, [disc.id]: e.target.value }))
              }
              onKeyDown={(e) => e.key === "Enter" && addAssunto(disc.id)}
            />
            <Button variant="outline" size="sm" className="h-8" onClick={() => addAssunto(disc.id)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Lista de assuntos */}
          {disc.assuntos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum conteúdo cadastrado.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {disc.assuntos.map((a) => (
                <Badge key={a.id} variant="outline" className="text-xs py-0.5 px-2 flex items-center gap-1">
                  {a.nome}
                  <button
                    onClick={() => deleteAssunto(a.id)}
                    className="ml-0.5 text-muted-foreground hover:text-destructive leading-none"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Disciplinas e Conteúdos</h1>
            <p className="text-sm text-muted-foreground">
              Organize áreas de conhecimento, disciplinas e conteúdos
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">

        {/* ── Formulários ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Nova área */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Nova Área de Conhecimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Linguagens..."
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addArea()}
                />
                <Button size="sm" onClick={addArea}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Nova disciplina */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Nova Disciplina
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select value={newDiscArea} onValueChange={setNewDiscArea}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Área de conhecimento (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem área</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.icone} {a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Matemática, Português..."
                  value={newDisc}
                  onChange={(e) => setNewDisc(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addDisciplina()}
                />
                <Button size="sm" onClick={addDisciplina}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Lista por área ───────────────────────────────────────────────── */}
        {areas.map((area) => {
          const discsNaArea = disciplinas.filter((d) => d.area_id === area.id);
          const isOpen = areaOpen[area.id] ?? true;

          return (
            <Card key={area.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-2 text-left flex-1"
                    onClick={() => toggleArea(area.id)}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-base">{area.icone}</span>
                    <CardTitle className="text-base">{area.nome}</CardTitle>
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {discsNaArea.length} disciplina{discsNaArea.length !== 1 ? "s" : ""}
                    </Badge>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteArea(area.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              {isOpen && (
                <CardContent className="space-y-2 pt-0">
                  {discsNaArea.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      Nenhuma disciplina nesta área ainda.
                    </p>
                  ) : (
                    discsNaArea.map(renderDisciplina)
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}

        {/* ── Disciplinas sem área ─────────────────────────────────────────── */}
        {disciplinasSemArea.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <button
                  className="flex items-center gap-2 text-left flex-1"
                  onClick={() => toggleArea("__semarea__")}
                >
                  {areaOpen["__semarea__"] !== false ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base text-muted-foreground">Sem área de conhecimento</CardTitle>
                  <Badge variant="outline" className="ml-1 text-xs">
                    {disciplinasSemArea.length}
                  </Badge>
                </button>
              </div>
            </CardHeader>

            {areaOpen["__semarea__"] !== false && (
              <CardContent className="space-y-2 pt-0">
                {disciplinasSemArea.map(renderDisciplina)}
              </CardContent>
            )}
          </Card>
        )}

        {areas.length === 0 && disciplinas.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma área ou disciplina cadastrada ainda.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Disciplines;
