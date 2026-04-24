import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, ClipboardEdit, History, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const Index = () => {
  const navigate = useNavigate();

  const actionCards = [
    {
      title: "Corrigir Prova",
      description: "Faça upload de planilha e corrija provas automaticamente",
      icon: FileSpreadsheet,
      action: "/corrigir",
      variant: "primary" as const,
    },
    {
      title: "Gerenciar Gabaritos",
      description: "Cadastre e edite gabaritos de provas",
      icon: ClipboardEdit,
      action: "/gabaritos",
      variant: "secondary" as const,
    },
    {
      title: "Histórico",
      description: "Visualize correções anteriores e reprocesse resultados",
      icon: History,
      action: "/historico",
      variant: "secondary" as const,
    },
    {
      title: "Relatórios",
      description: "Análises detalhadas por aluno, questão e turma",
      icon: TrendingUp,
      action: "/relatorios",
      variant: "secondary" as const,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-lg">
              F
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Fleming</h1>
              <p className="text-xs text-muted-foreground">Sistema de Correção</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/auth")}>
            Login
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Correção Inteligente de Provas</h2>
          <p className="text-lg text-muted-foreground">
            Corrija provas de ENEM, UFSC, ACAFE e provas internas com precisão e rapidez. Gere relatórios detalhados e
            imprima boletins personalizados.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {actionCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <Card
                key={index}
                className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer border-border/50"
              >
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant={card.variant} className="w-full" onClick={() => console.log(card.action)}>
                    Acessar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Features Grid */}
        <div className="mt-16 max-w-5xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-8 text-foreground">Funcionalidades Principais</h3>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet className="w-8 h-8 text-primary" />
              </div>
              <h4 className="font-semibold mb-2 text-foreground">Upload de Planilhas</h4>
              <p className="text-sm text-muted-foreground">Importe respostas de centenas de alunos em segundos</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <ClipboardEdit className="w-8 h-8 text-primary" />
              </div>
              <h4 className="font-semibold mb-2 text-foreground">Correção Automática</h4>
              <p className="text-sm text-muted-foreground">Questões objetivas, somatório UFSC e abertas numéricas</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-primary" />
              </div>
              <h4 className="font-semibold mb-2 text-foreground">Relatórios Detalhados</h4>
              <p className="text-sm text-muted-foreground">Análises por aluno, questão, turma e competências</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t mt-16 py-8 bg-card/30">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 Fleming - Sistema de Correção de Provas</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
