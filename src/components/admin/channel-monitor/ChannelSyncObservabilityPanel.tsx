import { useCallback, useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { RefreshCw, CheckCircle2, XCircle, Filter, Plus, Check, ChevronsUpDown } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { isRolosPms } from "@/lib/pmsIdentity";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";

import { RuErrorHandlingTab } from "@/components/integrations/RuErrorHandlingTab";

interface SyncRun {
  id: string;
  created_at: string;
  batch_id: string;
  action: string;
  property_id: string | null;
  ru_property_id: string | null;
  unit_id: string | null;
  success: boolean;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  elapsed_ms: number | null;
  details: unknown;
}

interface PropertyLite {
  id: string;
  name: string;
  slug: string | null;
  external_system: string | null;
  ru_push_enabled: boolean | null;
  ru_hold_reason: string | null;
  ru_hold_set_at: string | null;
  rentalsunited_property_id: string | null;
}

const ACTIONS = ["PutProperty", "PutAvbUnits", "PutPrices", "ListReservations", "PutHandlerUrl", "RLNM"] as const;

const normalizeRuSyncError = (message: string | null): string | null => {
  if (!message) return null;
  return message.toLowerCase().includes("incorrect login or password")
    ? "AccessKey / SecretKey authentication failed"
    : message;
};

/**
 * Sync observability + error handling for the channel manager, lifted out of the retired
 * diagnostics page. One query feeds the KPIs, the endpoint tracker, the run table and the
 * error classification panel, so the Advanced tab pays for the data once.
 */
export function ChannelSyncObservabilityPanel() {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [properties, setProperties] = useState<PropertyLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [successFilter, setSuccessFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [selected, setSelected] = useState<SyncRun | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  // Properties toggled in this session stay on the board even when switched off.
  const [stickyIds, setStickyIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  // Manual-run scope: empty = every RU-enabled property.
  const [runScopeIds, setRunScopeIds] = useState<string[]>([]);
  const [scopeOpen, setScopeOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const since = subDays(new Date(), 7).toISOString();
    const [runsRes, propsRes] = await Promise.all([
      supabase
        .from("ru_sync_runs")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("properties")
        .select(
          "id, name, slug, external_system, ru_push_enabled, ru_hold_reason, ru_hold_set_at, rentalsunited_property_id",
        )
        .eq("is_active", true)
        .order("name"),
    ]);
    if (runsRes.error) toast.error(runsRes.error.message);
    else setRuns((runsRes.data ?? []) as SyncRun[]);
    if (!propsRes.error) setProperties((propsRes.data ?? []) as PropertyLite[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const propertyById = useMemo(() => {
    const map = new Map<string, PropertyLite>();
    properties.forEach((p) => map.set(p.id, p));
    return map;
  }, [properties]);

  const filtered = useMemo(
    () =>
      runs.filter((r) => {
        if (actionFilter !== "all" && r.action !== actionFilter) return false;
        if (successFilter === "success" && !r.success) return false;
        if (successFilter === "failed" && r.success) return false;
        if (propertyFilter !== "all" && r.property_id !== propertyFilter) return false;
        return true;
      }),
    [runs, actionFilter, successFilter, propertyFilter],
  );

  const stats = useMemo(() => {
    const total = filtered.length;
    const ok = filtered.filter((r) => r.success).length;
    const fail = total - ok;
    const avgMs = total ? Math.round(filtered.reduce((s, r) => s + (r.elapsed_ms ?? 0), 0) / total) : 0;
    const enabledCount = properties.filter((p) => p.ru_push_enabled).length;
    return { total, ok, fail, avgMs, enabledCount };
  }, [filtered, properties]);

  /**
   * Properties that belong on the board regardless of their current toggle: ROLOS-managed,
   * already mapped at the channel, currently enabled, or toggled during this session.
   */
  const ruProperties = useMemo(
    () =>
      properties.filter(
        (p) =>
          isRolosPms(p.external_system) ||
          !!p.ru_push_enabled ||
          !!p.rentalsunited_property_id ||
          stickyIds.has(p.id),
      ),
    [properties, stickyIds],
  );

  /** Any active property not already on the board can be added manually via [+]. */
  const addableProperties = useMemo(() => {
    const listed = new Set(ruProperties.map((p) => p.id));
    return properties.filter((p) => !listed.has(p.id));
  }, [properties, ruProperties]);

  const propertyNameById = useMemo(
    () => new Map(properties.map((p) => [p.id, p.name])),
    [properties],
  );

  /**
   * Distribution is the default state. Putting a property on hold is deliberate and must
   * carry a reason, so a listing that stops syncing always explains itself.
   */
  const togglePush = useCallback(async (id: string, next: boolean) => {
    let reason: string | null = null;
    if (!next) {
      const answer = window.prompt(
        "Why is channel distribution going on hold for this property?\n(e.g. owner off-boarding, listing under repair)",
      );
      if (answer === null) return;
      reason = answer.trim();
      if (!reason) {
        toast.error("A hold needs a reason.");
        return;
      }
    }
    const { data: authData } = await supabase.auth.getUser();
    const patch = next
      ? { ru_push_enabled: true, ru_hold_reason: null, ru_hold_set_at: null, ru_hold_set_by: null }
      : {
          ru_push_enabled: false,
          ru_hold_reason: reason,
          ru_hold_set_at: new Date().toISOString(),
          ru_hold_set_by: authData?.user?.id ?? null,
        };
    const { error } = await supabase.from("properties").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStickyIds((prev) => new Set(prev).add(id));
    setProperties((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, ru_push_enabled: next, ru_hold_reason: patch.ru_hold_reason, ru_hold_set_at: patch.ru_hold_set_at }
          : p,
      ),
    );
    if (next) {
      // Lifting a hold must deliver whatever was parked while it was on, with no manual re-push.
      void supabase.functions.invoke("ru-cert-portal", {
        body: { action: "property_readiness", property_id: id, probe_ari: false },
      });
    }
    toast.success(
      next
        ? "Distribution resumed — parked changes will be delivered automatically"
        : "Distribution on hold — saves will be parked until it is lifted",
    );
  }, []);

  const toggleScope = useCallback(
    (id: string) => setRunScopeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  );

  const scopeLabel =
    runScopeIds.length === 0
      ? "All RU-enabled properties"
      : runScopeIds.length === 1
        ? propertyById.get(runScopeIds[0])?.name ?? "1 property"
        : `${runScopeIds.length} properties`;

  /**
   * Trigger a sync job. `scoped` endpoints receive the manual property selection;
   * account-level endpoints (RLNM, reservations pull) always run globally.
   */
  const runCron = useCallback(
    async (fn: string, label: string, scoped = true) => {
      setTriggering(fn);
      const { error } = await supabase.functions.invoke(fn, {
        body: { manual: true, property_ids: scoped && runScopeIds.length ? runScopeIds : undefined },
      });
      setTriggering(null);
      if (error) toast.error(`${label} failed: ${error.message}`);
      else {
        toast.success(`${label} triggered${scoped && runScopeIds.length ? ` for ${scopeLabel}` : ""}`);
        setTimeout(() => void load(), 1500);
      }
    },
    [load, runScopeIds, scopeLabel],
  );

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Enabled properties</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{stats.enabledCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Runs (7d)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Successful</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold text-emerald-600">{stats.ok}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Failed</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold text-red-600">{stats.fail}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg latency</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{stats.avgMs} ms</div></CardContent>
        </Card>
      </div>


      {/* Error handling — classification and retry guidance for the same run set */}
      <RuErrorHandlingTab runs={runs} propertyNameById={propertyNameById} />

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>Run detail</SheetTitle></SheetHeader>
          {selected && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Action:</span> {selected.action}</div>
                <div><span className="text-muted-foreground">Batch:</span> <code className="text-xs">{selected.batch_id}</code></div>
                <div><span className="text-muted-foreground">Channel ID:</span> {selected.ru_property_id ?? "—"}</div>
                <div><span className="text-muted-foreground">HTTP:</span> {selected.http_status ?? "—"}</div>
                <div><span className="text-muted-foreground">Elapsed:</span> {selected.elapsed_ms ?? 0} ms</div>
                <div><span className="text-muted-foreground">Success:</span> {String(selected.success)}</div>
              </div>
              {selected.error_message && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
                  <div className="text-xs font-semibold text-destructive mb-1">{selected.error_code ?? "Error"}</div>
                  <div className="text-xs text-destructive whitespace-pre-wrap">
                    {normalizeRuSyncError(selected.error_message)}
                  </div>
                  {normalizeRuSyncError(selected.error_message) !== selected.error_message && (
                    <div className="mt-2 text-xs text-destructive/80 whitespace-pre-wrap">
                      Channel raw message: {selected.error_message}
                    </div>
                  )}
                </div>
              )}
              <div>
                <div className="text-xs font-semibold mb-1 text-muted-foreground">Details</div>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[400px]">
                  {JSON.stringify(selected.details, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
