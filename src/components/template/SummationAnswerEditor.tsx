import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getPropositionValues, decomposeSum } from "@/lib/ufsc-scoring";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ListChecks } from "lucide-react";

interface SummationAnswerEditorProps {
  value: string; // the sum as string
  numPropositions: number;
  onChange: (newSum: string) => void;
}

const SummationAnswerEditor = ({ value, numPropositions, onChange }: SummationAnswerEditorProps) => {
  const currentSum = parseInt(value) || 0;
  const selectedProps = decomposeSum(currentSum);
  const allValues = getPropositionValues(numPropositions);
  const maxSum = allValues.reduce((a, b) => a + b, 0);

  const toggleProposition = (propValue: number) => {
    let newSelected: number[];
    if (selectedProps.includes(propValue)) {
      newSelected = selectedProps.filter(v => v !== propValue);
    } else {
      newSelected = [...selectedProps, propValue];
    }
    const newSum = newSelected.reduce((a, b) => a + b, 0);
    onChange(String(newSum));
  };

  const handleManualInput = (raw: string) => {
    const parsed = Math.min(maxSum, Math.max(0, parseInt(raw) || 0));
    onChange(String(parsed));
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        className="h-8 w-14 font-mono text-center px-1"
        type="number"
        min={0}
        max={maxSum}
        value={currentSum}
        onChange={(e) => handleManualInput(e.target.value)}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Marcar proposições">
            <ListChecks className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Proposições corretas (soma: {currentSum.toString().padStart(2, '0')})
            </p>
            {allValues.map((propVal) => (
              <div key={propVal} className="flex items-center gap-2">
                <Checkbox
                  id={`prop-${propVal}`}
                  checked={selectedProps.includes(propVal)}
                  onCheckedChange={() => toggleProposition(propVal)}
                />
                <Label htmlFor={`prop-${propVal}`} className="text-sm font-mono cursor-pointer">
                  {propVal.toString().padStart(2, '0')}
                </Label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default SummationAnswerEditor;
