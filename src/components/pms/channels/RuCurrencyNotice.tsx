import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Coins } from "lucide-react";

/**
 * Owner-facing currency notice for the Channel Manager.
 *
 * Rentals United holds currency on the LOCATION, not on the property. When RU will not
 * hold ZAR for a property's location, ROLOS publishes converted rates in the fallback
 * currency (USD) at a live rate plus a safety margin. This notice explains that, shows
 * the exact rate in force, and illustrates it with the owner's own nightly rates.
 *
 * When ZAR is in force, this component renders nothing.
 */

type CurrencyState = {
  ru_location_id: number | null;
  location_currency_iso: string | null;
  authored_currency_iso: string | null;
  published_currency_iso: string | null;
  conversion_in_force: boolean;
  fx_rate: number | null;
  margin_pct: number | null;
  effective_rate: number | null;
  reason: string | null;
  decided_at: string | null;
};

type SampleRow = { label: string; authored: number };

interface RuCurrencyNoticeProps {
  propertyId: string | null | undefined;
}

export function RuCurrencyNotice({ propertyId }: RuCurrencyNoticeProps) {
  const [state, setState] = useState<CurrencyState | null>(null);
  const [samples, setSamples] = useState<SampleRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!propertyId) {
      setState(null);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("ru_currency_state")
        .select(
          "ru_location_id, location_currency_iso, authored_currency_iso, published_currency_iso, conversion_in_force, fx_rate, margin_pct, effective_rate, reason, decided_at",
        )
        .eq("property_id", propertyId)
        .maybeSingle();
      if (cancelled) return;
      const next = (data as CurrencyState | null) ?? null;
      setState(next);

      if (!next?.conversion_in_force) return;

      // Sample rows come from this owner's own authored rates: seasonal prices first,
      // falling back to each unit's default nightly rate.
      const { data: plans } = await supabase
        .from("rolos_rate_plans")
        .select("id")
        .eq("property_id", propertyId);
      const planIds = (plans ?? []).map((p: { id: string }) => p.id);

      let rows: SampleRow[] = [];
      if (planIds.length) {
        const { data: seasons } = await supabase
          .from("rolos_rate_seasons")
          .select("id, name, start_date, is_peak")
          .in("rate_plan_id", planIds)
          .order("start_date", { ascending: true });
        const seasonIds = (seasons ?? []).map((s: { id: string }) => s.id);
        if (seasonIds.length) {
          const { data: prices } = await supabase
            .from("rolos_rate_prices")
            .select("season_id, base_rate")
            .in("season_id", seasonIds);
          const bySeason = new Map<string, number>();
          (prices ?? []).forEach((p: { season_id: string; base_rate: number | null }) => {
            const rate = Number(p.base_rate);
            if (!Number.isFinite(rate) || rate <= 0) return;
            const existing = bySeason.get(p.season_id);
            if (existing == null || rate > existing) bySeason.set(p.season_id, rate);
          });
          rows = (seasons ?? [])
            .filter((s: { id: string }) => bySeason.has(s.id))
            .slice(0, 4)
            .map((s: { id: string; name: string | null; is_peak: boolean | null }) => ({
              label: `${s.name || "Season"}${s.is_peak ? " (peak)" : ""}`,
              authored: bySeason.get(s.id) as number,
            }));
        }
      }

      if (!rows.length) {
        const { data: units } = await supabase
          .from("rolos_room_types")
          .select("name, default_rate")
          .eq("property_id", propertyId)
          .eq("is_active", true)
          .limit(4);
        rows = (units ?? [])
          .filter((u: { default_rate: number | null }) => Number(u.default_rate) > 0)
          .map((u: { name: string | null; default_rate: number | null }) => ({
            label: u.name || "Unit",
            authored: Number(u.default_rate),
          }));
      }

      if (!cancelled) setSamples(rows);
    })();

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const fmt = useMemo(
    () => ({
      authored: (v: number, iso: string) =>
        new Intl.NumberFormat("en-ZA", { style: "currency", currency: iso, maximumFractionDigits: 0 }).format(v),
      published: (v: number, iso: string) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: iso, maximumFractionDigits: 0 }).format(v),
    }),
    [],
  );

  if (!state?.conversion_in_force || !state.effective_rate) return null;

  const authoredIso = state.authored_currency_iso || "ZAR";
  const publishedIso = state.published_currency_iso || "USD";
  const effective = Number(state.effective_rate);
  const margin = Number(state.margin_pct ?? 3);

  return (
    <Alert className="border-primary/40 bg-card">
      <Coins className="h-4 w-4 text-primary" />
      <AlertTitle className="flex flex-wrap items-center gap-2 text-sm">
        Rates are published to channels in {publishedIso}
        <Badge variant="outline" className="font-mono text-[11px]">
          1 {authoredIso} = {effective.toFixed(5)} {publishedIso}
        </Badge>
        <Badge variant="secondary" className="text-[11px]">
          incl. {margin}% margin
        </Badge>
      </AlertTitle>
      <AlertDescription className="space-y-3 text-xs">
        <p>
          Rentals United assigns currency by region, and it will not hold {authoredIso} for this property&apos;s
          region. Your rates stay authored in {authoredIso} in ROLOS — we convert them to {publishedIso} only for the
          channel feed, at the live exchange rate plus a {margin}% safety margin so movement in the rate never
          underprices a night. Bookings that arrive back from Rentals United are converted to {authoredIso} at the same
          rate, so your payouts and reporting stay in {authoredIso}.
        </p>

        {samples.length > 0 && (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">Your rate</th>
                  <th className="px-2 py-1 font-medium">Authored ({authoredIso})</th>
                  <th className="px-2 py-1 font-medium">Published ({publishedIso})</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((row) => (
                  <tr key={row.label} className="border-t border-border">
                    <td className="px-2 py-1">{row.label}</td>
                    <td className="px-2 py-1 font-mono">{fmt.authored(row.authored, authoredIso)}</td>
                    <td className="px-2 py-1 font-mono">
                      {fmt.published(Math.ceil(row.authored * effective), publishedIso)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-muted-foreground">
          {state.reason}
          {state.decided_at ? ` Rate last refreshed ${new Date(state.decided_at).toLocaleString()}.` : ""}
        </p>
      </AlertDescription>
    </Alert>
  );
}

export default RuCurrencyNotice;
