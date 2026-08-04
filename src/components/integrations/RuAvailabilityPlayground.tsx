import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { AlertTriangle, CalendarRange, CheckCircle2, Copy, Loader2, XCircle } from "lucide-react";

interface CoverageStats {
  expected_days?: number;
  days_covered?: number;
  missing_days?: number;
  days_from_seasons?: number;
  days_filled?: number;
  overlaps_resolved?: number;
  summary?: string;
}

interface PushTarget {
  target?: string;
  ru_property_id?: number;
  availability_pushed?: boolean;
  availability_error?: string | null;
  availability_coverage?: CoverageStats | null;
  price_coverage?: Record<string, unknown> | null;
}

interface PushPass {
  pass: number;
  success: boolean;
  error?: string | null;
  targets?: PushTarget[];
}

interface Readback {
  target: string;
  ru_property_id: number;
  read_ok: boolean;
  read_error?: string | null;
  expected_days: number;
  days_returned: number;
  raw_day_elements: number;
  duplicate_days: number;
  missing_days: number;
  missing_sample: string[];
  conflicting_min_stay: number;
  open_days: number;
  passed: boolean;
}

interface PlaygroundResult {
  action: string;
  property?: { id: string; name: string };
  window?: { from: string; to: string; expected_days: number };
  passes?: number;
  pushes?: PushPass[];
  readbacks?: Readback[];
  passed?: boolean;
}

interface Props {
  /** Property to test, or "none" for account-level context (playground needs a property). */
  propertyId: string;
  propertyName?: string;
}

/**
 * Certification evidence for the rolling 365-day availability window.
 *
 * - Availability playground: pushes ARI only, then reads the calendar back and proves RU
 *   holds one entry for every day of [today, today+365].
 * - Duplicate range test: pushes the same window twice to prove idempotency (no doubled
 *   days, no conflicting MinStay) — the overlap behaviour RU certification asks for.
 */
export function RuAvailabilityPlayground({ propertyId, propertyName }: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<PlaygroundResult | null>(null);

  const run = useCallback(async (action: "availability_playground" | "duplicate_range_test") => {
    if (!propertyId || propertyId === "none") {
      toast.error("Select a property first — the availability window is property-scoped.");
      return;
    }
    setRunning(action);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action, property_id: propertyId },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message ?? "Test failed");
      setResult(data as PlaygroundResult);
      if (data?.passed) toast.success("Rolling 365-day window verified at Rentals United");
      else toast.warning("Window incomplete — see the day-level breakdown below");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setRunning(null);
    }
  }, [propertyId]);

  const copyEvidence = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    toast.success("Evidence JSON copied");
  }, [result]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4" />
          Availability window playground
        </CardTitle>
        <CardDescription>
          Pushes availability and pricing only (never static content), then reads the RU calendar back to prove a
          complete, non-overlapping rolling 365-day window{propertyName ? ` for ${propertyName}` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => run("availability_playground")} disabled={running !== null} className="gap-1.5">
            {running === "availability_playground" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarRange className="h-3.5 w-3.5" />}
            Run 365-day window test
          </Button>
          <Button size="sm" variant="outline" onClick={() => run("duplicate_range_test")} disabled={running !== null} className="gap-1.5">
            {running === "duplicate_range_test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            Duplicate / overlap test
          </Button>
          {result && (
            <Button size="sm" variant="ghost" onClick={copyEvidence} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />Copy evidence JSON
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Rentals United accepts roughly one call per sliding minute per account — the duplicate test makes two pushes
          plus one read-back per unit, so allow a few minutes on multi-unit inventory.
        </p>

        {result && (
          <div className="space-y-4">
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              {result.passed ? (
                <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Window complete</Badge>
              ) : (
                <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Window incomplete</Badge>
              )}
              {result.window && (
                <span className="text-xs text-muted-foreground">
                  {result.window.from} → {result.window.to} ({result.window.expected_days} days expected)
                </span>
              )}
              {result.passes === 2 && <Badge variant="outline">2 push passes (idempotency)</Badge>}
            </div>

            {(result.pushes ?? []).map((p) => (
              <div key={p.pass} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {p.success ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                  Push pass {p.pass}
                </div>
                {p.error && <p className="text-xs text-destructive">{p.error}</p>}
                {(p.targets ?? []).map((t) => (
                  <div key={`${p.pass}-${t.ru_property_id}`} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{t.target}</span> (RU {t.ru_property_id}):{" "}
                    {t.availability_coverage?.summary ?? (t.availability_pushed ? "pushed" : "not pushed")}
                    {t.availability_error && <span className="text-destructive"> — {t.availability_error}</span>}
                  </div>
                ))}
              </div>
            ))}

            {(result.readbacks ?? []).map((r) => (
              <div key={r.ru_property_id} className="rounded-md border p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {r.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                  {r.target}
                  <Badge variant="outline" className="text-[10px]">RU {r.ru_property_id}</Badge>
                </div>
                <div className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>Days returned: {r.days_returned} / {r.expected_days}</span>
                  <span>Open days: {r.open_days}</span>
                  <span>Missing days: {r.missing_days}</span>
                  <span>Duplicate days: {r.duplicate_days}</span>
                  <span>Conflicting MinStay: {r.conflicting_min_stay}</span>
                  <span>Raw CalDay elements: {r.raw_day_elements}</span>
                </div>
                {r.missing_sample.length > 0 && (
                  <p className="text-xs text-destructive">First missing: {r.missing_sample.join(", ")}</p>
                )}
                {r.read_error && <p className="text-xs text-destructive">{r.read_error}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RuAvailabilityPlayground;
