import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Pencil } from "lucide-react";
import { examTypeLabel } from "@/lib/exam-presets";

interface Template {
  id: string;
  name: string;
  exam_type: string;
  total_questions: number;
}

interface Props {
  /** Etapa atual: enroll | generate | upload | review | done */
  step: "enroll" | "generate" | "upload" | "review" | "done";
  /** Título da etapa exibido no header */
  title: string;
  /** templateId selecionado (pode ser undefined quando o usuário ainda não escolheu). */
  templateId?: string;
}

/**
 * Cabeçalho compartilhado pelas telas do fluxo OMR.
 * - Mostra um Select com todas as provas disponíveis.
 * - Trocar a prova navega para a mesma etapa com o novo templateId.
 * - Botão "Editar gabarito" só aparece quando há prova selecionada.
 */
const OmrStepHeader = ({ step, title, templateId }: Props) => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("templates")
        .select("id, name, exam_type, total_questions")
        .order("created_at", { ascending: false });
      setTemplates(data || []);
      setLoading(false);
    })();
  }, []);

  const onSelect = (newId: string) => {
    if (!newId || newId === templateId) return;
    navigate(`/omr/${step}/${newId}`);
  };

  return (
    <header className="border-b bg-card">
      {/* Linha 1: navegação e título */}
      <div className="container mx-auto px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/omr")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h1 className="flex-1 text-xl font-bold leading-tight">{title}</h1>
        {templateId && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/templates/${templateId}`)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar gabarito
          </Button>
        )}
      </div>

      {/* Linha 2: seletor de prova em destaque */}
      <div className="border-t bg-muted/40">
        <div className="container mx-auto px-4 py-2 flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Prova:</span>
          <Select value={templateId || ""} onValueChange={onSelect} disabled={loading}>
            <SelectTrigger className="flex-1 max-w-lg bg-background">
              <SelectValue placeholder={loading ? "Carregando provas..." : "Selecione uma prova para continuar"} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} • {examTypeLabel(t.exam_type)} • {t.total_questions}q
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </header>
  );
};

export default OmrStepHeader;

/** Estado vazio padrão para uma etapa OMR quando ainda não há prova selecionada. */
export const OmrEmptyState = ({ stepLabel }: { stepLabel: string }) => (
  <main className="container mx-auto px-4 py-16 max-w-2xl text-center space-y-2">
    <h2 className="text-lg font-semibold">Nenhuma prova selecionada</h2>
    <p className="text-sm text-muted-foreground">
      Use o seletor "Prova:" na barra acima para escolher um simulado e acessar a etapa "{stepLabel}".
    </p>
  </main>
);