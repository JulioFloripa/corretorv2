import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, Target, TrendingUp, TrendingDown, BarChart3, Percent } from "lucide-react";

import { PerformanceStats } from "@/lib/performance-stats";

interface PerformanceOverviewProps {
  stats: PerformanceStats;
  studentName: string;
}

const PerformanceOverview = ({ stats, studentName }: PerformanceOverviewProps) => {
  const getTrendIcon = () => {
    if (stats.trend > 5) return <TrendingUp className="h-5 w-5 text-primary" />;
    if (stats.trend < -5) return <TrendingDown className="h-5 w-5 text-destructive" />;
    return <BarChart3 className="h-5 w-5 text-accent" />;
  };

  const getTrendLabel = () => {
    if (stats.trend > 5) return "Melhorando";
    if (stats.trend < -5) return "Piorando";
    return "Estável";
  };

  const getTrendColor = () => {
    if (stats.trend > 5) return "text-primary";
    if (stats.trend < -5) return "text-destructive";
    return "text-accent";
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">{studentName}</h2>
        <p className="text-muted-foreground">Análise de desempenho geral</p>
      </div>

      <div className="overview-cards-grid grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Provas</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalExams}</div>
            <p className="text-xs text-muted-foreground">
              Provas realizadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Média Geral</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {stats.averagePercentage.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Desempenho médio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Melhor Nota</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {stats.bestScore.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Maior desempenho
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pior Nota</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats.worstScore.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Menor desempenho
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tendência</CardTitle>
            {getTrendIcon()}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getTrendColor()}`}>
              {getTrendLabel()}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.trend > 0 ? "+" : ""}{stats.trend.toFixed(1)}% em relação à média
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Melhoria</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.improvementRate >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {stats.improvementRate > 0 ? "+" : ""}{stats.improvementRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Primeira vs. Última prova
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PerformanceOverview;
