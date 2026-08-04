import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Gauge, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface QualityCheckResult {
  id: string;
  name: string;
  passed: boolean;
  severity: "blocker" | "warning" | "info";
}

interface ActivationReadinessResponse {
  passed: boolean;
  score: number;
  mandatory_score?: number;
  mandatory_passed?: number;
  mandatory_total?: number;
  recommended_score?: number;
  recommended_passed?: number;
  recommended_total?: number;
  blockers: QualityCheckResult[];
  warnings: QualityCheckResult[];
  checks: QualityCheckResult[];
}

interface RolosReadinessScoreBadgeProps {
  propertyId: string;
  className?: string;
}

/**
 * Readiness score surfaced inside the Offerings frame for ROL'OS-managed properties.
 * Clicking through opens the ROL'OS property setup wizard for the same property so the
 * remaining setup can be completed and reviewed in one place.
 */
export function RolosReadinessScoreBadge({ propertyId, className }: RolosReadinessScoreBadgeProps) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["activation-readiness", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("check-activation-readiness", {
        body: { property_id: propertyId },
      });
      if (error) throw error;
      return data as ActivationReadinessResponse;
    },
    enabled: !!propertyId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const tone = useMemo(() => {
    const score = data?.mandatory_score ?? data?.score ?? 0;
    if (data?.passed || score >= 90) return "text-emerald-600";
    if (score >= 60) return "text-amber-600";
    return "text-destructive";
  }, [data?.passed, data?.score]);

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking readiness…
      </div>
    );
  }

  if (!data) return null;

  const blockers = data.blockers?.length ?? 0;

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
        <div className="flex items-center gap-2 min-w-0">
          <Gauge className={cn("h-4 w-4", tone)} />
          <span className="text-xs font-medium">Readiness score to be pushed</span>
          <Badge variant="secondary" className={cn("text-[10px]", tone)}>
            Mandatory {data.mandatory_score ?? data.score}%
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            Nice to have {data.recommended_score ?? 100}%
          </Badge>
          {blockers > 0 && (
            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">
              {blockers} blocker{blockers === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
          Continue setup
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <div className="mt-2 space-y-1">
        <Progress value={data.mandatory_score ?? data.score} className="h-1.5" />
        <Progress value={data.recommended_score ?? 100} className="h-1" />
      </div>
    </button>
  );
}
