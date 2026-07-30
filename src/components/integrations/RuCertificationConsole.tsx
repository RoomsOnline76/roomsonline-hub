import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  RefreshCw, CheckCircle2, XCircle, MinusCircle, PlayCircle, ShieldCheck,
  Clock, Percent, Users, ChevronRight, Plus, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

interface PropertyLite {
  id: string;
  name: string;
  ru_push_enabled: boolean | null;
  rentalsunited_property_id: string | null;
}

interface CertStep {
  step: number;
  name: string;
  ru_method: string;
  mandatory: boolean;
  status: "passed" | "failed" | "skipped";
  duration_ms: number;
  ru_status_id?: string | null;
  detail?: string;
  request?: unknown;
  response_preview?: string | null;
}

interface CertRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  suite: string;
  property_id: string | null;
  ru_property_id: string | null;
  passed: number | null;
  failed: number | null;
  total: number | null;
  steps?: CertStep[] | null;
}

interface CadenceRule {
  key: string;
  label: string;
  ru_method: string;
  max_age_hours: number;
  last_run_at: string | null;
  age_hours: number | null;
  next_due_at: string | null;
  state: "green" | "amber" | "red";
}
interface CronJob {
  jobname: string;
  schedule: string;
  active: boolean;
  last_run_at: string | null;
  last_status: string | null;
}

interface ExpectedJob {
  jobname: string;
  schedule: string;
  fn: string;
  label: string;
}


interface ReadinessRow {
  property_id: string;
  name: string;
  ru_property_id: string | null;
  multi_unit?: boolean;
  unit_count?: number;
  ok: boolean;
  gaps: string[];
  error?: string;
  checks_total?: number;
  checks_passed?: number;
  score?: number;
  ari?: {
    ru_property_id: number;
    date_from: string;
    date_to: string;
    open_days: number;
    price_points: number;
    availability_ok: boolean;
    prices_ok: boolean;
  } | null;
}

interface DiscountRow {
  id: string;
  property_id: string;
  discount_type: "long_stay" | "last_minute";
  threshold: number;
  discount_percent: number;
  date_from: string | null;
  date_to: string | null;
  is_active: boolean;
}

const SUITES = [
  { value: "read_only", label: "Read-only sweep (safe)" },
  { value: "mandatory", label: "Mandatory push + read-back" },
  { value: "discounts", label: "Discounts (long stay + last minute)" },
  { value: "full", label: "Full certification run" },
];

function StatusIcon({ status }: { status: CertStep["status"] }) {
  if (status === "passed") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-600" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
}

async function callPortal<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke("ru-cert-portal", { body: { action, ...payload } });
  if (error) {
    toast.error(error.message);
    return null;
  }
  if (data && data.success === false) {
    toast.error(data.error?.message ?? "Request failed");
    return null;
  }
  return data as T;
}

