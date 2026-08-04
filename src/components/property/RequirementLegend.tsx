import React from "react";
import { cn } from "@/lib/utils";

interface RequirementLegendProps {
  mandatoryOutstanding: number;
  mandatoryTotal: number;
  recommendedOutstanding: number;
  recommendedTotal: number;
  className?: string;
}

/**
 * Legend for the field-level readiness highlighting used across the property
 * editing surfaces. Pink = mandatory (blocks activation), blue = nice-to-have.
 */
export const RequirementLegend: React.FC<RequirementLegendProps> = ({
  mandatoryOutstanding,
  mandatoryTotal,
  recommendedOutstanding,
  recommendedTotal,
  className,
}) => {
  if (mandatoryTotal === 0 && recommendedTotal === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[11px]",
        className,
      )}
    >
      <span className="font-medium text-muted-foreground">Field highlighting</span>
      <span className="flex items-center gap-1.5">
        <span className="pf-req-legend-dot pf-req-legend-mandatory" aria-hidden />
        <span className="font-medium">Mandatory</span>
        <span className="text-muted-foreground">
          {mandatoryOutstanding === 0
            ? "all complete"
            : `${mandatoryOutstanding} of ${mandatoryTotal} outstanding`}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="pf-req-legend-dot pf-req-legend-recommended" aria-hidden />
        <span className="font-medium">Nice to have</span>
        <span className="text-muted-foreground">
          {recommendedOutstanding === 0
            ? "all complete"
            : `${recommendedOutstanding} of ${recommendedTotal} outstanding`}
        </span>
      </span>
      <span className="text-muted-foreground">Completed fields fade to a thin outline.</span>
    </div>
  );
};

export default RequirementLegend;
