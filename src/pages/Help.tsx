import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, FileCheck, ScanLine, History, TrendingUp,
  BarChart3, PenLine, FolderOpen, Users, GraduationCap, BookOpen,
  UserPlus, FileText, Upload, ClipboardCheck, CheckCircle2,
  ArrowRight, HelpCircle, Lightbulb, MapIcon,
} from "lucide-react";

const steps = [
  { icon: UserPlus, title: "Matricular Alunos", desc: "Selecione a turma ou adicione alunos individualmente à prova. Apenas alunos matriculados receberão folha de gabarito." },
  { icon: FileText, title: "Gerar Gabaritos", desc: "O sistema gera um PDF com uma folha de gabarito por aluno, contendo QR Code de identificação automática." },
  { icon: Upload, title: "Enviar Scans", desc: "Após a prova, escaneie os gabaritos preenchidos e envie as imagens. O leitor óptico detecta as marcações automaticamente." },
  { icon: ClipboardCheck, title: "Revisar Leituras", desc: "Confira as leituras automáticas. Gabaritos com problemas são destacados para correção manual." },
  { icon: CheckCircle2, title: "Resumo / Notas", desc: "Veja a cobertura de alunos, identifique faltantes e calcule as notas finais. O resultado vai direto para o Histórico." },
];

const menuItems = [
  { icon: LayoutDashboard, title: "Dashboard", group: "Início", desc: "Visão geral do sistema com resumo de provas, alunos e correções recentes." },
  { icon: FileCheck, title: "Corrigir Prova", group: "Correção", desc: "Importe respostas por planilha CSV/XLSX. Ideal para provas já tabuladas ou lançamentos manuais." },
  { icon: ScanLine, title: "Leitura Óptica", group: "Correção", desc: "Fluxo completo de leitura óptica: matricular alunos, gerar gabaritos, escanear, revisar e calcular notas." },
  { icon: History, title: "Histórico", group: "Resultados", desc: "Todas as correções realizadas. Permite editar notas individuais e recalcular resultados." },
  { icon: TrendingUp, title: "Análise de Desempenho", group: "Resultados", desc: "Gráficos e estatísticas de desempenho por aluno, turma e disciplina." },
  { icon: BarChart3, title: "Boletins", group: "Resultados", desc: "Geração de boletins individuais e por turma nos formatos ACAFE e outros." },
  { icon: PenLine, title: "Notas de Redação", group: "Resultados", desc: "Digitação rápida de notas de redação por prova, com filtro por sede. Use Tab/Enter para navegar entre campos." },
  { icon: FolderOpen, title: "Provas / Gabaritos", group: "Configurações", desc: "Crie e edite provas com questões, gabaritos e configurações de pontuação. Define o modelo que será usado na leitura óptica." },
  { icon: Users, title: "Alunos", group: "Configurações", desc: "Cadastro de alunos com nome, matrícula, sede e idioma estrangeiro." },
  { icon: GraduationCap, title: "Turmas", group: "Configurações", desc: "Organize alunos em turmas para facilitar a matrícula em provas." },
  { icon: BookOpen, title: "Disciplinas", group: "Configurações", desc: "Configure as disciplinas disponíveis para vinculação com questões." },
];

const groups = ["Início", "Correção", "Resultados", "Configurações"];

const Help = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <HelpCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Central de Ajuda</h1>
              <p className="text-sm text-muted-foreground">Guia completo do Sistema Fleming</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-8">

        {/* Introdução */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              Sobre o Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none text-muted-foreground space-y-3">
            <p>
              O <strong className="text-foreground">Sistema Fleming</strong> é uma plataforma de correção de provas
              com leitura óptica de gabaritos (OMR). Ele permite criar provas, matricular alunos,
              gerar folhas de gabarito personalizadas, escanear as respostas e calcular notas
              automaticamente.
            </p>
            <p>
              O sistema suporta múltiplos formatos de prova (UFSC, ACAFE, múltipla escolha) e
              diferentes tipos de questão: múltipla escolha, somatória, numérica aberta e discursiva.
              As notas de redação podem ser digitadas manualmente e são integradas ao resultado final.
            </p>
          </CardContent>
        </Card>

        {/* Fluxo OMR */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              Fluxo de Leitura Óptica
            </CardTitle>
            <CardDescription>
              O processo de correção por leitura óptica segue 5 etapas sequenciais.
              Quando você está dentro do fluxo, o menu lateral mostra todas as etapas para navegação rápida.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={idx} className="flex gap-4 items-start">
                  <div className="flex flex-col items-center">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                      idx === steps.length - 1
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/10 text-primary"
                    }`}>
                      <step.icon className="h-5 w-5" />
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="w-px h-6 bg-border mt-1" />
                    )}
                  </div>
                  <div className="pt-1.5">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm">{idx + 1}. {step.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Dois caminhos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-primary" />
              Duas formas de corrigir
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <ScanLine className="h-4 w-4 text-primary" />
                  <h3 className="font-medium text-sm">Leitura Óptica (OMR)</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Imprima gabaritos, aplique a prova, escaneie as folhas e o sistema lê as marcações automaticamente.
                  Ideal para provas objetivas com muitos alunos.
                </p>
              </div>
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-primary" />
                  <h3 className="font-medium text-sm">Importar Planilha</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Importe respostas via CSV ou XLSX. Útil quando as respostas já foram tabuladas
                  ou para lançamentos manuais de provas antigas.
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Ambos os caminhos geram o mesmo resultado — as notas aparecem no Histórico, Boletins e Análise de Desempenho.
            </p>
          </CardContent>
        </Card>

        {/* Menu do Sistema */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapIcon className="h-5 w-5 text-primary" />
              Funcionalidades do Sistema
            </CardTitle>
            <CardDescription>
              Cada item do menu lateral e sua função.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {groups.map((group) => (
              <div key={group}>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  {group}
                </h3>
                <div className="space-y-3">
                  {menuItems
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <div key={item.title} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <item.icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">{item.title}</h4>
                          <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Dicas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              Dicas Rápidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-3">
              {[
                { title: "Atalhos na digitação", desc: "Na tela de Notas de Redação, use Tab ou Enter para pular entre campos sem tocar no mouse." },
                { title: "Filtro por sede", desc: "A tela de Notas de Redação filtra alunos por sede, para que cada coordenador digite apenas os seus." },
                { title: "Cobertura de alunos", desc: "No Resumo da prova (última etapa OMR), confira se todos os alunos matriculados tiveram gabarito escaneado." },
                { title: "Recalcular notas", desc: "Se corrigir o gabarito depois, recalcule as notas pelo Resumo da prova — os resultados são atualizados no Histórico." },
              ].map((tip, idx) => (
                <div key={idx} className="border rounded-lg p-3">
                  <h4 className="font-medium text-sm">{tip.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{tip.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </main>
    </div>
  );
};

export default Help;