export function RuCertificationConsole({ properties }: { properties: PropertyLite[] }) {
  const [suite, setSuite] = useState("read_only");
  const [propertyId, setPropertyId] = useState<string>("none");
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<CertRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<CertRun | null>(null);
  const [selectedStep, setSelectedStep] = useState<CertStep | null>(null);

  const [cadence, setCadence] = useState<CadenceRule[]>([]);
  const [cadenceLoading, setCadenceLoading] = useState(false);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [expectedJobs, setExpectedJobs] = useState<ExpectedJob[]>([]);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<ReadinessRow[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(false);

  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [draft, setDraft] = useState({ discount_type: "long_stay", threshold: "7", discount_percent: "10", date_from: "", date_to: "" });

  const [userMgmt, setUserMgmt] = useState<{ enabled: boolean; note: string; probe?: any } | null>(null);

  const candidateProperties = useMemo(
    () => properties.filter((p) => p.ru_push_enabled || p.rentalsunited_property_id),
    [properties],
  );

  const loadRuns = useCallback(async () => {
    const res = await callPortal<{ runs: CertRun[] }>("list_runs");
    if (res) setRuns(res.runs ?? []);
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const loadCadence = useCallback(async () => {
    setCadenceLoading(true);
    const res = await callPortal<{ rules: CadenceRule[]; jobs: CronJob[]; expected_jobs: ExpectedJob[] }>("compliance");
    if (res) {
      setCadence(res.rules ?? []);
      setJobs(res.jobs ?? []);
      setExpectedJobs(res.expected_jobs ?? []);
    }
    setCadenceLoading(false);
  }, []);

  const runJob = async (fn: string) => {
    setRunningJob(fn);
    const res = await callPortal("run_job", { function_name: fn });
    setRunningJob(null);
    if (res) {
      toast.success("Job executed");
      loadCadence();
    }
  };


  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true);
    const res = await callPortal<{ properties: ReadinessRow[] }>("wl_readiness");
    if (res) setReadiness(res.properties ?? []);
    setReadinessLoading(false);
  }, []);

  const loadDiscounts = useCallback(async () => {
    if (propertyId === "none") { setDiscounts([]); return; }
    setDiscountsLoading(true);
    const { data, error } = await supabase
      .from("ru_discounts")
      .select("id, property_id, discount_type, threshold, discount_percent, date_from, date_to, is_active")
      .eq("property_id", propertyId)
      .order("discount_type")
      .order("threshold");
    if (error) toast.error(error.message);
    else setDiscounts((data ?? []) as DiscountRow[]);
    setDiscountsLoading(false);
  }, [propertyId]);

  useEffect(() => { loadDiscounts(); }, [loadDiscounts]);

  const runSuite = async () => {
    setRunning(true);
    const res = await callPortal<{ run: CertRun }>("run_suite", {
      suite,
      property_id: propertyId === "none" ? null : propertyId,
    });
    setRunning(false);
    if (res?.run) {
      setSelectedRun(res.run);
      toast.success(`Run complete — ${res.run.passed}/${res.run.total} passed`);
      loadRuns();
    }
  };

  const pushDiscountsNow = async () => {
    setRunning(true);
    const res = await callPortal<{ run: CertRun }>("run_suite", {
      suite: "discounts",
      property_id: propertyId === "none" ? null : propertyId,
    });
    setRunning(false);
    if (res?.run) {
      setSelectedRun(res.run);
      toast.success(`Discount push complete — ${res.run.passed}/${res.run.total} steps passed`);
      loadRuns();
    }
  };

  const openRun = async (run: CertRun) => {
    const res = await callPortal<{ run: CertRun }>("get_run", { run_id: run.id });
    setSelectedRun(res?.run ?? run);
  };

  const addDiscount = async () => {
    if (propertyId === "none") return;
    const threshold = Number(draft.threshold);
    const percent = Number(draft.discount_percent);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      toast.error("Threshold must be greater than 0");
      return;
    }
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
      toast.error("Discount must be between 1 and 99%");
      return;
    }
    if (draft.date_from && draft.date_to && draft.date_from > draft.date_to) {
      toast.error("Valid-from must be on or before valid-to");
      return;
    }
    const clash = discounts.some(
      (d) => d.discount_type === draft.discount_type && d.threshold === threshold && (d.date_from ?? "") === (draft.date_from ?? ""),
    );
    if (clash) {
      toast.error("A rule with that threshold and start date already exists");
      return;
    }
    const { error } = await supabase.from("ru_discounts").insert({
      property_id: propertyId,
      discount_type: draft.discount_type,
      threshold,
      discount_percent: percent,
      date_from: draft.date_from || null,
      date_to: draft.date_to || null,
      is_active: true,
    });
    if (error) toast.error(error.message);
    else { toast.success("Discount rule added"); loadDiscounts(); }
  };

  const toggleDiscount = async (row: DiscountRow, next: boolean) => {
    const { error } = await supabase.from("ru_discounts").update({ is_active: next }).eq("id", row.id);
    if (error) toast.error(error.message);
    else setDiscounts((prev) => prev.map((d) => (d.id === row.id ? { ...d, is_active: next } : d)));
  };

  const deleteDiscount = async (row: DiscountRow) => {
    const { error } = await supabase.from("ru_discounts").delete().eq("id", row.id);
    if (error) toast.error(error.message);
    else { setDiscounts((prev) => prev.filter((d) => d.id !== row.id)); toast.success("Removed"); }
  };

  return (
    <div className="space-y-6">
      {/* Runner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Certification runner</CardTitle>
          <CardDescription>
            Exercises the RU endpoints required for White-Label certification and stores request/response evidence.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs">Suite</Label>
            <Select value={suite} onValueChange={setSuite}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUITES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs">Property (required for push &amp; discount suites)</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Account-level only</SelectItem>
                {candidateProperties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={runSuite} disabled={running} className="gap-2">
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Run suite
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="runs" className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Runs</TabsTrigger>
          <TabsTrigger value="cadence" className="gap-1.5" onClick={loadCadence}><Clock className="h-3.5 w-3.5" />Refresh compliance</TabsTrigger>
          <TabsTrigger value="discounts" className="gap-1.5"><Percent className="h-3.5 w-3.5" />Discounts</TabsTrigger>
          <TabsTrigger value="readiness" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />WL readiness</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5" onClick={async () => setUserMgmt(await callPortal("user_management"))}>
            <Users className="h-3.5 w-3.5" />User management
          </TabsTrigger>
        </TabsList>

        {/* Runs */}
        <TabsContent value="runs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent certification runs</CardTitle>
              <Button variant="ghost" size="sm" onClick={loadRuns}><RefreshCw className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Suite</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => openRun(r)}>
                      <TableCell className="text-xs">{format(new Date(r.started_at), "MMM d HH:mm")}</TableCell>
                      <TableCell><Badge variant="outline">{r.suite}</Badge></TableCell>
                      <TableCell className="text-sm">
                        {properties.find((p) => p.id === r.property_id)?.name ?? "Account-level"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "passed" ? "default" : r.status === "running" ? "secondary" : "destructive"}>
                          {r.passed ?? 0}/{r.total ?? 0} passed
                        </Badge>
                      </TableCell>
                      <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                  {runs.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No runs yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cadence */}
        <TabsContent value="cadence">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Refresh cadence compliance</CardTitle>
                <CardDescription>RU requires ARI refreshed at least every 24h and the RLNM handler re-subscribed daily.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={loadCadence}><RefreshCw className={`h-4 w-4 ${cadenceLoading ? "animate-spin" : ""}`} /></Button>
            </CardHeader>
            <CardContent>
              {cadence.length === 0 && !cadenceLoading && (
                <p className="text-sm text-muted-foreground">Press refresh to evaluate cadence.</p>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {cadence.map((c) => (
                  <div key={c.key} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{c.label}</span>
                      <Badge variant={c.state === "green" ? "default" : c.state === "amber" ? "secondary" : "destructive"}>
                        {c.state === "green" ? "Compliant" : c.state === "amber" ? "Due soon" : "Overdue"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{c.ru_method}</p>
                    <p className="text-xs text-muted-foreground">
                      Max age {c.max_age_hours}h · Last success{" "}
                      {c.last_run_at ? `${format(new Date(c.last_run_at), "MMM d HH:mm")} (${c.age_hours}h ago)` : "never"}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Scheduled jobs</CardTitle>
              <CardDescription>
                Automation backing the cadence above. A missing job means the refresh only happens when triggered manually.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Last run</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expectedJobs.map((e) => {
                    const live = jobs.find((j) => j.jobname === e.jobname);
                    return (
                      <TableRow key={e.jobname}>
                        <TableCell>
                          <div className="text-sm font-medium">{e.label}</div>
                          <div className="text-xs font-mono text-muted-foreground">{e.jobname}</div>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{live?.schedule ?? e.schedule}</TableCell>
                        <TableCell className="text-xs">
                          {live?.last_run_at ? `${format(new Date(live.last_run_at), "MMM d HH:mm")} · ${live.last_status}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={live?.active ? "default" : "destructive"}>
                            {live ? (live.active ? "Scheduled" : "Paused") : "Not scheduled"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" disabled={runningJob === e.fn} onClick={() => runJob(e.fn)} className="gap-1.5">
                            {runningJob === e.fn
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <PlayCircle className="h-3.5 w-3.5" />}
                            Run now
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {expectedJobs.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Refresh to load job status.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Discounts */}
        <TabsContent value="discounts">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Long-stay &amp; last-minute discounts</CardTitle>
              <CardDescription>
                Pushed with <code className="font-mono text-xs">Push_PutLongStayDiscounts_RQ</code> and{" "}
                <code className="font-mono text-xs">Push_PutLastMinuteDiscounts_RQ</code> by the “Discounts” suite.
                Select a property above to author rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {propertyId === "none" ? (
                <p className="text-sm text-muted-foreground">Select a property in the runner to manage its discounts.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Type</Label>
                      <Select value={draft.discount_type} onValueChange={(v) => setDraft({ ...draft, discount_type: v })}>
                        <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="long_stay">Long stay (nights)</SelectItem>
                          <SelectItem value="last_minute">Last minute (days out)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{draft.discount_type === "long_stay" ? "Min nights" : "Days before arrival"}</Label>
                      <Input className="w-[150px]" type="number" min={1} value={draft.threshold}
                        onChange={(e) => setDraft({ ...draft, threshold: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Discount %</Label>
                      <Input className="w-[120px]" type="number" min={1} max={99} value={draft.discount_percent}
                        onChange={(e) => setDraft({ ...draft, discount_percent: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Valid from</Label>
                      <Input className="w-[160px]" type="date" value={draft.date_from}
                        onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Valid to</Label>
                      <Input className="w-[160px]" type="date" value={draft.date_to}
                        onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
                    </div>
                    <Button onClick={addDiscount} className="gap-1.5"><Plus className="h-4 w-4" />Add rule</Button>
                    <Button variant="outline" disabled={running || discounts.length === 0} onClick={pushDiscountsNow} className="gap-1.5">
                      <Percent className="h-4 w-4" />Push &amp; verify now
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave the dates blank to apply the rule for the next 365 days. Rules also travel with the weekly
                    content push to Rentals United.
                  </p>

                  {discountsLoading ? <Skeleton className="h-24 w-full" /> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Threshold</TableHead>
                          <TableHead>Discount</TableHead>
                          <TableHead>Validity</TableHead>
                          <TableHead>Active</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discounts.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell><Badge variant="outline">{d.discount_type === "long_stay" ? "Long stay" : "Last minute"}</Badge></TableCell>
                            <TableCell>{d.threshold} {d.discount_type === "long_stay" ? "nights" : "days out"}</TableCell>
                            <TableCell>{d.discount_percent}%</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {d.date_from || d.date_to ? `${d.date_from ?? "—"} → ${d.date_to ?? "—"}` : "Next 365 days"}
                            </TableCell>
                            <TableCell><Switch checked={d.is_active} onCheckedChange={(v) => toggleDiscount(d, v)} /></TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => deleteDiscount(d)}>
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {discounts.length === 0 && (
                          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No discount rules yet.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Readiness */}
        <TabsContent value="readiness">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">White-Label minimum inventory readiness</CardTitle>
                <CardDescription>
                  Name, ObjectTypeID, CanSleepMax, street/ZIP/geo, DetailedLocationID, size &amp; floor, description,
                  ≥10 images (1024×683+) with a main photo, ≥10 amenities, composition rooms, beds covering max guests,
                  payment method, cancellation policy, plus live 365-day availability and pricing above zero.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadReadiness} disabled={readinessLoading} className="gap-1.5">
                <RefreshCw className={`h-4 w-4 ${readinessLoading ? "animate-spin" : ""}`} />Check all
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {readinessLoading && <Skeleton className="h-32 w-full" />}
              {!readinessLoading && readiness.length === 0 && (
                <p className="text-sm text-muted-foreground">Run a check to evaluate every RU-enabled property.</p>
              )}
              {readiness.map((r) => (
                <div key={r.property_id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="font-medium text-sm">{r.name}</span>
                      {r.unit_count ? <span className="text-xs text-muted-foreground ml-2">{r.unit_count} unit(s)</span> : null}
                      {r.ari && (
                        <span className="text-xs text-muted-foreground ml-2">
                          · {r.ari.open_days} open day(s) · {r.ari.price_points} price point(s)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {typeof r.score === "number" && (
                        <Badge variant="outline">
                          {r.score}% ({r.checks_passed ?? 0}/{r.checks_total ?? 0})
                        </Badge>
                      )}
                      <Badge variant={r.ok ? "default" : "destructive"}>{r.ok ? "Ready" : `${r.gaps.length} gap(s)`}</Badge>
                    </div>
                  </div>
                  {!r.ok && (
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground list-disc list-inside">
                      {r.gaps.map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users">
          <Card>
            <CardHeader><CardTitle className="text-base">RU user management</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Alert>
                <AlertTitle>Parked — awaiting Rentals United confirmation</AlertTitle>
                <AlertDescription className="text-xs">
                  {userMgmt?.note ?? "Sub-user creation stays disabled until RU confirms the PMS profile. Guest Communication API is out of scope for this phase."}
                </AlertDescription>
              </Alert>
              {userMgmt?.probe && (
                <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap">
                  {typeof userMgmt.probe === "string" ? userMgmt.probe : JSON.stringify(userMgmt.probe, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Run detail sheet */}
      <Sheet open={!!selectedRun} onOpenChange={(o) => { if (!o) { setSelectedRun(null); setSelectedStep(null); } }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>Certification run</SheetTitle></SheetHeader>
          {selectedRun && (
            <div className="mt-4 space-y-3">
              <div className="text-xs text-muted-foreground">
                {selectedRun.suite} · {format(new Date(selectedRun.started_at), "MMM d HH:mm")} ·{" "}
                RU property {selectedRun.ru_property_id ?? "—"}
              </div>
              {(selectedRun.steps ?? []).map((s) => (
                <div key={s.step} className="rounded-lg border p-3 space-y-1">
                  <button className="flex items-start gap-2 w-full text-left" onClick={() => setSelectedStep(selectedStep?.step === s.step ? null : s)}>
                    <StatusIcon status={s.status} />
                    <div className="flex-1">
                      <div className="text-sm font-medium flex items-center gap-2">
                        {s.name}
                        {s.mandatory && <Badge variant="outline" className="text-[10px]">mandatory</Badge>}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">{s.ru_method}</div>
                      {s.detail && <div className="text-xs text-muted-foreground mt-1">{s.detail}</div>}
                    </div>
                    <span className="text-xs text-muted-foreground">{s.duration_ms}ms</span>
                  </button>
                  {selectedStep?.step === s.step && (
                    <div className="space-y-2 pt-2">
                      {s.request != null && (
                        <pre className="text-[11px] bg-muted rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                          {JSON.stringify(s.request, null, 2)}
                        </pre>
                      )}
                      {s.response_preview && (
                        <pre className="text-[11px] bg-muted rounded p-2 overflow-auto max-h-72 whitespace-pre-wrap">
                          {s.response_preview}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
