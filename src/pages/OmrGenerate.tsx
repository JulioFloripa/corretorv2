import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, FileText, Download, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { generateBatch } from "@/lib/omr-client";

const OmrGenerate = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const { toast } = useToast();

  const [templateName, setTemplateName] = useState("");
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [existingSheets, setExistingSheets] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ zip_url: string; expires_at: string; sheet_count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) return;
    (async () => {
      const [{ data: tpl }, enrolled, sheets] = await Promise.all([
        supabase.from("templates").select("name").eq("id", templateId).maybeSingle(),
        supabase.from("template_students").select("id", { count: "exact", head: true }).eq("template_id", templateId),
        supabase.from("answer_sheets").select("id", { count: "exact", head: true }).eq("template_id", templateId),
      ]);
      setTemplateName(tpl?.name || "");
      setEnrolledCount(enrolled.count || 0);
      setExistingSheets(sheets.count || 0);
    })();
  }, [templateId]);

  const handleGenerate = async () => {
    if (!templateId) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await generateBatch(templateId);
      setResult({ zip_url: res.zip_url, expires_at: res.expires_at, sheet_count: res.sheet_count });
      toast({ title: "Gabaritos gerados!", description: `${res.sheet_count} folhas prontas para download.` });
    } catch (err: any) {
      const msg = err.message || "Erro desconhecido";
      setError(msg);
      toast({ title: "Falha ao gerar", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/omr")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-xl font-bold">Gerar Gabaritos</h1>
            <p className="text-sm text-muted-foreground">{templateName}</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Geração em lote
            </CardTitle>
            <CardDescription>
              Gera um PDF (com QR Code) por aluno matriculado. Você baixa um único ZIP para imprimir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground">Alunos matriculados</div>
                <div className="text-3xl font-bold text-primary">{enrolledCount}</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground">Folhas já geradas</div>
                <div className="text-3xl font-bold">{existingSheets}</div>
              </div>
            </div>

            {enrolledCount === 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Sem alunos matriculados</AlertTitle>
                <AlertDescription>
                  Volte e matricule alunos antes de gerar os gabaritos.
                </AlertDescription>
              </Alert>
            )}

            {existingSheets > 0 && !result && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Folhas existentes</AlertTitle>
                <AlertDescription>
                  Esta prova já tem {existingSheets} folha(s) registrada(s). Re-gerar mantém os mesmos QR Codes (não invalida scans).
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleGenerate}
              disabled={generating || enrolledCount === 0}
              className="w-full"
              size="lg"
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando {enrolledCount} gabaritos...</>
              ) : (
                <><FileText className="h-4 w-4 mr-2" />Gerar {enrolledCount} gabaritos</>
              )}
            </Button>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {result && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertTitle>Pronto!</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    <Badge variant="secondary">{result.sheet_count} PDFs</Badge>{" "}
                    no ZIP. Link válido até{" "}
                    <strong>{new Date(result.expires_at).toLocaleString("pt-BR")}</strong>.
                  </p>
                  <Button asChild>
                    <a href={result.zip_url} download target="_blank" rel="noreferrer">
                      <Download className="h-4 w-4 mr-2" />
                      Baixar ZIP de gabaritos
                    </a>
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default OmrGenerate;