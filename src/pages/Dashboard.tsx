import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  FileCheck, 
  FolderOpen, 
  History, 
  BarChart3,
  BookOpen,
  Edit3,
  TrendingUp,
  Users,
  LogOut 
} from "lucide-react";
import FlemingLogo from "@/components/FlemingLogo";
import { User } from "@supabase/supabase-js";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logout realizado",
      description: "Até logo!",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  const actionCards = [
    {
      title: "Corrigir Prova",
      description: "Comece uma nova correção de prova",
      icon: FileCheck,
      path: "/correct",
      gradient: "from-primary to-accent",
    },
    {
      title: "Gerenciar Gabaritos",
      description: "Crie e gerencie gabaritos de provas",
      icon: FolderOpen,
      path: "/templates",
      gradient: "from-accent to-secondary",
    },
    {
      title: "Histórico",
      description: "Veja todas as correções realizadas",
      icon: History,
      path: "/history",
      gradient: "from-secondary to-primary",
    },
    {
      title: "Boletins",
      description: "Gere boletins de desempenho dos alunos",
      icon: BarChart3,
      path: "/boletins",
      gradient: "from-primary/80 to-accent/80",
    },
    {
      title: "Disciplinas",
      description: "Cadastre disciplinas e conteúdos",
      icon: BookOpen,
      path: "/disciplines",
      gradient: "from-accent/80 to-secondary/80",
    },
    {
      title: "Editar Respostas",
      description: "Edite respostas de alunos por matrícula",
      icon: Edit3,
      path: "/students/edit",
      gradient: "from-primary to-secondary",
    },
    {
      title: "Análise de Desempenho",
      description: "Compare resultados e evolução dos alunos",
      icon: TrendingUp,
      path: "/students/performance",
      gradient: "from-accent to-primary",
    },
    {
      title: "Cadastro de Alunos",
      description: "Gerencie nome, matrícula, sede e língua",
      icon: Users,
      path: "/students",
      gradient: "from-secondary to-accent",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <FlemingLogo size="md" />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            Bem-vindo ao Sistema Fleming
          </h2>
          <p className="text-muted-foreground">
            Escolha uma ação abaixo para começar
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {actionCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card 
                key={card.path}
                className="cursor-pointer hover:shadow-lg transition-all duration-300 group"
                onClick={() => navigate(card.path)}
              >
                <CardHeader>
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="ghost" className="w-full">
                    Acessar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
