import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRolosOnboardingProgress } from "@/hooks/useRolosOnboardingProgress";
import { Loader2 } from "lucide-react";

interface RequirementLegendProps {
  mandatoryOutstanding: number;
  mandatoryTotal: number;
  recommendedOutstanding: number;
  recommendedTotal: number;
  /**
   * When provided, the legend also reports the channel onboarding gate. Field
   * requirements alone can be "all complete" while the channel wizard still
   * blocks on state checks (publish, keys, currency, coverage, quality), so the
   * legend must not imply the property is ready.
   */
  propertyId?: string | null;
  className?: string;
}

/**
 * Legend for the field-level readiness highlighting used across the property
 * editing surfaces. Pink = mandatory (blocks activation), blue = nice-to-have,
 * plus the channel gate so this strip can never disagree with the wizard.
 */
export const RequirementLegend: React.FC<RequirementLegendProps> = ({
  mandatoryOutstanding,
  mandatoryTotal,
  recommendedOutstanding,
  recommendedTotal,
  propertyId,
  className,
}) => {
  const { macros, overall, isLoading } = useRolosOnboardingProgress(propertyId ?? null);

  const channel = useMemo(() => {
    if (!propertyId) return null;
    const outstanding = macros.filter((m) => !m.complete);
    const labels = outstanding.flatMap((m) =>
      m.outstandingLabels.map((l) => `${m.macro.label ?? m.macro.key}: ${l}`),
    );
    return {
      stepsOutstanding: outstanding.length,
      stepsTotal: macros.length,
      labels,
      ready: overall.readyToConnect,
    };
  }, [macros, overall.readyToConnect, propertyId]);

  if (mandatoryTotal === 0 && recommendedTotal === 0 && !channel) return null;

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
        <span className="font-medium">Mandatory fields</span>
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

      {channel && (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    isLoading
                      ? "bg-muted-foreground/40"
                      : channel.ready
                        ? "bg-emerald-500"
                        : "bg-amber-500",
                  )}
                  aria-hidden
                />
                <span className="font-medium">Channel gate</span>
                <span
                  className={cn(
                    "text-muted-foreground",
                    !isLoading && !channel.ready && "text-amber-600",
                  )}
                >
                  {isLoading ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> checking
                    </span>
                  ) : channel.ready ? (
                    "cleared"
                  ) : (
                    `${channel.stepsOutstanding} of ${channel.stepsTotal} step${
                      channel.stepsOutstanding === 1 ? "" : "s"
                    } blocking`
                  )}
                </span>
              </span>
            </TooltipTrigger>
            {!isLoading && channel.labels.length > 0 && (
              <TooltipContent side="bottom" className="max-w-[320px] text-[11px]">
                <p className="mb-1 font-medium">Channel wizard is still blocking on:</p>
                <ul className="list-disc pl-3.5 space-y-0.5">
                  {channel.labels.slice(0, 8).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                {channel.labels.length > 8 && (
                  <p className="mt-1 text-muted-foreground">+{channel.labels.length - 8} more</p>
                )}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}

      <span className="text-muted-foreground">Completed fields fade to a thin outline.</span>
    </div>
  );
};

export default RequirementLegend;
