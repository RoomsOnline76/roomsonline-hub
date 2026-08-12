import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw,
  Shield,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { usePropertyReadiness } from "@/hooks/usePropertyReadiness";

interface QualityCheckResult {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
  fix?: string;
  field?: string;
  severity: 'blocker' | 'warning' | 'info';
}

interface ActivationReadinessResponse {
  passed: boolean;
  score: number;
  blockers: QualityCheckResult[];
  warnings: QualityCheckResult[];
  checks: QualityCheckResult[];
}

interface QualityGateIndicatorProps {
  propertyId: string;
  onNavigateToField?: (field: string) => void;
  compact?: boolean;
  className?: string;
}

/**
 * Visibility gate: long property lists render one indicator per row, which used
 * to fire ~70 parallel edge-function calls (and as many cold starts) on mount.
 * We only fetch readiness for rows the user can actually see.
 */
export function QualityGateIndicator(props: QualityGateIndicatorProps) {
  const [inView, setInView] = useState(false);
  const placeholderRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (inView) return;
    const el = placeholderRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  if (!inView) {
    return (
      <span
        ref={placeholderRef}
        aria-hidden="true"
        className={cn("inline-block h-4 w-4 rounded-full bg-muted", props.className)}
      />
    );
  }

  return <QualityGateIndicatorInner {...props} />;
}

function QualityGateIndicatorInner({ 
  propertyId, 
  onNavigateToField,
  compact = false,
  className 
}: QualityGateIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  /**
   * Single source of truth: the same readiness model the property editor and the
   * channel wizard use, so a list row can never report a different count from the
   * editor. Image measurement and the channel report are left to the editor —
   * list rows reuse whatever is already cached.
   */
  const {
    items,
    passed,
    mandatoryScore,
    hasData,
    isLoading,
    isFetching: isRefetching,
    refresh,
  } = usePropertyReadiness(propertyId, { channelChecks: false, measureImages: false });

  const refetch = refresh;

  const toResult = (item: (typeof items)[number], severity: QualityCheckResult["severity"]): QualityCheckResult => ({
    id: item.key,
    name: item.label,
    passed: item.satisfied,
    message: item.message ?? item.requirement?.hint ?? item.fix ?? item.label,
    fix: item.fix ?? item.requirement?.hint,
    field: item.key,
    severity,
  });

  const blockers = items
    .filter((i) => i.tier === "mandatory" && !i.satisfied)
    .map((i) => toResult(i, "blocker"));
  const warnings = items
    .filter((i) => i.tier === "recommended" && !i.satisfied)
    .map((i) => toResult(i, "warning"));
  const checks = items.map((i) => toResult(i, i.tier === "mandatory" ? "blocker" : "info"));
  const score = mandatoryScore;

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Checking readiness...</span>
      </div>
    );
  }

  if (!hasData) {
    return null;
  }

  const totalIssues = blockers.length + warnings.length;

  // Determine overall status color
  const statusColor = passed 
    ? "text-success" 
    : blockers.length > 0 
      ? "text-destructive" 
      : "text-warning";

  const statusBg = passed 
    ? "bg-green-500/10 border-green-500/30" 
    : blockers.length > 0 
      ? "bg-destructive/10 border-destructive/30" 
      : "bg-yellow-500/10 border-yellow-500/30";

  const StatusIcon = passed 
    ? CheckCircle2 
    : blockers.length > 0 
      ? XCircle 
      : AlertTriangle;

  // Compact mode for inline display
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("flex items-center gap-1.5 cursor-help", className)}>
              <StatusIcon className={cn("h-4 w-4", statusColor)} />
              {!passed && (
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColor)}>
                  {blockers.length > 0 ? `${blockers.length} blocker${blockers.length > 1 ? 's' : ''}` : `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`}
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-md z-[100]" sideOffset={5} avoidCollisions={true}>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              <div className="font-medium">
                {passed ? "Ready for activation" : "Cannot activate yet"}
              </div>
              {blockers.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                  {blockers.map(b => (
                    <li key={b.id} className="whitespace-normal break-words">{b.message}</li>
                  ))}
                </ul>
              )}
              {warnings.length > 0 && blockers.length === 0 && (
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                  {warnings.map(w => (
                    <li key={w.id} className="whitespace-normal break-words">{w.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full expanded view
  return (
    <div className={cn("rounded-lg border", statusBg, className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <div className={cn("p-1.5 rounded-full", passed ? "bg-green-500/20" : blockers.length > 0 ? "bg-destructive/20" : "bg-yellow-500/20")}>
              <StatusIcon className={cn("h-5 w-5", statusColor)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  {passed ? "Ready for Activation" : "Activation Blocked"}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  Score: {score}/100
                </Badge>
              </div>
              {!passed && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {blockers.length > 0 
                    ? `${blockers.length} blocker${blockers.length > 1 ? 's' : ''} must be resolved`
                    : `${warnings.length} warning${warnings.length > 1 ? 's' : ''} to review`
                  }
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="h-7 px-2"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
            </Button>
            
            {totalIssues > 0 && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t px-3 py-2 space-y-2">
            {/* Blockers Section */}
            {blockers.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <XCircle className="h-3.5 w-3.5" />
                  Blockers
                </div>
                {blockers.map(check => (
                  <CheckItem 
                    key={check.id} 
                    check={check} 
                    onNavigate={onNavigateToField}
                  />
                ))}
              </div>
            )}

            {/* Warnings Section */}
            {warnings.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Warnings
                </div>
                {warnings.map(check => (
                  <CheckItem 
                    key={check.id} 
                    check={check} 
                    onNavigate={onNavigateToField}
                  />
                ))}
              </div>
            )}

            {/* Passed Checks (collapsed by default) */}
            {passed && checks.filter(c => c.passed).length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  All Checks Passed ({checks.filter(c => c.passed).length})
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

interface CheckItemProps {
  check: QualityCheckResult;
  onNavigate?: (field: string) => void;
}

function CheckItem({ check, onNavigate }: CheckItemProps) {
  const severityIcon = check.severity === 'blocker' 
    ? <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
    : check.severity === 'warning'
      ? <AlertTriangle className="h-3 w-3 text-warning flex-shrink-0" />
      : <Info className="h-3 w-3 text-blue-500 flex-shrink-0" />;

  return (
    <div className="flex items-start gap-2 bg-background/50 rounded p-2 text-xs">
      {severityIcon}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground text-wrap">{check.name}</div>
        <div className="text-muted-foreground whitespace-normal break-words">{check.message}</div>
        {check.fix && (
          <div className="mt-1 text-primary/80 flex items-start gap-1 whitespace-normal break-words">
            <Shield className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span>{check.fix}</span>
          </div>
        )}
      </div>
      {check.field && onNavigate && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => onNavigate(check.field!)}
        >
          Fix
        </Button>
      )}
    </div>
  );
}

// Hook for checking readiness in other components
export function useActivationReadiness(propertyId: string) {
  return useQuery({
    queryKey: ['activation-readiness', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-activation-readiness', {
        body: { property_id: propertyId }
      });
      if (error) throw error;
      return data as ActivationReadinessResponse;
    },
    enabled: !!propertyId,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });
}
