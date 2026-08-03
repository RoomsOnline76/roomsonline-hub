import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Coins, RefreshCw, Wrench, Loader2 } from "lucide-react";

/**
 * Admin control surface for the Rentals United currency rule.
 *
 * RU owns currency on the LocationID. This panel keeps the location→currency cache
 * fresh, shows what currency each property is actually publishing in, and runs the
 * reconciliation (flip the RU location to ZAR, re-push) with an optional dry run.
 */

type PropertyRow = { id: string; name: string; country: string | null };

type CurrencyStateRow = {
  property_id: string;
  ru_location_id: number | null;
  location_currency_iso: string | null;
  authored_currency_iso: string | null;
  published_currency_iso: string | null;
  conversion_in_force: boolean;
  fx_rate: number | null;
  margin_pct: number | null;
  effective_rate: number | null;
  reason: string | null;
  flip_outcome: string | null;
  decided_at: string | null;
};

export function RuCurrencyPanel() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [states, setStates] = useState<Record<string, CurrencyStateRow>>({});
  const [cache, setCache] = useState<{ count: number; lastSynced: string | null; zarCount: number }>({
    count: 0,
    lastSynced: null,
    zarCount: 0,
  });
  const [fx, setFx] = useState<{ rate: number; effective: number; fetchedAt: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<"refresh" | "dry" | "apply" | null>(null);

  const load = useCallback(async () => {
    const [{ data: props }, { data: stateRows }, { count }, { data: newest }, { count: zarCount }, { data: fxRow }] =
      await Promise.all([
        supabase
          .from("properties")
          .select("id, name, country")
          .not("rentalsunited_property_id", "is", null)
          .order("name"),
        supabase.from("ru_currency_state").select("*"),
        supabase.from("ru_locations").select("id", { count: "exact", head: true }),
        supabase.from("ru_locations").select("last_synced_at").order("last_synced_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("ru_locations").select("id", { count: "exact", head: true }).eq("currency_iso", "ZAR"),
        supabase
          .from("ru_fx_rates")
          .select("rate, margin_pct:rate, fetched_at")
          .eq("base_iso", "ZAR")
          .eq("quote_iso", "USD")
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    setProperties((props as PropertyRow[]) ?? []);
    const map: Record<string, CurrencyStateRow> = {};
    ((stateRows as CurrencyStateRow[]) ?? []).forEach((r) => {
      map[r.property_id] = r;
    });
    setStates(map);
    setCache({
      count: count ?? 0,
      lastSynced: (newest as { last_synced_at: string | null } | null)?.last_synced_at ?? null,
      zarCount: zarCount ?? 0,
    });
    if (fxRow?.rate) {
      const rate = Number(fxRow.rate);
      setFx({ rate, effective: rate * 1.03, fetchedAt: (fxRow as { fetched_at: string }).fetched_at });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshCache = async () => {
    setBusy("refresh");
    try {
      const { data, error } = await supabase.functions.invoke("push-property-to-ru", {
        body: { action: "refresh_ru_location_currencies" },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error?.message || "Refresh failed");
      toast.success(`Refreshed ${data.upserted} Rentals United locations`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setBusy(null);
    }
  };

  const reconcile = async (dryRun: boolean) => {
    setBusy(dryRun ? "dry" : "apply");
    try {
      const { data, error } = await supabase.functions.invoke("push-property-to-ru", {
        body: {
          action: "reconcile_ru_location_currency",
          dry_run: dryRun,
          ...(selected.length ? { property_ids: selected } : {}),
        },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error?.message || "Reconcile failed");
      const results = (data.results ?? []) as Array<{ success?: boolean }>;
      const ok = results.filter((r) => r.success).length;
      toast.success(
        `${dryRun ? "Dry run" : "Reconciled"}: ${ok}/${results.length} properties${dryRun ? " would succeed" : " updated"}`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reconcile failed");
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const converted = properties.filter((p) => states[p.id]?.conversion_in_force);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4" /> Location currency &amp; FX
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Rentals United assigns currency to the <strong>region (LocationID)</strong>, not the property. ROLOS keeps
            each region on ZAR where RU allows it; where RU refuses, rates are published in USD at the live rate plus a
            3% safety margin and bookings are converted back to ZAR on arrival.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Location cache</p>
              <p className="text-lg font-semibold">{cache.count.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">
                {cache.zarCount.toLocaleString()} on ZAR ·{" "}
                {cache.lastSynced ? new Date(cache.lastSynced).toLocaleString() : "never synced"}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-[11px] uppercase text-muted-foreground">ZAR → USD</p>
              <p className="text-lg font-semibold font-mono">{fx ? fx.rate.toFixed(5) : "—"}</p>
              <p className="text-[11px] text-muted-foreground">
                {fx ? `effective ${fx.effective.toFixed(5)} incl. 3% · ${new Date(fx.fetchedAt).toLocaleString()}` : "no rate cached"}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Publishing in USD</p>
              <p className="text-lg font-semibold">{converted.length}</p>
              <p className="text-[11px] text-muted-foreground">of {properties.length} RU-connected properties</p>
            </div>
          </div>

          {cache.count === 0 && (
            <Alert>
              <AlertDescription className="text-xs">
                The location cache is empty, so currency drift cannot be detected. Refresh it before reconciling.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={refreshCache} disabled={busy !== null}>
              {busy === "refresh" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              Refresh locations &amp; FX
            </Button>
            <Button size="sm" variant="outline" onClick={() => reconcile(true)} disabled={busy !== null}>
              {busy === "dry" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Dry run {selected.length ? `(${selected.length})` : "(all)"}
            </Button>
            <Button size="sm" onClick={() => reconcile(false)} disabled={busy !== null}>
              {busy === "apply" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Wrench className="mr-2 h-3.5 w-3.5" />}
              Reconcile &amp; re-push {selected.length ? `(${selected.length})` : "(all)"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per-property currency state</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2 font-medium">Property</th>
                  <th className="px-3 py-2 font-medium">RU location</th>
                  <th className="px-3 py-2 font-medium">Location holds</th>
                  <th className="px-3 py-2 font-medium">Publishing in</th>
                  <th className="px-3 py-2 font-medium">Effective rate</th>
                  <th className="px-3 py-2 font-medium">Last decided</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => {
                  const st = states[p.id];
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Checkbox checked={selected.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-2 text-muted-foreground">{p.country || "—"}</span>
                      </td>
                      <td className="px-3 py-2 font-mono">{st?.ru_location_id ?? "—"}</td>
                      <td className="px-3 py-2">{st?.location_currency_iso ?? "unknown"}</td>
                      <td className="px-3 py-2">
                        {st ? (
                          <Badge variant={st.conversion_in_force ? "destructive" : "secondary"} className="text-[11px]">
                            {st.published_currency_iso}
                            {st.conversion_in_force ? " (converted)" : ""}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">not yet pushed</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {st?.effective_rate ? Number(st.effective_rate).toFixed(5) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {st?.decided_at ? new Date(st.decided_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
                {properties.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      No Rentals United connected properties yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default RuCurrencyPanel;
