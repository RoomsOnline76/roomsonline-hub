import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  label: string;
  number: number;
}

interface FluentStepIndicatorProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

/**
 * Numbered step dots with active/completed states.
 * Matches the InlineCheckoutPanel style: numbered circles with labels.
 */
export function FluentStepIndicator({ steps, currentStep, className }: FluentStepIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {steps.map((step, i) => {
        const isCompleted = currentStep > step.number;
        const isActive = currentStep === step.number;

        return (
          <div key={step.number} className="flex items-center gap-2">
            {i > 0 && (
              <div className={cn(
                "h-px w-6 sm:w-10 transition-colors",
                isCompleted ? "bg-primary" : "bg-border"
              )} />
            )}
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "h-6 w-6 rounded-full text-xs font-semibold flex items-center justify-center transition-colors",
                isActive && "bg-primary text-primary-foreground",
                isCompleted && "bg-primary text-primary-foreground",
                !isActive && !isCompleted && "bg-muted text-muted-foreground"
              )}>
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : step.number}
              </span>
              <span className={cn(
                "text-xs font-medium hidden sm:inline",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}>
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
