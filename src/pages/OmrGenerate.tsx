import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FileText, Download, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { generateBatch } from "@/lib/omr-client";
import OmrStepHeader, { OmrEmptyState } from "@/components/omr/OmrStepHeader";

const OmrGenerate = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const { toast } = useToast();

  const [templateName, setTemplateName] = useState("");
  const [examType, setExamType] = useState("");
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [existingSheets, setExistingSheets] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [enemDay, setEnemDay] = useState<"1" | "2" | "both">("both");
  const [result, setResult] = useState<{ zip_url: string; expires_at: string; sheet_count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEnem = examType === "enem";

  useEffect(() => {
    if (!templateId) return;
    (async () => {
      const [{ data: tpl }, enrolled, sheets] = await Promise.all([
        supabase.from("templates").select("name, exam_type").eq("id", templateId).maybeSingle(),
        supabase.from("template_students").select("id", { count: "exact", head: true }).eq("template_id", templateId),
        supabase.from("answer_sheets").select("id", { count: "exact", head: true }).eq("template_id", templateId),
      ]);
      setTemplateName(tpl?.name || "");
      setExamType(tpl?.exam_type || "");
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
      if (isEnem && enemDay === "both") {
        // Gera dia 1 e dia 2 separados; retorna o primeiro link (ambos no mesmo ZIP não é suportado)
        const [res1, res2] = await Promise.all([
          generateBatch(templateId, undefined, 1),
          generateBatch(templateId, undefined, 2),
        ]);
        // Abre os dois downloads automaticamente
        const a1 = document.createElement("a"); a1.href = res1.zip_url; a1.download = "gabaritos_enem_dia1.zip"; a1.click();
        const a2 = document.createElement("a"); a2.href = res2.zip_url; a2.download = "gabaritos_enem_dia2.zip"; a2.click();
        setResult({ zip_url: res1.zip_url, expires_at: res1.expires_at, sheet_count: (res1.sheet_count || 0) + (res2.sheet_count || 0) });
        toast({ title: "Gabaritos ENEM gerados!", description: "Dois ZIPs baixados: Dia 1 e Dia 2." });
      } else {
        const day = isEnem ? Number(enemDay) : undefined;
        const res = await generateBatch(templateId, undefined, day);
        setResult({ zip_url: res.zip_url, expires_at: res.expires_at, sheet_count: res.sheet_count });
        toast({ title: "Gabaritos gerados!", description: `${res.sheet_count} folhas prontas para download.` });
      }
    } catch (err: any) {
      const msg = err.message || "Erro desconhecido";
      setError(msg);
      toast({ title: "Falha ao gerar", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (!templateId) {
    return (
      <div className="min-h-screen bg-background">
        <OmrStepHeader step="generate" title="Gerar Gabaritos" />
        <OmrEmptyState stepLabel="Gerar Gabaritos" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <OmrStepHeader step="generate" title={templateName ? `Gerar Gabaritos · ${templateName}` : "Gerar Gabaritos"} templateId={templateId} />

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
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertTitle>Reimpressão disponível</AlertTitle>
                <AlertDescription>
                  Esta prova já tem <strong>{existingSheets} folha(s)</strong> geradas. Você pode reimprimir o ZIP a qualquer momento — os QR Codes são mantidos, então scans antigos continuam válidos.
                </AlertDescription>
              </Alert>
            )}

            {isEnem && (
              <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
                <Label className="text-sm font-semibold">Dia do ENEM a gerar</Label>
                <RadioGroup
                  value={enemDay}
                  onValueChange={(v) => setEnemDay(v as "1" | "2" | "both")}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="both" id="enem-both" />
                    <Label htmlFor="enem-both">Ambos os dias (2 ZIPs)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="1" id="enem-dia1" />
                    <Label htmlFor="enem-dia1">Dia 1 (Q1–90)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="2" id="enem-dia2" />
                    <Label htmlFor="enem-dia2">Dia 2 (Q91–180)</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={generating || enrolledCount === 0}
              className="w-full"
              size="lg"
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{existingSheets > 0 ? "Preparando reimpressão" : "Gerando"} ({enrolledCount} gabaritos)...</>
              ) : existingSheets > 0 ? (
                <><Download className="h-4 w-4 mr-2" />Reimprimir {enrolledCount} gabaritos (mesmo QR)</>
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