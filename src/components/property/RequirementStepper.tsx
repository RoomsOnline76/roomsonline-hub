import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Crosshair, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRequirementField } from "@/lib/requirementFocus";
import type { RequirementStatus } from "@/config/propertyFieldRequirements";

interface RequirementStepperProps {
  /** Outstanding requirements in the active section, in registry order. */
  outstanding: RequirementStatus[];
  sectionLabel?: string;
  className?: string;
}

/**
 * Slim "walk me to the field" bar for the active property section. Steps through
 * every outstanding readiness field, scrolling to and pulsing each in turn.
 */
export const RequirementStepper: React.FC<RequirementStepperProps> = ({
  outstanding,
  sectionLabel,
  className,
}) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [outstanding.length, sectionLabel]);

  const jumpTo = useCallback(
    (next: number) => {
      if (outstanding.length === 0) return;
      const bounded = ((next % outstanding.length) + outstanding.length) % outstanding.length;
      setIndex(bounded);
      focusRequirementField(outstanding[bounded].key);
    },
    [outstanding],
  );

  if (outstanding.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground",
          className,
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        Nothing outstanding on {sectionLabel ? `“${sectionLabel}”` : "this section"}.
      </div>
    );
  }

  const current = outstanding[index];
  const mandatoryCount = outstanding.filter((o) => o.tier === "mandatory").length;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5",
        "pf-req-stepper",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-[11px]">
        <Crosshair className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold">
          {outstanding.length} outstanding{sectionLabel ? ` on ${sectionLabel}` : ""}
        </span>
        {mandatoryCount > 0 && (
          <span className="text-muted-foreground">
            · {mandatoryCount} mandatory
          </span>
        )}
        <span className="truncate text-muted-foreground">
          → {index + 1}/{outstanding.length}: {current.label}
          {current.hint ? ` — ${current.hint}` : ""}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={() => jumpTo(index - 1)}
        >
          <ChevronLeft className="h-3 w-3" /> Previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[11px]"
          onClick={() => jumpTo(index)}
        >
          Show me
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={() => jumpTo(index + 1)}
        >
          Next <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

export default RequirementStepper;

