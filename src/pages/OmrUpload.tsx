import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, FileImage, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { uploadScansToBucket, scanBatch } from "@/lib/omr-client";
import OmrStepHeader, { OmrEmptyState } from "@/components/omr/OmrStepHeader";

const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

const OmrUpload = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const { toast } = useToast();

  const [templateName, setTemplateName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing" | "done">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<{ ok: number; failed: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!templateId) return;
    supabase.from("templates").select("name").eq("id", templateId).maybeSingle()
      .then(({ data }) => setTemplateName(data?.name || ""));
  }, [templateId]);

  const addFiles = (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).filter((f) => ACCEPTED.includes(f.type));
    const rejected = Array.from(newFiles).length - arr.length;
    if (rejected > 0) {
      toast({ title: `${rejected} arquivo(s) ignorado(s)`, description: "Apenas PNG, JPG e WEBP são aceitos.", variant: "destructive" });
    }
    setFiles((prev) => [...prev, ...arr]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleProcess = async () => {
    if (!templateId || files.length === 0) return;
    setPhase("uploading");
    setProgress({ done: 0, total: files.length });
    try {
      const paths = await uploadScansToBucket(templateId, files, (done, total) => setProgress({ done, total }));
      setPhase("processing");
      const res = await scanBatch(templateId, paths);
      setSummary(res.summary);
      setPhase("done");
      toast({ title: "Scans processados!", description: `${res.summary.ok} ok, ${res.summary.failed} falhas.` });
    } catch (err: any) {
      toast({ title: "Erro no processamento", description: err.message, variant: "destructive" });
      setPhase("idle");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/omr")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Enviar Scans</h1>
            <p className="text-sm text-muted-foreground">{templateName}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/templates/${templateId}`)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar gabarito
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload das folhas escaneadas
            </CardTitle>
            <CardDescription>
              Arraste imagens ou clique para selecionar. Suporta múltiplos arquivos (PNG, JPG, WEBP).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {phase === "idle" && (
              <>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                    dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                >
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-base font-medium">Arraste imagens aqui</p>
                  <p className="text-sm text-muted-foreground">ou clique para buscar</p>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED.join(",")}
                    className="hidden"
                    onChange={(e) => e.target.files && addFiles(e.target.files)}
                  />
                </div>

                {files.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-64 overflow-auto">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2 px-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileImage className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="text-sm truncate">{f.name}</span>
                          <Badge variant="secondary" className="text-xs">{(f.size / 1024 / 1024).toFixed(1)} MB</Badge>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeFile(i)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{files.length} arquivo(s) selecionado(s)</span>
                  <Button onClick={handleProcess} disabled={files.length === 0}>
                    Processar lote
                  </Button>
                </div>
              </>
            )}

            {phase === "uploading" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm">Enviando para o servidor... ({progress.done}/{progress.total})</span>
                </div>
                <Progress value={(progress.done / progress.total) * 100} />
              </div>
            )}

            {phase === "processing" && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm">Processando leitura óptica... isso pode levar alguns minutos.</span>
              </div>
            )}

            {phase === "done" && summary && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertTitle>Lote processado</AlertTitle>
                <AlertDescription className="space-y-3">
                  <div className="flex gap-2">
                    <Badge variant="default">{summary.ok} OK</Badge>
                    {summary.failed > 0 && <Badge variant="destructive">{summary.failed} com erro</Badge>}
                    <Badge variant="secondary">{summary.total} total</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => navigate(`/omr/review/${templateId}`)}>
                      Ir para revisão
                    </Button>
                    <Button variant="outline" onClick={() => { setFiles([]); setPhase("idle"); setSummary(null); }}>
                      Enviar mais scans
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {phase === "idle" && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  As imagens são armazenadas com segurança e enviadas à OMR API via URLs assinadas. Apenas você e a equipe autenticada têm acesso.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default OmrUpload;