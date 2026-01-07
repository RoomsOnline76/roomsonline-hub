import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GuestCountStepperProps {
  label: string;
  sublabel?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  className?: string;
}

export function GuestCountStepper({
  label,
  sublabel,
  value,
  min = 0,
  max = 10,
  onChange,
  className,
}: GuestCountStepperProps) {
  const handleDecrement = () => {
    if (value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  return (
    <div className={cn("flex items-center justify-between py-3", className)}>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {sublabel && (
          <span className="text-xs text-muted-foreground">{sublabel}</span>
        )}
      </div>
      
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleDecrement}
          disabled={value <= min}
          className={cn(
            "h-11 w-11 rounded-full border-border/60 transition-all duration-200",
            "hover:border-primary/50 hover:bg-primary/5",
            "disabled:opacity-30 disabled:cursor-not-allowed"
          )}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-4 w-4" />
        </Button>
        
        <span className="w-8 text-center text-lg font-medium tabular-nums">
          {value}
        </span>
        
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleIncrement}
          disabled={value >= max}
          className={cn(
            "h-11 w-11 rounded-full border-border/60 transition-all duration-200",
            "hover:border-primary/50 hover:bg-primary/5",
            "disabled:opacity-30 disabled:cursor-not-allowed"
          )}
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
