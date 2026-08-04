import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Gauge, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePropertyReadiness } from "@/hooks/usePropertyReadiness";

interface RolosReadinessScoreBadgeProps {
  propertyId: string;
  className?: string;
}

/**
 * Readiness score surfaced inside the Offerings frame for ROL'OS-managed properties.
 * Reads the unified readiness model, so the percentages here always match the
 * "N of M outstanding" field-highlighting counters and the setup checksheet.
 */
export function RolosReadinessScoreBadge({ propertyId, className }: RolosReadinessScoreBadgeProps) {
  const navigate = useNavigate();
  const {
    isLoading,
    hasData,
    passed,
    mandatoryScore,
    mandatoryPassed,
    mandatoryTotal,
    mandatoryOutstanding,
    recommendedScore,
    recommendedPassed,
    recommendedTotal,
  } = usePropertyReadiness(propertyId);

  const tone = useMemo(() => {
    if (passed) return "text-emerald-600";
    if (mandatoryScore >= 60) return "text-amber-600";
    return "text-destructive";
  }, [mandatoryScore, passed]);

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking readiness…
      </div>
    );
  }

  if (!hasData) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/pms/property-setup?property=${propertyId}`)}
      className={cn(
        "group w-full text-left rounded-md border px-3 py-2 transition-colors hover:bg-muted/60",
        className,
      )}
      title="Open ROL'OS property setup to continue and review"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Gauge className={cn("h-4 w-4", tone)} />
          <span className="text-xs font-medium">Readiness score to be pushed</span>
          <Badge variant="secondary" className={cn("text-[10px]", tone)}>
            Mandatory {mandatoryScore}% · {mandatoryPassed}/{mandatoryTotal}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            Nice to have {recommendedScore}% · {recommendedPassed}/{recommendedTotal}
          </Badge>
          {mandatoryOutstanding > 0 && (
            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">
              {mandatoryOutstanding} outstanding
            </Badge>
          )}
        </div>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
          Continue setup
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <div className="mt-2 space-y-1">
        <Progress value={mandatoryScore} className="h-1.5" />
        <Progress value={recommendedScore} className="h-1" />
      </div>
    </button>
  );
}

export default RolosReadinessScoreBadge;
