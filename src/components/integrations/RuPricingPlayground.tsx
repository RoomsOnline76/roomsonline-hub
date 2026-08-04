import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, Loader2, Tags, XCircle } from "lucide-react";

interface PriceCoverage {
  expected_days?: number;
  priced_days?: number;
  calendar_days?: number;
  rack_days?: number;
  unit_daily_days?: number;
  unpriced_days?: number;
  unpriced_dates?: string[];
  duplicate_dates_resolved?: number;
  periods?: number;
  summary?: string;
}

interface PushTarget {
  target?: string;
  ru_property_id?: number;
  prices_pushed?: boolean;
  prices_error?: string | null;
  price_coverage?: PriceCoverage | null;
  prices_verification?: {
    matches?: number;
    total_seasons?: number;
    mismatches?: unknown[];
    missing_dates?: string[];
    error?: string | null;
  } | null;
  currency?: { authored_iso?: string; published_iso?: string; effective_rate?: number } | null;
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
  seasons_returned: number;
  days_priced: number;
  duplicate_days: number;
  overlapping_ranges: number;
  overlap_sample: string[];
  unpriced_days: number;
  unpriced_sample: string[];
  min_price: number | null;
  max_price: number | null;
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
  propertyId: string;
  propertyName?: string;
}

/**
 * Certification evidence for the rolling 365-day PRICE window.
 *
 * - Pricing playground: pushes ARI only, then reads prices back and proves every night of
 *   [today, today+365] carries a real price from the shared rate hierarchy.
 * - Duplicate test: pushes the same window twice to prove RU stays idempotent — no doubled
 *   days and no overlapping Season ranges.
 */
export function RuPricingPlayground({ propertyId, propertyName }: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<PlaygroundResult | null>(null);

  const run = useCallback(async (action: "pricing_playground" | "pricing_duplicate_test") => {
    if (!propertyId || propertyId === "none") {
      toast.error("Select a property first — the pricing window is property-scoped.");
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
      if (data?.passed) toast.success("Rolling 365-day pricing verified at Rentals United");
      else toast.warning("Pricing window incomplete — see the breakdown below");
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
          <Tags className="h-4 w-4" />
          Pricing window playground
        </CardTitle>
        <CardDescription>
          Pushes availability and pricing only (never static content), then reads prices back from Rentals United to
          prove every night of the rolling 365-day window is priced from the rate hierarchy
          {propertyName ? ` for ${propertyName}` : ""} — with no duplicated or overlapping ranges.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => run("pricing_playground")} disabled={running !== null} className="gap-1.5">
            {running === "pricing_playground" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tags className="h-3.5 w-3.5" />}
            Run 365-day pricing test
          </Button>
          <Button size="sm" variant="outline" onClick={() => run("pricing_duplicate_test")} disabled={running !== null} className="gap-1.5">
            {running === "pricing_duplicate_test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            Duplicate / overlap test
          </Button>
          {result && (
            <Button size="sm" variant="ghost" onClick={copyEvidence} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />Copy evidence JSON
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Prices come from the calendar season first, then the rate plan base rate, then the unit daily rate — the same
          resolver the checkout uses. Any unpriced night blocks the push instead of publishing a placeholder price.
        </p>

        {result && (
          <div className="space-y-4">
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              {result.passed ? (
                <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Pricing complete</Badge>
              ) : (
                <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Pricing incomplete</Badge>
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
                  <div key={`${p.pass}-${t.ru_property_id}`} className="space-y-0.5 text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">{t.target}</span> (RU {t.ru_property_id}):{" "}
                      {t.price_coverage?.summary ?? (t.prices_pushed ? "pushed" : "not pushed")}
                    </div>
                    {t.currency?.published_iso && t.currency.authored_iso !== t.currency.published_iso && (
                      <div>
                        Published in {t.currency.published_iso} (authored {t.currency.authored_iso}
                        {t.currency.effective_rate ? ` @ ${t.currency.effective_rate}` : ""})
                      </div>
                    )}
                    {t.prices_verification && (
                      <div>
                        Read-back: {t.prices_verification.matches ?? 0}/{t.prices_verification.total_seasons ?? 0} ranges matched,
                        {" "}{(t.prices_verification.mismatches ?? []).length} mismatches,{" "}
                        {(t.prices_verification.missing_dates ?? []).length} missing dates
                      </div>
                    )}
                    {t.prices_error && <div className="text-destructive">{t.prices_error}</div>}
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
                  <span>Days priced: {r.days_priced} / {r.expected_days}</span>
                  <span>Season ranges returned: {r.seasons_returned}</span>
                  <span>Unpriced days: {r.unpriced_days}</span>
                  <span>Duplicate days: {r.duplicate_days}</span>
                  <span>Overlapping ranges: {r.overlapping_ranges}</span>
                  <span>
                    Price range: {r.min_price ?? "—"} – {r.max_price ?? "—"}
                  </span>
                </div>
                {r.unpriced_sample.length > 0 && (
                  <p className="text-xs text-destructive">First unpriced: {r.unpriced_sample.join(", ")}</p>
                )}
                {r.overlap_sample.length > 0 && (
                  <p className="text-xs text-destructive">Overlaps: {r.overlap_sample.join("; ")}</p>
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

export default RuPricingPlayground;
