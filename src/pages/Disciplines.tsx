import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Topic {
  id: string;
  name: string;
  discipline_id: string;
}

interface Discipline {
  id: string;
  name: string;
  topics: Topic[];
}

const Disciplines = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [newDiscipline, setNewDiscipline] = useState("");
  const [newTopics, setNewTopics] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDisciplines();
  }, []);

  const loadDisciplines = async () => {
    const { data: discData, error: discError } = await supabase
      .from("disciplines")
      .select("*")
      .order("name");

    if (discError) {
      toast({ variant: "destructive", title: "Erro ao carregar disciplinas", description: discError.message });
      setLoading(false);
      return;
    }

    const { data: topicsData } = await supabase
      .from("discipline_topics")
      .select("*")
      .order("name");

    const mapped: Discipline[] = (discData || []).map((d) => ({
      id: d.id,
      name: d.name,
      topics: (topicsData || []).filter((t) => t.discipline_id === d.id),
    }));

    setDisciplines(mapped);
    setLoading(false);
  };

  const addDiscipline = async () => {
    const name = newDiscipline.trim();
    if (!name) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.from("disciplines").insert({ name, user_id: session.user.id });

    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message.includes("idx_disciplines_user_name") ? "Disciplina já cadastrada." : error.message });
      return;
    }

    setNewDiscipline("");
    toast({ title: "Disciplina adicionada!" });
    loadDisciplines();
  };

  const deleteDiscipline = async (id: string) => {
    const { error } = await supabase.from("disciplines").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: error.message });
    } else {
      toast({ title: "Disciplina excluída!" });
      loadDisciplines();
    }
  };

  const addTopic = async (disciplineId: string) => {
    const name = (newTopics[disciplineId] || "").trim();
    if (!name) return;

    const { error } = await supabase.from("discipline_topics").insert({ name, discipline_id: disciplineId });

    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message.includes("idx_topics_discipline_name") ? "Conteúdo já cadastrado nesta disciplina." : error.message });
      return;
    }

    setNewTopics((prev) => ({ ...prev, [disciplineId]: "" }));
    toast({ title: "Conteúdo adicionado!" });
    loadDisciplines();
  };

  const deleteTopic = async (id: string) => {
    const { error } = await supabase.from("discipline_topics").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: error.message });
    } else {
      loadDisciplines();
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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
              Cadastre disciplinas e seus conteúdos para usar nos gabaritos
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        {/* Add new discipline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nova Disciplina</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: Matemática, Português..."
                value={newDiscipline}
                onChange={(e) => setNewDiscipline(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addDiscipline()}
              />
              <Button onClick={addDiscipline}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* List disciplines */}
        {disciplines.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma disciplina cadastrada ainda.
            </CardContent>
          </Card>
        ) : (
          disciplines.map((disc) => (
            <Card key={disc.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-2 text-left"
                    onClick={() => toggleExpanded(disc.id)}
                  >
                    {expanded[disc.id] ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <CardTitle className="text-lg">{disc.name}</CardTitle>
                    <Badge variant="secondary" className="ml-2">
                      {disc.topics.length} conteúdo{disc.topics.length !== 1 ? "s" : ""}
                    </Badge>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteDiscipline(disc.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              {expanded[disc.id] && (
                <CardContent className="space-y-3">
                  {/* Add topic */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Novo conteúdo... Ex: Revolução Francesa"
                      value={newTopics[disc.id] || ""}
                      onChange={(e) =>
                        setNewTopics((prev) => ({ ...prev, [disc.id]: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && addTopic(disc.id)}
                    />
                    <Button variant="outline" size="sm" onClick={() => addTopic(disc.id)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Topic list */}
                  {disc.topics.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      Nenhum conteúdo cadastrado.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {disc.topics.map((topic) => (
                        <Badge
                          key={topic.id}
                          variant="outline"
                          className="flex items-center gap-1 py-1 px-3"
                        >
                          {topic.name}
                          <button
                            onClick={() => deleteTopic(topic.id)}
                            className="ml-1 text-muted-foreground hover:text-destructive"
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))
        )}
      </main>
    </div>
  );
};

export default Disciplines;
