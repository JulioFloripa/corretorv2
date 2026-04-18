import { useState, useEffect } from "react";
import { Search, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchFilters } from "@/lib/student-queries";

interface StudentSearchAdvancedProps {
  onSearch: (searchTerm: string, filters?: SearchFilters) => void;
  examTypes?: string[];
  loading?: boolean;
}

const StudentSearchAdvanced = ({ onSearch, examTypes = [], loading = false }: StudentSearchAdvancedProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});

  // Debounce da busca
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(searchTerm, filters);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, filters]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setFilters({});
    onSearch("", {});
  };

  const hasActiveFilters = searchTerm || filters.examType || filters.dateFrom || filters.dateTo;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Busca principal */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar por nome, matrícula ou prova..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={loading}
                className="pl-10"
              />
            </div>
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? "bg-accent" : ""}
            >
              <Filter className="h-4 w-4" />
            </Button>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearFilters}
                disabled={loading}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Filtros avançados */}
          {showFilters && (
            <div className="grid gap-4 md:grid-cols-3 p-4 bg-muted/50 rounded-lg">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Tipo de Prova
                </label>
                <Select
                  value={filters.examType || "all"}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      examType: value === "all" ? undefined : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    {examTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Data Inicial
                </label>
                <Input
                  type="date"
                  value={filters.dateFrom || ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      dateFrom: e.target.value || undefined,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Data Final
                </label>
                <Input
                  type="date"
                  value={filters.dateTo || ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      dateTo: e.target.value || undefined,
                    }))
                  }
                />
              </div>
            </div>
          )}

          {/* Indicador de filtros ativos */}
          {hasActiveFilters && (
            <div className="text-sm text-muted-foreground">
              {searchTerm && (
                <span>Buscando por: <strong>{searchTerm}</strong></span>
              )}
              {filters.examType && (
                <span className="ml-2">• Tipo: <strong>{filters.examType}</strong></span>
              )}
              {(filters.dateFrom || filters.dateTo) && (
                <span className="ml-2">• Período filtrado</span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StudentSearchAdvanced;
