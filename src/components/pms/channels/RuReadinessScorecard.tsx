import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RefreshCw, ShieldAlert, Loader2, ChevronDown, ChevronUp } from "lucide-react";

export interface RuReadinessCheck {
  key: string;
  group: string;
  label: string;
  mandatory: boolean;
  passed: boolean;
  detail?: string;
  unit?: string;
  fix_hint?: string;
}

export interface RuReadinessReport {
  property_id: string;
  name: string;
  score: number;
  blocked: boolean;
  ok: boolean;
  checks_total: number;
  checks_passed: number;
  mandatory_total?: number;
  mandatory_passed?: number;
  gaps: string[];
  checks: RuReadinessCheck[];
  groups: { group: string; total: number; passed: number; failed: RuReadinessCheck[] }[];
  error?: string;
}

interface Props {
  propertyId: string;
  /** Rendered inside an existing card shell when false. */
  standalone?: boolean;
  onReport?: (report: RuReadinessReport | null) => void;
}

export function RuReadinessScorecard({ propertyId, standalone = true, onReport }: Props) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<RuReadinessReport | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async (probeAri = false) => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        // Mounts score locally / from the stored verdict; only Refresh reads the channel.
        body: { action: "property_readiness", property_id: propertyId, probe_ari: probeAri },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error?.message ?? "Readiness check failed");
      setReport(data.property as RuReadinessReport);
      onReport?.(data.property as RuReadinessReport);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Readiness check failed";
      toast.error(message);
      setReport(null);
      onReport?.(null);
    } finally {
      setLoading(false);
    }
  }, [propertyId, onReport]);

  useEffect(() => {
    void load(false);
  }, [load]);


  // A fresh check always starts filtered to outstanding items only.
  useEffect(() => {
    setShowAll(false);
  }, [report]);

  // Nothing to act on at 100% — keep the checklist folded away and re-open it the moment a
  // requirement slips, so the owner only ever sees the long list when it needs work.
  const satisfied = !!report && !report.blocked && report.score >= 100;
  useEffect(() => {
    setDetailsOpen(!satisfied);
  }, [satisfied]);

  // Outstanding-only filtering: hide fully-passed groups and passed checks unless the owner
  // explicitly asks for the full picture.
  const { visibleGroups, hiddenGroups, hasPassedToHide } = useMemo(() => {
    const groups = report?.groups ?? [];
    const visible = groups.filter((g) => showAll || g.passed < g.total);
    const hidden = groups.filter((g) => g.passed === g.total);
    const hasHide = groups.some((g) => g.passed < g.total && g.passed > 0) || hidden.length > 0;
    return { visibleGroups: visible, hiddenGroups: hidden, hasPassedToHide: hasHide };
  }, [report, showAll]);

  const scoreTone = !report
    ? "text-muted-foreground"
    : report.blocked
      ? "text-destructive"
      : "text-primary";

  const body = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <div className={`text-4xl font-semibold tabular-nums ${scoreTone}`}>
            {report ? `${report.score}%` : "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {report ? `${report.checks_passed} of ${report.checks_total} requirements met` : "Not scored yet"}
          </p>
        </div>
        <div className="flex-1 min-w-[180px]">
          <Progress value={report?.score ?? 0} className="h-2" />
        </div>
        {report && (
          <Badge variant={report.blocked ? "destructive" : "default"}>
            {report.blocked ? "Not ready — sync blocked" : "Ready to sync"}
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span className="ml-1.5">Re-check</span>
        </Button>
        {report && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span className="ml-1.5">{detailsOpen ? "Hide checklist" : "Show checklist"}</span>
          </Button>
        )}
      </div>

      {detailsOpen && hasPassedToHide && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show outstanding only" : "Show all requirements"}
        </Button>
      )}

      {satisfied && !detailsOpen && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
          All {report?.checks_total} requirements met — nothing outstanding.
        </p>
      )}

      {report?.error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Readiness could not be calculated</AlertTitle>
          <AlertDescription>{report.error}</AlertDescription>
        </Alert>
      )}

      {report?.blocked && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Channel readiness is blocked</AlertTitle>
          <AlertDescription>
            Complete the mandatory local requirements below, then press Re-check. Live channel verification
            is shown separately and will not prevent ROL'OS from sending complete corrective rates.
          </AlertDescription>
        </Alert>
      )}

      {detailsOpen && (
        <div className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            {visibleGroups.map((g) => (
              <div key={g.group} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">{g.group}</p>
                  <Badge variant={g.passed === g.total ? "secondary" : "destructive"} className="text-[10px]">
                    {g.passed}/{g.total}
                  </Badge>
                </div>
                <ul className="space-y-1.5">
                  {(report?.checks ?? [])
                    .filter((c) => c.group === g.group)
                    .filter((c) => showAll || !c.passed)
                    .map((c, i) => (
                      <li key={`${c.key}-${c.unit ?? ""}-${i}`} className="flex items-start gap-2 text-xs">
                        {c.passed ? (
                          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />
                        )}
                        <span className={c.passed ? "text-muted-foreground" : ""}>
                          {c.unit ? <span className="font-medium">{c.unit}: </span> : null}
                          {c.label}
                          {!c.passed && c.detail ? (
                            <span className="block text-destructive">{c.detail}</span>
                          ) : null}
                          {!c.passed && c.fix_hint ? (
                            <span className="block text-muted-foreground">Fix in: {c.fix_hint}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>

          {!showAll && hiddenGroups.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-primary/10"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>
                {report?.checks_passed ?? 0}/{report?.checks_total ?? 0} requirements met —{" "}
                {hiddenGroups.length} group{hiddenGroups.length > 1 ? "s" : ""} complete.
              </span>
              <span className="ml-auto font-medium text-primary">Show all requirements</span>
            </button>
          )}
        </div>
      )}

      {!report && !loading && (
        <p className="text-sm text-muted-foreground">No readiness report yet — press Re-check.</p>
      )}
    </div>
  );

  if (!standalone) return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Channel Manager — sync readiness</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export default RuReadinessScorecard;
