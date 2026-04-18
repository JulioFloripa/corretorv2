import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ExamData {
  name: string;
  nota: number;
  data: string;
  index: number;
}

interface PerformanceChartProps {
  data: ExamData[];
  type: "bar" | "line";
}

const PerformanceChart = ({ data, type }: PerformanceChartProps) => {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold">{payload[0].payload.name}</p>
          <p className="text-sm text-muted-foreground">{payload[0].payload.data}</p>
          <p className="text-lg font-bold text-primary">
            {payload[0].value.toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  if (type === "bar") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Desempenho por Prova</CardTitle>
          <CardDescription>
            Comparação de notas em todas as provas realizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="index"
                label={{ value: "Prova", position: "insideBottom", offset: -5 }}
                className="text-xs"
              />
              <YAxis
                label={{ value: "Percentual (%)", angle: -90, position: "insideLeft" }}
                domain={[0, 100]}
                className="text-xs"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar
                dataKey="nota"
                fill="hsl(var(--primary))"
                name="Nota (%)"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolução Temporal</CardTitle>
        <CardDescription>
          Linha do tempo mostrando a evolução do desempenho
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="index"
              label={{ value: "Prova", position: "insideBottom", offset: -5 }}
              className="text-xs"
            />
            <YAxis
              label={{ value: "Percentual (%)", angle: -90, position: "insideLeft" }}
              domain={[0, 100]}
              className="text-xs"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="nota"
              stroke="hsl(var(--primary))"
              strokeWidth={3}
              name="Nota (%)"
              dot={{ fill: "hsl(var(--primary))", r: 6 }}
              activeDot={{ r: 8 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default PerformanceChart;
