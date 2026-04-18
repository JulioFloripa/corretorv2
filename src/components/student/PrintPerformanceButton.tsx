import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const PrintPerformanceButton = () => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <Button variant="outline" onClick={handlePrint} className="print:hidden">
      <Printer className="h-4 w-4 mr-2" />
      Imprimir Relatório
    </Button>
  );
};

export default PrintPerformanceButton;
