import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StudentSearchProps {
  onSearch: (studentId: string) => void;
  loading?: boolean;
}

const StudentSearch = ({ onSearch, loading = false }: StudentSearchProps) => {
  const [studentId, setStudentId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (studentId.trim()) {
      onSearch(studentId.trim());
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buscar Aluno</CardTitle>
        <CardDescription>
          Digite o número de matrícula do aluno para visualizar suas provas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="text"
            placeholder="Ex: 12345"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !studentId.trim()}>
            <Search className="h-4 w-4 mr-2" />
            Buscar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default StudentSearch;
