import { useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CHECK_TO_FIELD_KEYS } from "@/config/propertyFieldRequirements";
import { focusRequirementField } from "@/lib/requirementFocus";

export interface ReadinessCheck {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
  fix?: string;
  severity: "blocker" | "warning" | "info";
  tier?: "mandatory" | "recommended";
  section?: string;
  section_label?: string;
  surface?: "rolos" | "admin";
}

export interface ReadinessResponse {
  passed: boolean;
  score: number;
  mandatory_score?: number;
  mandatory_total?: number;
  mandatory_passed?: number;
  recommended_score?: number;
  recommended_total?: number;
  recommended_passed?: number;
  blockers: ReadinessCheck[];
  warnings: ReadinessCheck[];
  checks: ReadinessCheck[];
}

interface RolosReadinessChecklistProps {
  propertyId: string;
  /** Called when a shortfall inside this hub is clicked (switches the local section) */
  onNavigateSection?: (section: string) => void;
  className?: string;
}

function toneFor(score: number) {
  if (score >= 100) return "text-emerald-600";
  if (score >= 70) return "text-amber-600";
  return "text-destructive";
}

/**
 * ROL'OS readiness checksheet: scores mandatory (activation-blocking) and
 * nice-to-have requirements separately and deep-links each shortfall to the
 * exact section where it is fixed.
 */
export function RolosReadinessChecklist({
  propertyId,
  onNavigateSection,
  className,
}: RolosReadinessChecklistProps) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["activation-readiness", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("check-activation-readiness", {
        body: { property_id: propertyId },
      });
      if (error) throw error;
      return data as ReadinessResponse;
    },
    enabled: !!propertyId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const goToFix = useCallback(
    (check: ReadinessCheck) => {
      const section = check.section;
      if (!section) return;
      const focusKey = CHECK_TO_FIELD_KEYS[check.id]?.[0];
      if (check.surface === "admin") {
        navigate(
          `/admin/properties/${propertyId}?tab=${section}${focusKey ? `&focus=${focusKey}` : ""}`,
        );
        return;
      }
      if (onNavigateSection) {
        onNavigateSection(section);
      } else {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("section", section);
            if (focusKey) next.set("focus", focusKey);
            return next;
          },
          { replace: true },
        );
      }
      if (focusKey) {
        // Give the section a beat to mount, then scroll + pulse the exact field.
        window.setTimeout(() => focusRequirementField(focusKey), 350);
      }
    },
    [navigate, onNavigateSection, propertyId, setSearchParams],
  );

  const groups = useMemo(() => {
    const checks = data?.checks ?? [];
    return {
      mandatory: checks.filter((c) => (c.tier ?? (c.severity === "blocker" ? "mandatory" : "recommended")) === "mandatory"),
      recommended: checks.filter((c) => (c.tier ?? (c.severity === "blocker" ? "mandatory" : "recommended")) === "recommended"),
    };
  }, [data?.checks]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Building readiness checksheet…
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const mandatoryScore = data.mandatory_score ?? (data.passed ? 100 : 0);
  const recommendedScore = data.recommended_score ?? 100;

  const renderRow = (check: ReadinessCheck) => {
    const clickable = !check.passed && !!check.section;
    return (
      <li
        key={`${check.tier}-${check.id}`}
        className={cn(
          "flex items-start justify-between gap-3 rounded-md border px-3 py-2",
          check.passed ? "border-border/60" : "border-destructive/30 bg-destructive/5",
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          {check.passed ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                check.tier === "mandatory" ? "text-destructive" : "text-amber-600",
              )}
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium">{check.name}</p>
            {check.message && (
              <p className="text-[11px] leading-tight text-muted-foreground">{check.message}</p>
            )}
            {!check.passed && check.fix && (
              <p className="text-[11px] leading-tight text-muted-foreground">Fix: {check.fix}</p>
            )}
          </div>
        </div>
        {clickable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 text-[11px]"
            onClick={() => goToFix(check)}
          >
            {check.section_label ?? "Open section"}
            {check.surface === "admin" ? (
              <ExternalLink className="h-3 w-3" />
            ) : (
              <ArrowRight className="h-3 w-3" />
            )}
          </Button>
        )}
      </li>
    );
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gauge className="h-4 w-4" /> Readiness checksheet
          </CardTitle>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-[11px]"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} /> Re-check
          </Button>
        </div>
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium">Mandatory</span>
              <span className={cn("font-semibold", toneFor(mandatoryScore))}>
                {mandatoryScore}% · {data.mandatory_passed ?? 0}/{data.mandatory_total ?? 0}
              </span>
            </div>
            <Progress value={mandatoryScore} className="mt-1 h-1.5" />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Must all pass before activation / channel push.
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-medium">
                <Sparkles className="h-3 w-3" /> Nice to have
              </span>
              <span className={cn("font-semibold", toneFor(recommendedScore))}>
                {recommendedScore}% · {data.recommended_passed ?? 0}/{data.recommended_total ?? 0}
              </span>
            </div>
            <Progress value={recommendedScore} className="mt-1 h-1.5" />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Quality lift for conversion and OTA ranking.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Mandatory requirements
            </p>
            {data.passed && (
              <Badge variant="secondary" className="text-[10px] text-emerald-600">
                All clear
              </Badge>
            )}
          </div>
          <ul className="space-y-1.5">{groups.mandatory.map(renderRow)}</ul>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Nice to have
          </p>
          <ul className="space-y-1.5">{groups.recommended.map(renderRow)}</ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default RolosReadinessChecklist;
