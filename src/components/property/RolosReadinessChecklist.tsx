import { useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { getSectionLabel } from "@/config/propertySectionOrder";
import { focusRequirementField } from "@/lib/requirementFocus";
import { usePropertyReadiness, type ReadinessItem } from "@/hooks/usePropertyReadiness";

interface RolosReadinessChecklistProps {
  propertyId: string;
  /** Called when a shortfall inside this hub is clicked (switches the local section) */
  onNavigateSection?: (section: string) => void;
  className?: string;
}

/** Sections that only exist in the admin property editor. */
const ADMIN_ONLY_SECTIONS = new Set(["admin", "integrations", "branding", "rol-spec"]);

function toneFor(score: number) {
  if (score >= 100) return "text-emerald-600";
  if (score >= 70) return "text-amber-600";
  return "text-destructive";
}

/**
 * ROL'OS readiness checksheet: renders the unified readiness model (the same
 * items that drive the score badge and the pink/blue field borders), split into
 * mandatory (activation-blocking) and nice-to-have, each deep-linking to the
 * exact field that fixes it.
 */
export function RolosReadinessChecklist({
  propertyId,
  onNavigateSection,
  className,
}: RolosReadinessChecklistProps) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const {
    items,
    isLoading,
    isFetching,
    hasData,
    passed,
    mandatoryScore,
    mandatoryPassed,
    mandatoryTotal,
    recommendedScore,
    recommendedPassed,
    recommendedTotal,
    refresh,
  } = usePropertyReadiness(propertyId);

  const goToFix = useCallback(
    (item: ReadinessItem) => {
      const section = item.section;
      if (!section) return;
      const focusKey = item.paintable ? item.key : undefined;
      const isAdmin = item.surface === "admin" || ADMIN_ONLY_SECTIONS.has(section);
      if (isAdmin) {
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
    const sortItems = (list: ReadinessItem[]) =>
      [...list].sort((a, b) => Number(a.satisfied) - Number(b.satisfied));
    return {
      mandatory: sortItems(items.filter((i) => i.tier === "mandatory")),
      recommended: sortItems(items.filter((i) => i.tier === "recommended")),
    };
  }, [items]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Building readiness checksheet…
        </CardContent>
      </Card>
    );
  }

  if (!hasData) return null;

  const renderRow = (item: ReadinessItem) => {
    const clickable = !item.satisfied && !!item.section;
    const sectionLabel = item.sectionLabel ?? getSectionLabel(item.section) ?? "Open section";
    return (
      <li
        key={`${item.tier}-${item.key}`}
        className={cn(
          "flex items-start justify-between gap-3 rounded-md border px-3 py-2",
          item.satisfied ? "border-border/60" : "border-destructive/30 bg-destructive/5",
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          {item.satisfied ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                item.tier === "mandatory" ? "text-destructive" : "text-amber-600",
              )}
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium">{item.label}</p>
            {item.message && (
              <p className="text-[11px] leading-tight text-muted-foreground">{item.message}</p>
            )}
            {!item.satisfied && (item.fix || item.hint) && (
              <p className="text-[11px] leading-tight text-muted-foreground">
                Fix: {item.fix ?? item.hint}
              </p>
            )}
          </div>
        </div>
        {clickable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 text-[11px]"
            onClick={() => goToFix(item)}
          >
            {sectionLabel}
            {item.surface === "admin" || ADMIN_ONLY_SECTIONS.has(item.section) ? (
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
            onClick={refresh}
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
                {mandatoryScore}% · {mandatoryPassed}/{mandatoryTotal}
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
                {recommendedScore}% · {recommendedPassed}/{recommendedTotal}
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
            {passed && (
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
