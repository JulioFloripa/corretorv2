import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Pencil } from "lucide-react";

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
      <div className="container mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/omr")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex-1 min-w-[180px]">
          <h1 className="text-xl font-bold leading-tight">{title}</h1>
          <p className="text-xs text-muted-foreground">Selecione a prova para esta etapa</p>
        </div>
        <div className="w-full md:w-80">
          <Select value={templateId || ""} onValueChange={onSelect} disabled={loading}>
            <SelectTrigger>
              <SelectValue placeholder={loading ? "Carregando provas..." : "Selecione uma prova"} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} • {t.exam_type.toUpperCase()} • {t.total_questions}q
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {templateId && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/templates/${templateId}`)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar gabarito
          </Button>
        )}
      </div>
    </header>
  );
};

export default OmrStepHeader;

/** Estado vazio padrão para uma etapa OMR quando ainda não há prova selecionada. */
export const OmrEmptyState = ({ stepLabel }: { stepLabel: string }) => (
  <main className="container mx-auto px-4 py-16 max-w-2xl text-center space-y-2">
    <h2 className="text-lg font-semibold">Selecione uma prova acima</h2>
    <p className="text-sm text-muted-foreground">
      Escolha um simulado no seletor para acessar a etapa "{stepLabel}".
    </p>
  </main>
);