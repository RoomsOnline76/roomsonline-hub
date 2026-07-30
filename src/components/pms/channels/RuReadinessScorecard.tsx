import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RefreshCw, ShieldAlert, Loader2 } from "lucide-react";

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

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "property_readiness", property_id: propertyId },
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
    void load();
  }, [load]);

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
      </div>

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
          <AlertTitle>Rentals United sync is blocked</AlertTitle>
          <AlertDescription>
            Every mandatory requirement below must be completed before this property can be pushed to
            Rentals United. Fix the items listed, then press Re-check.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(report?.groups ?? []).map((g) => (
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

      {!report && !loading && (
        <p className="text-sm text-muted-foreground">No readiness report yet — press Re-check.</p>
      )}
    </div>
  );

  if (!standalone) return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rentals United — sync readiness</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export default RuReadinessScorecard;
