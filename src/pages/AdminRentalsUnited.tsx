import { useCallback, useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { RefreshCw, CheckCircle2, XCircle, Filter, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { RuCertificationConsole } from "@/components/integrations/RuCertificationConsole";
import { RuErrorHandlingTab } from "@/components/integrations/RuErrorHandlingTab";
import { RuOnboardingPipeline } from "@/components/integrations/RuOnboardingPipeline";


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
        .select("id, name, slug, external_system, ru_push_enabled, rentalsunited_property_id")
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
          p.external_system === "rolos" ||
          !!p.ru_push_enabled ||
          !!p.rentalsunited_property_id ||
          stickyIds.has(p.id)
      ),
    [properties, stickyIds]
  );

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

  const togglePush = async (id: string, next: boolean) => {
    const { error } = await supabase
      .from("properties")
      .update({ ru_push_enabled: next })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStickyIds((prev) => new Set(prev).add(id));
    setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, ru_push_enabled: next } : p)));
    toast.success(next ? "RU push enabled" : "RU push disabled — property stays listed");
  };

  const runCron = async (fn: string, label: string) => {
    setTriggering(fn);
    const { error } = await supabase.functions.invoke(fn, { body: { manual: true } });
    setTriggering(null);
    if (error) toast.error(`${label} failed: ${error.message}`);
    else {
      toast.success(`${label} triggered`);
      setTimeout(load, 1500);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Rentals United — White-Label Sync"
        subtitle="Observability for auto-managed ROLOS PMS sync"
      />

      <div className="px-6 pb-10 space-y-6">
      <Tabs defaultValue="sync" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sync">Sync observability</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="errors">Error handling</TabsTrigger>
          <TabsTrigger value="cert">Certification &amp; compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="onboarding" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Property</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={onboardingPropertyId} onValueChange={setOnboardingPropertyId}>
                <SelectTrigger className="w-full md:w-96">
                  <SelectValue placeholder="Select a property to onboard" />
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
            </CardContent>
          </Card>
          {onboardingPropertyId ? (
            <RuOnboardingPipeline propertyId={onboardingPropertyId} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Pick an RU-enabled property to walk the four-phase Rentals United onboarding.
            </p>
          )}
        </TabsContent>

        <TabsContent value="errors">
          <RuErrorHandlingTab
            runs={runs}
            propertyNameById={new Map(properties.map((p) => [p.id, p.name]))}
          />
        </TabsContent>

        <TabsContent value="cert">
          <RuCertificationConsole properties={properties} />
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

        {/* Manual triggers */}
        <Card>
          <CardHeader><CardTitle>Manual runs</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
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
              onClick={() => runCron("pull-ru-reservations", "Reservations pull")}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${triggering === "pull-ru-reservations" ? "animate-spin" : ""}`} />
              Reservations pull
            </Button>
            <Button variant="ghost" onClick={load} className="ml-auto">
              <RefreshCw className="h-4 w-4 mr-2" />Reload
            </Button>
          </CardContent>
        </Card>

        {/* RU-eligible properties — disabled ones stay listed for manual ramp-up */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle>Auto-managed properties</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Switching a property off pauses its RU sync but keeps it here — re-enable it any time to ramp up.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="text-xs">
                {ruProperties.filter((p) => p.ru_push_enabled).length}/{ruProperties.length} enabled
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
                  <TableHead>RU push</TableHead>
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
                          {p.ru_push_enabled ? "Enabled" : "Paused"}
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
