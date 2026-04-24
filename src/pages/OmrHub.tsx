import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Users, FileText, Upload, ClipboardCheck, ScanLine, Pencil } from "lucide-react";
import FlemingLogo from "@/components/FlemingLogo";

interface Template {
  id: string;
  name: string;
  exam_type: string;
  total_questions: number;
}

const OmrHub = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ enrolled: 0, sheets: 0, scans: 0, pending: 0 });

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return navigate("/auth");
      const { data } = await supabase
        .from("templates")
        .select("id, name, exam_type, total_questions")
        .order("created_at", { ascending: false });
      setTemplates(data || []);
      setLoading(false);
    })();
  }, [navigate]);

  useEffect(() => {
    if (!selectedId) {
      setStats({ enrolled: 0, sheets: 0, scans: 0, pending: 0 });
      return;
    }
    (async () => {
      const [enrolled, sheets, scans, pending] = await Promise.all([
        supabase.from("template_students").select("id", { count: "exact", head: true }).eq("template_id", selectedId),
        supabase.from("answer_sheets").select("id", { count: "exact", head: true }).eq("template_id", selectedId),
        supabase.from("scan_submissions").select("id", { count: "exact", head: true }).eq("template_id", selectedId),
        supabase.from("scan_submissions").select("id", { count: "exact", head: true }).eq("template_id", selectedId).eq("reviewed", false).eq("discarded", false),
      ]);
      setStats({
        enrolled: enrolled.count || 0,
        sheets: sheets.count || 0,
        scans: scans.count || 0,
        pending: pending.count || 0,
      });
    })();
  }, [selectedId]);

  const cards = [
    { icon: Users, title: "1. Matricular Alunos", desc: "Vincule alunos cadastrados a esta prova", path: "enroll", count: stats.enrolled, label: "matriculados" },
    { icon: FileText, title: "2. Gerar Gabaritos", desc: "Gera PDFs com QR Code para impressão", path: "generate", count: stats.sheets, label: "folhas geradas" },
    { icon: Upload, title: "3. Enviar Scans", desc: "Upload das imagens escaneadas", path: "upload", count: stats.scans, label: "scans enviados" },
    { icon: ClipboardCheck, title: "4. Revisar Leituras", desc: "Valide as respostas detectadas", path: "review", count: stats.pending, label: "pendentes" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <FlemingLogo size="sm" showText={false} />
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Leitura Óptica de Gabaritos</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Selecione a Prova</CardTitle>
            <CardDescription>
              Escolha um simulado para iniciar o fluxo de leitura óptica
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedId} onValueChange={setSelectedId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Carregando..." : "Selecione uma prova"} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} • {t.exam_type.toUpperCase()} • {t.total_questions}q
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedId && (
          <div className="space-y-4">
            <Card
              className="cursor-pointer hover:border-primary transition-colors border-dashed"
              onClick={() => navigate(`/templates/${selectedId}`)}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Pencil className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Editar Gabarito desta Prova</CardTitle>
                    <CardDescription>Ajuste respostas, disciplinas, pontos e tipos de questão</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <Card
                  key={c.path}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => navigate(`/omr/${c.path}/${selectedId}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{c.title}</CardTitle>
                          <CardDescription>{c.desc}</CardDescription>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-primary">{c.count}</div>
                        <div className="text-xs text-muted-foreground">{c.label}</div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default OmrHub;