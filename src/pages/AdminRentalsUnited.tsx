import { useCallback, useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { Link } from "react-router-dom";

import { RefreshCw, CheckCircle2, XCircle, Filter, Plus, Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isRolosPms } from "@/lib/pmsIdentity";

import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RuCurrencyPanel } from "@/components/integrations/RuCurrencyPanel";
import { RuBuildingsPanel } from "@/components/integrations/RuBuildingsPanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { RuErrorHandlingTab } from "@/components/integrations/RuErrorHandlingTab";
import { RuCalendarVerifyPanel } from "@/components/integrations/RuCalendarVerifyPanel";

import { RuSyncProgressTracker } from "@/components/integrations/RuSyncProgressTracker";
import { RuLnmPanel } from "@/components/integrations/RuLnmPanel";
import { RuMcqReportPanel } from "@/components/integrations/RuMcqReportPanel";

import { RuCoverageTab } from "@/components/integrations/RuCoverageTab";
import { RuReservationsPanel } from "@/components/integrations/RuReservationsPanel";


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

export default function AdminRentalsUnited() {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [properties, setProperties] = useState<PropertyLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [successFilter, setSuccessFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [selected, setSelected] = useState<SyncRun | null>(null);
  const [onboardingPropertyId, setOnboardingPropertyId] = useState<string>("");
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
        .select("id, name, slug, external_system, ru_push_enabled, ru_hold_reason, ru_hold_set_at, rentalsunited_property_id")
        .eq("is_active", true)
        .order("name"),
    ]);
    if (runsRes.error) toast.error(runsRes.error.message);
    else setRuns((runsRes.data ?? []) as SyncRun[]);
    if (!propsRes.error) setProperties((propsRes.data ?? []) as PropertyLite[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const propertyById = useMemo(() => {
    const map = new Map<string, PropertyLite>();
    properties.forEach((p) => map.set(p.id, p));
    return map;
  }, [properties]);

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (successFilter === "success" && !r.success) return false;
      if (successFilter === "failed" && r.success) return false;
      if (propertyFilter !== "all" && r.property_id !== propertyFilter) return false;
      return true;
    });
  }, [runs, actionFilter, successFilter, propertyFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const ok = filtered.filter((r) => r.success).length;
    const fail = total - ok;
    const avgMs = total
      ? Math.round(filtered.reduce((s, r) => s + (r.elapsed_ms ?? 0), 0) / total)
      : 0;
    const enabledCount = properties.filter((p) => p.ru_push_enabled).length;
    return { total, ok, fail, avgMs, enabledCount };
  }, [filtered, properties]);

  /**
   * Properties that belong on the RU board regardless of their current toggle:
   * ROLOS-managed, already mapped in RU, currently enabled, or toggled during this session.
   * Disabling a property must never remove it from the list — it stays so it can be
   * re-enabled later when ramping up from one test property to many.
   */
  const ruProperties = useMemo(
    () =>
      properties.filter(
        (p) =>
          isRolosPms(p.external_system) ||
          !!p.ru_push_enabled ||
          !!p.rentalsunited_property_id ||
          stickyIds.has(p.id)
      ),
    [properties, stickyIds]
  );


  /** Any active property not already on the board can be added manually via [+]. */
  const addableProperties = useMemo(() => {
    const listed = new Set(ruProperties.map((p) => p.id));
    return properties.filter((p) => !listed.has(p.id));
  }, [properties, ruProperties]);



  /** Only RU-enabled properties take part in onboarding / certification testing. */
  const enabledProperties = useMemo(
    () => properties.filter((p) => !!p.ru_push_enabled),
    [properties]
  );

  useEffect(() => {
    if (onboardingPropertyId && !enabledProperties.some((p) => p.id === onboardingPropertyId)) {
      setOnboardingPropertyId("");
    }
  }, [enabledProperties, onboardingPropertyId]);

  /**
   * Distribution is the default state. Putting a property on hold is deliberate and must
   * carry a reason, so a listing that stops syncing always explains itself.
   */
  const togglePush = async (id: string, next: boolean) => {
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
  };

  const toggleScope = (id: string) =>
    setRunScopeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
  const runCron = async (fn: string, label: string, scoped = true) => {
    setTriggering(fn);
    const { error } = await supabase.functions.invoke(fn, {
      body: { manual: true, property_ids: scoped && runScopeIds.length ? runScopeIds : undefined },
    });
    setTriggering(null);
    if (error) toast.error(`${label} failed: ${error.message}`);
    else {
      toast.success(`${label} triggered${scoped && runScopeIds.length ? ` for ${scopeLabel}` : ""}`);
      setTimeout(load, 1500);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Channel diagnostics"
        subtitle="Sync logs, errors and coverage — go-live lives under Onboarding"
      />

      <div className="px-6 pb-10 space-y-6">
      <Tabs defaultValue="sync" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sync">Sync observability</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="buildings">Buildings</TabsTrigger>
          <TabsTrigger value="errors">Error handling</TabsTrigger>
          <TabsTrigger value="currency">Currency</TabsTrigger>
          <TabsTrigger value="lnm">Live notifications</TabsTrigger>
          <TabsTrigger value="mcq">Content quality</TabsTrigger>

          <TabsTrigger value="reservations">Reservations</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
        </TabsList>


        <TabsContent value="onboarding" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Go-live moved</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Taking a party live on channels now happens in one workspace — identity through
                publish through connect. This page stays for sync diagnostics.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={onboardingPropertyId} onValueChange={setOnboardingPropertyId}>
                  <SelectTrigger className="w-full md:w-80">
                    <SelectValue placeholder="Choose a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledProperties.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">
                        No properties are enabled for Rentals United yet.
                      </div>
                    ) : (
                      enabledProperties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button asChild size="sm" disabled={!onboardingPropertyId}>
                  <Link to={onboardingPropertyId ? `/admin/onboarding/${onboardingPropertyId}` : "/admin/onboarding"}>
                    Open go-live workspace
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <RuCalendarVerifyPanel properties={enabledProperties} />
          <RuErrorHandlingTab
            runs={runs}
            propertyNameById={new Map(properties.map((p) => [p.id, p.name]))}
          />
        </TabsContent>


        <TabsContent value="buildings">
          <RuBuildingsPanel />
        </TabsContent>


        <TabsContent value="currency">
          <RuCurrencyPanel />
        </TabsContent>

        <TabsContent value="lnm">
          <RuLnmPanel />
        </TabsContent>

        <TabsContent value="mcq">
          <RuMcqReportPanel />
        </TabsContent>


        <TabsContent value="reservations">
          <RuReservationsPanel properties={enabledProperties} />
        </TabsContent>

        <TabsContent value="coverage">
          <RuCoverageTab />
        </TabsContent>



        <TabsContent value="sync" className="space-y-6">
        {/* KPI Cards */}
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

        {/* Endpoint progress tracker — push + pull across the whole RU implementation */}
        <RuSyncProgressTracker
          runs={runs}
          scopeIds={runScopeIds}
          expectedProperties={ruProperties.filter((p) => p.ru_push_enabled).length}
          triggering={triggering}
          onTrigger={runCron}
        />

        {/* Manual triggers */}
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Manual runs</CardTitle>
            <p className="text-xs text-muted-foreground">
              Choose which properties the property-scoped jobs should cover. Account-level jobs
              (RLNM handler, reservations pull) always run globally.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Popover open={scopeOpen} onOpenChange={setScopeOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full sm:w-80 justify-between">
                  <span className="truncate">{scopeLabel}</span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search properties…" />
                  <CommandList>
                    <CommandEmpty>No properties found.</CommandEmpty>
                    <CommandGroup heading="Run scope">
                      <CommandItem value="__all__" onSelect={() => setRunScopeIds([])}>
                        <Check className={`h-4 w-4 mr-2 ${runScopeIds.length === 0 ? "opacity-100" : "opacity-0"}`} />
                        All RU-enabled properties
                      </CommandItem>
                      {ruProperties.map((p) => (
                        <CommandItem key={p.id} value={p.name} onSelect={() => toggleScope(p.id)}>
                          <Check className={`h-4 w-4 mr-2 ${runScopeIds.includes(p.id) ? "opacity-100" : "opacity-0"}`} />
                          <span className="truncate">{p.name}</span>
                          {!p.ru_push_enabled && (
                            <Badge variant="outline" className="ml-auto text-[10px]">on hold</Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {runScopeIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {runScopeIds.map((id) => (
                  <Badge key={id} variant="secondary" className="text-xs cursor-pointer" onClick={() => toggleScope(id)}>
                    {propertyById.get(id)?.name ?? id} ×
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={triggering !== null}
              onClick={() => runCron("cron-push-all-properties-to-ru", "Full content push")}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${triggering === "cron-push-all-properties-to-ru" ? "animate-spin" : ""}`} />
              Full content push
            </Button>
            <Button
              variant="outline"
              disabled={triggering !== null}
              onClick={() => runCron("cron-refresh-ru-ari", "ARI refresh")}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${triggering === "cron-refresh-ru-ari" ? "animate-spin" : ""}`} />
              ARI refresh
            </Button>
            <Button
              variant="outline"
              disabled={triggering !== null}
              onClick={() => runCron("cron-pull-ru-reservations", "Reservations pull", false)}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${triggering === "cron-pull-ru-reservations" ? "animate-spin" : ""}`} />
              Reservations pull
            </Button>
            <Button
              variant="outline"
              disabled={triggering !== null}
              onClick={() => runCron("cron-ru-rlnm-refresh", "RLNM handler refresh", false)}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${triggering === "cron-ru-rlnm-refresh" ? "animate-spin" : ""}`} />
              RLNM handler refresh
            </Button>
            <Button variant="ghost" onClick={load} className="ml-auto">
              <RefreshCw className="h-4 w-4 mr-2" />Reload
            </Button>
            </div>
          </CardContent>
        </Card>

        {/* RU-eligible properties — disabled ones stay listed for manual ramp-up */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle>Auto-managed properties</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Connected properties distribute automatically. Putting one on hold needs a reason and parks its
                changes until the hold is lifted.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="text-xs">
                {ruProperties.filter((p) => p.ru_push_enabled).length}/{ruProperties.length} distributing
              </Badge>
              <Popover open={addOpen} onOpenChange={setAddOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Add property to RU board">
                    <Plus className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Search properties…" />
                    <CommandList>
                      <CommandEmpty>No other properties available.</CommandEmpty>
                      <CommandGroup heading="Add to RU board">
                        {addableProperties.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.name}
                            onSelect={() => {
                              setStickyIds((prev) => new Set(prev).add(p.id));
                              setAddOpen(false);
                              toast.success(`${p.name} added — enable RU push when ready`);
                            }}
                          >
                            {p.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>

          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>PMS</TableHead>
                  <TableHead>Distribution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ruProperties.map((p) => (
                  <TableRow key={p.id} className={p.ru_push_enabled ? undefined : "opacity-70"}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><Badge variant="outline">{p.external_system ?? "—"}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!p.ru_push_enabled}
                          onCheckedChange={(v) => togglePush(p.id, v)}
                        />
                        <Label className="text-xs text-muted-foreground">
                          {p.ru_push_enabled
                            ? "Distributing"
                            : `On hold${p.ru_hold_reason ? ` — ${p.ru_hold_reason}` : ""}`}
                        </Label>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {ruProperties.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No ROLOS PMS properties yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>


        {/* Filters */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Filter className="h-4 w-4" />Sync runs (last 7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 mb-4">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Action" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={successFilter} onValueChange={setSuccessFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outcomes</SelectItem>
                  <SelectItem value="success">Success only</SelectItem>
                  <SelectItem value="failed">Failed only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                <SelectTrigger className="w-[240px]"><SelectValue placeholder="Property" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All enabled properties</SelectItem>
                  {ruProperties
                    .filter((p) => p.ru_push_enabled)
                    .map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const prop = r.property_id ? propertyById.get(r.property_id) : null;
                    return (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                        <TableCell className="text-xs">{format(new Date(r.created_at), "MMM d HH:mm:ss")}</TableCell>
                        <TableCell><Badge variant="outline">{r.action}</Badge></TableCell>
                        <TableCell className="text-sm">{prop?.name ?? r.property_id?.slice(0, 8) ?? "—"}</TableCell>
                        <TableCell>
                          {r.success
                            ? <span className="inline-flex items-center gap-1 text-emerald-600 text-sm"><CheckCircle2 className="h-4 w-4" />OK</span>
                            : <span className="inline-flex items-center gap-1 text-red-600 text-sm"><XCircle className="h-4 w-4" />Fail</span>}
                        </TableCell>
                        <TableCell className="text-xs">{r.http_status ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.elapsed_ms ?? 0} ms</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[240px]">{normalizeRuSyncError(r.error_message) ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No runs match the filter.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        </TabsContent>
      </Tabs>
      </div>


      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>Run detail</SheetTitle></SheetHeader>
          {selected && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Action:</span> {selected.action}</div>
                <div><span className="text-muted-foreground">Batch:</span> <code className="text-xs">{selected.batch_id}</code></div>
                <div><span className="text-muted-foreground">RU ID:</span> {selected.ru_property_id ?? "—"}</div>
                <div><span className="text-muted-foreground">HTTP:</span> {selected.http_status ?? "—"}</div>
                <div><span className="text-muted-foreground">Elapsed:</span> {selected.elapsed_ms ?? 0} ms</div>
                <div><span className="text-muted-foreground">Success:</span> {String(selected.success)}</div>
              </div>
              {selected.error_message && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3">
                  <div className="text-xs font-semibold text-red-800 mb-1">
                    {selected.error_code ?? "Error"}
                  </div>
                  <div className="text-xs text-red-700 whitespace-pre-wrap">{normalizeRuSyncError(selected.error_message)}</div>
                  {normalizeRuSyncError(selected.error_message) !== selected.error_message && (
                    <div className="mt-2 text-xs text-red-700/80 whitespace-pre-wrap">RU raw message: {selected.error_message}</div>
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
    </AppLayout>
  );
}
