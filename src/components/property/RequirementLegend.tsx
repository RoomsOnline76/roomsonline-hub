import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRolosOnboardingProgress } from "@/hooks/useRolosOnboardingProgress";
import { Loader2 } from "lucide-react";
import { focusRequirementField } from "@/lib/requirementFocus";

/** The channel gate is the five Ready-to-sell steps only. */
const READY_TO_SELL_KEYS = ["identity", "location", "rooms", "media", "commercial"];

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

  const readyMacros = useMemo(
    () => macros.filter((m) => READY_TO_SELL_KEYS.includes(m.macro.key)),
    [macros],
  );

  const channel = useMemo(() => {
    if (!propertyId) return null;
    const outstanding = readyMacros.filter((m) => !m.complete);
    const labels = outstanding.flatMap((m) =>
      m.outstandingLabels.map((l) => `${m.macro.title}: ${l}`),
    );
    return {
      stepsOutstanding: outstanding.length,
      stepsTotal: readyMacros.length,
      labels,
      ready: overall.readyToSell,
    };
  }, [readyMacros, overall.readyToSell, propertyId]);

  /**
   * The legend must count exactly what the wizard counts. When the wizard is
   * available we derive the field totals from the macro steps (deduplicated by
   * requirement key) instead of the raw readiness registry, so the strip can
   * never report "all complete" while the wizard still lists due fields.
   */
  const counts = useMemo(() => {
    if (!propertyId || readyMacros.length === 0) {
      return {
        mandatoryOutstanding,
        mandatoryTotal,
        recommendedOutstanding,
        recommendedTotal,
      };
    }
    const seen = new Set<string>();
    let mT = 0;
    let mO = 0;
    let rT = 0;
    let rO = 0;
    for (const m of readyMacros) {
      for (const item of m.fieldItems) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        if (item.tier === "mandatory") {
          mT += 1;
          if (!item.satisfied) mO += 1;
        } else {
          rT += 1;
          if (!item.satisfied) rO += 1;
        }
      }
    }
    return {
      mandatoryOutstanding: mO,
      mandatoryTotal: mT,
      recommendedOutstanding: rO,
      recommendedTotal: rT,
    };
  }, [readyMacros, mandatoryOutstanding, mandatoryTotal, propertyId, recommendedOutstanding, recommendedTotal]);

  /**
   * A bare count ("1 outstanding") is unactionable, so the legend also names the
   * outstanding mandatory fields. Each chip routes to the control that owns it.
   */
  const outstandingFields = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; label: string; hint?: string; section?: string }[] = [];
    for (const m of readyMacros) {
      for (const item of m.fieldItems) {
        if (item.tier !== "mandatory" || item.satisfied) continue;
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        out.push({
          key: item.key,
          label: item.label,
          hint: item.requirement?.hint ?? item.fix ?? item.message,
          section: item.sectionLabel ?? item.section,
        });
      }
    }
    return out;
  }, [readyMacros]);

  if (counts.mandatoryTotal === 0 && counts.recommendedTotal === 0 && !channel) return null;


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
          {isLoading
            ? "checking…"
            : counts.mandatoryOutstanding === 0
              ? "all complete"
              : `${counts.mandatoryOutstanding} of ${counts.mandatoryTotal} outstanding`}
        </span>
      </span>
      {!isLoading && outstandingFields.length > 0 && (
        <TooltipProvider delayDuration={100}>
          <span className="flex flex-wrap items-center gap-1">
            {outstandingFields.map((f) => (
              <Tooltip key={f.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => focusRequirementField(f.key)}
                    className="pf-req-count-mandatory rounded border px-1.5 text-[10px] font-medium leading-4 hover:opacity-80"
                  >
                    {f.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[280px] text-[11px]">
                  {f.section && <p className="font-medium">{f.section}</p>}
                  <p className="text-muted-foreground">{f.hint ?? "Click to jump to this field."}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </span>
        </TooltipProvider>
      )}
      <span className="flex items-center gap-1.5">
        <span className="pf-req-legend-dot pf-req-legend-recommended" aria-hidden />
        <span className="font-medium">Nice to have</span>
        <span className="text-muted-foreground">
          {isLoading
            ? "checking…"
            : counts.recommendedOutstanding === 0
              ? "all complete"
              : `${counts.recommendedOutstanding} of ${counts.recommendedTotal} outstanding`}
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
                <span className="font-medium">Channel gate (steps 1–5)</span>
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
                <p className="mb-1 font-medium">Ready-to-sell steps still blocking:</p>
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
