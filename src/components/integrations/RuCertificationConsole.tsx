import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  RefreshCw, CheckCircle2, XCircle, MinusCircle, PlayCircle, ShieldCheck,
  Clock, Percent, Users, ChevronRight, Plus, Trash2, Send, AlertTriangle, ListChecks, CalendarRange, Tags,
} from "lucide-react";
import { RuCoverageTab } from "./RuCoverageTab";
import { RuAvailabilityPlayground } from "./RuAvailabilityPlayground";
import { RuPricingPlayground } from "./RuPricingPlayground";


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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { extractFunctionError } from "@/lib/functionError";
import { useRuRunCooldown } from "@/hooks/useRuRunCooldown";

interface PropertyLite {
  id: string;
  name: string;
  ru_push_enabled: boolean | null;
  rentalsunited_property_id: string | null;
}

interface RuUserEndpoint {
  action: string;
  ru_method: string;
  implemented: boolean;
  gated: boolean;
  status: string;
}

interface UserMgmtState {
  enabled: boolean;
  note: string;
  updated_at?: string | null;
  guest_communication?: string;
  endpoints?: RuUserEndpoint[];
  users?: { id?: string; email?: string; name?: string; owner_id?: string; user_account_id?: string; archived?: boolean }[];
  probe?: unknown;
}

interface CertStep {
  step: number;
  name: string;
  ru_method: string;
  mandatory: boolean;
  scope?: "account" | "property";
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
  content_quality?: {
    checked_at: string;
    units: Array<{
      unit: string | null;
      name_clean: boolean | null;
      name_issues: string[];
      description_chars: number | null;
      description_meets_cert: boolean | null;
      images_count: number | null;
      images_meeting_cert_size: number | null;
      images_unmeasured: number | null;
      smallest_image: string | null;
      has_main_image: boolean | null;
      has_street: boolean | null;
      has_zip_code: boolean | null;
      has_detailed_location_id: boolean | null;
      has_coordinates: boolean | null;
      can_sleep_max: number | null;
      has_cancellation_policies: boolean | null;
      has_payment_methods: boolean | null;
      check_in_from: string | null;
      check_out_until: string | null;
      bedroom_blocks: number | null;
      bedrooms_with_beds: number | null;
      has_kitchen: boolean | null;
      has_bathroom_room: boolean | null;
      beds_distributed: boolean | null;
      total_bed_capacity: number | null;
      arrival_instructions_chars: number | null;
    }>;
    bookable_window?: Array<{
      ru_property_id: number;
      longest_run: number | null;
      first_window: string | null;
      min_stay_set: boolean | null;
      open_days: number | null;
    }> | null;
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

/** Derived ladder returned by the cert portal's `discount_ladder` action. */
interface LadderLongStay {
  date_from: string;
  date_to: string;
  nights_from: number;
  nights_to: number | null;
  percentage: number;
  source: "manual" | "special";
  source_label: string;
}
interface LadderLastMinute {
  date_from: string;
  date_to: string;
  days_to_arrival_from: number;
  days_to_arrival_to: number | null;
  percentage: number;
  source: "manual" | "special";
  source_label: string;
}
interface DiscountLadder {
  longStay: LadderLongStay[];
  lastMinute: LadderLastMinute[];
  warnings: string[];
  unmapped: { id: string; name: string; reason: string }[];
}
interface LadderResponse {
  ladder: DiscountLadder;
  validation: { ok: boolean; errors: string[] };
  summary: { long_stay: string; last_minute: string };
}

const SUITES: { value: string; label: string; requiresProperty: boolean; coverage: string }[] = [
  {
    value: "read_only",
    label: "Read-only sweep (safe)",
    requiresProperty: false,
    coverage: "Account reads (auth, properties, reservations, leads, reference data). Property reads only when a property is selected.",
  },
  {
    value: "mandatory",
    label: "Mandatory push + read-back",
    requiresProperty: true,
    coverage: "RLNM handler (account) plus content + ARI push and read-back for the selected property.",
  },
  {
    value: "discounts",
    label: "Discounts (long stay + last minute)",
    requiresProperty: true,
    coverage: "Pushes and verifies the selected property's discount rules.",
  },
  {
    value: "full",
    label: "Full certification run",
    requiresProperty: true,
    coverage: "Everything above end to end.",
  },
];

/** Live test sub-user used for WL user-management playground defaults */
const TEST_SUBUSER = {
  email: "test-owner@example.com",
  password: "FqEqXyFyE799**",
  owner_id: 741776,
  first_name: "Test",
  last_name: "Owner",
  /** Sub-user API keys (RU dashboard → Security settings). Paste before running. */
  access_key: "",
  secret_key: "",
} as const;


/** User-management endpoints for the side-by-side playground */
const USER_ENDPOINTS = [
  {
    key: "list_users",
    label: "Pull_ListMyUsers_RQ",
    description: "List every sub-user under the master account (master AccessKey/SecretKey). OwnerID is the real identifier — user_account_id is often 0.",
    route: "rentalsunited-api",
    defaultPayload: { action: "list_users" },
  },
  {
    key: "create_user",
    label: "Push_CreateUser_RQ",
    description: "Create a white-label sub-user. Requires location_ids ≥ 1 and a 12+ char policy password (upper + lower + digit + special, must not contain email).",
    route: "rentalsunited-api",
    defaultPayload: {
      action: "create_user",
      user: {
        first_name: TEST_SUBUSER.first_name,
        last_name: TEST_SUBUSER.last_name,
        email: TEST_SUBUSER.email,
        password: TEST_SUBUSER.password,
      },
      location_ids: [1611],
    },
  },
  {
    key: "fill_company_details",
    label: "Push_FillCompanyDetails_RQ",
    description:
      "Fill company details for a sub-user. MUST authenticate AS the child with its own API keys (auth_access_key + auth_secret_key). Leave the keys blank to use the pair stored for that OwnerID. owner_id is still required for isolation logging.",
    route: "rentalsunited-api",
    defaultPayload: {
      action: "fill_company_details",
      owner_id: TEST_SUBUSER.owner_id,
      auth_access_key: TEST_SUBUSER.access_key,
      auth_secret_key: TEST_SUBUSER.secret_key,
      company: {
        first_name: TEST_SUBUSER.first_name,
        last_name: TEST_SUBUSER.last_name,
        email: TEST_SUBUSER.email,
        phone: "+27000000000",
        city: "Cape Town",
        country_id: 196,
        address: "Address on file",
        zip_code: "8001",
        language_id: 1,
        name: "Test Portfolio",
        website: "https://sleepinafrica.roomsonline.co.za",
        location_ids: [1611],
      },
    },
  },
  {
    key: "verify_child_login",
    label: "verify_child_login",
    description:
      "Probe the sub-user's own AccessKey/SecretKey against RU (Pull_ListBuildings under child auth). Must return verified:true before fill_company_details or building pushes will succeed. Legacy accounts may still pass auth_username + auth_password.",
    route: "rentalsunited-api",
    defaultPayload: {
      action: "verify_child_login",
      owner_id: TEST_SUBUSER.owner_id,
      auth_access_key: TEST_SUBUSER.access_key,
      auth_secret_key: TEST_SUBUSER.secret_key,
    },
  },
  {
    key: "list_child_api_keys",
    label: "Pull_GetApiKeys_RQ",
    description:
      "List the API keys on a sub-user account. Authenticates with that sub-user's existing key pair (stored per OwnerID when the keys are left blank).",
    route: "rentalsunited-api",
    defaultPayload: {
      action: "list_child_api_keys",
      owner_id: TEST_SUBUSER.owner_id,
    },
  },
  {
    key: "create_child_api_key",
    label: "Push_CreateApiKey_RQ",
    description:
      "Mint an additional API key pair for a sub-user (Scope XmlApi). Requires an existing key pair for that same account — the FIRST pair must be generated in the RU dashboard → Security settings.",
    route: "rentalsunited-api",
    defaultPayload: {
      action: "create_child_api_key",
      owner_id: TEST_SUBUSER.owner_id,
      key_label: "ROLOS",
    },
  },
  {
    key: "archive_user",
    label: "Push_ArchiveUser_RQ",
    description:
      "Archive a sub-user via the isolated ru-close-user edge function. Authenticates with the sub-user's own API keys (stored per OwnerID, or pass access_key + secret_key). Accepts a local ru_owner_accounts.id or a bare ru_owner_id.",
    route: "ru-close-user",
    defaultPayload: {
      account_id: "",
      ru_owner_id: "",
    },
  },

] as const;

function StatusIcon({ status }: { status: CertStep["status"] }) {
  if (status === "passed") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-600" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
}

function ScopeBadge({ scope }: { scope?: "account" | "property" }) {
  if (!scope) return null;
  return (
    <Badge variant="outline" className="text-[10px] capitalize">
      {scope}
    </Badge>
  );
}

async function callPortal<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke("ru-cert-portal", { body: { action, ...payload } });
  if (error) {
    toast.error(await extractFunctionError(error, "Request failed"));
    return null;
  }
  if (data && data.success === false) {
    toast.error(data.error?.message ?? "Request failed");
    return null;
  }
  return data as T;
}

interface CertMilestone {
  key: string;
  label: string;
  ru_method: string;
  mandatory: boolean;
  scope?: "account" | "property";
  note: string;
  status: string;
  partial_success: boolean;
  ru_status_id: string | null;
  detail: string | null;
  last_run_at: string | null;
  run_id: string | null;
}

interface MilestoneSummary {
  mandatory_total: number;
  mandatory_passed: number;
  partial: number;
  never_run: number;
}


/** Human labels for the staged phases of a full certification run. */
const PHASE_LABELS: Record<string, string> = {
  read_only: "read-only sweep",
  mandatory: "mandatory pushes",
  discounts: "discount ladder",
};

export function RuCertificationConsole({
  properties,
  initialTab,
  variant = "cert",
}: {
  properties: PropertyLite[];
  /** Optional deep-open target sub-tab. Omitted = the variant's first tab. */
  initialTab?: string;
  /**
   * `cert` = the operator console (milestones, coverage, windows, discounts, readiness, users).
   * `advanced` = the engineers' surface: the certification runner, its recent runs and refresh
   * compliance, rendered from the Channel Monitor's Advanced tab.
   */
  variant?: "cert" | "advanced";
}) {

  const [suite, setSuite] = useState("read_only");
  const { cooldownSeconds, cooling, markRun } = useRuRunCooldown();
  const [propertyId, setPropertyId] = useState<string>("none");
  const [running, setRunning] = useState(false);
  /** Which phase of a staged full run is in flight, for the button label. */
  const [phaseProgress, setPhaseProgress] = useState<{ label: string; index: number; total: number } | null>(null);

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

  const [milestones, setMilestones] = useState<CertMilestone[]>([]);
  const [milestoneSummary, setMilestoneSummary] = useState<MilestoneSummary | null>(null);
  const [milestonesLoading, setMilestonesLoading] = useState(false);


  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [ladder, setLadder] = useState<LadderResponse | null>(null);
  const [ladderLoading, setLadderLoading] = useState(false);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [draft, setDraft] = useState({ discount_type: "long_stay", threshold: "7", discount_percent: "10", date_from: "", date_to: "" });

  const [userMgmt, setUserMgmt] = useState<UserMgmtState | null>(null);
  const [userMgmtLoading, setUserMgmtLoading] = useState(false);
  const [showArchivedUsers, setShowArchivedUsers] = useState(false);
  const [savingFlag, setSavingFlag] = useState(false);
  const [userDraft, setUserDraft] = useState({ first_name: "", last_name: "", email: "", password: "" });
  const [creatingUser, setCreatingUser] = useState(false);

  // Side-by-side endpoint playground
  const [pgEndpoint, setPgEndpoint] = useState<string>(USER_ENDPOINTS[0].key);
  const [pgPayload, setPgPayload] = useState(JSON.stringify(USER_ENDPOINTS[0].defaultPayload, null, 2));
  const [pgResponse, setPgResponse] = useState<string>("");
  const [pgSending, setPgSending] = useState(false);

  const activeSuite = useMemo(() => SUITES.find((s) => s.value === suite) ?? SUITES[0], [suite]);

  /**
   * Throwaway sandbox logins that Rentals United will not let us archive. They are never used
   * for real inventory, so they are always hidden from the sub-user list.
   */
  const isHiddenTestLogin = (email?: string) => {
    const e = (email ?? "").toLowerCase();
    return e === "test-owner@example.com" || e.startsWith("rolo-apitest");
  };

  const allSubUsers = userMgmt?.users ?? [];
  const visibleSubUsers = useMemo(
    () =>
      allSubUsers.filter(
        (u) => !isHiddenTestLogin(u.email) && (showArchivedUsers || !u.archived),
      ),
    [allSubUsers, showArchivedUsers],
  );
  const archivedCount = useMemo(
    () => allSubUsers.filter((u) => !isHiddenTestLogin(u.email) && u.archived).length,
    [allSubUsers],
  );



  const candidateProperties = useMemo(
    // Certification testing is limited to properties explicitly enabled for RU push.
    () => properties.filter((p) => p.ru_push_enabled === true),
    [properties],
  );

  const loadRuns = useCallback(async () => {
    const res = await callPortal<{ runs: CertRun[] }>("list_runs");
    if (res) {
      setRuns(res.runs ?? []);
      if (res.runs?.[0]?.started_at) markRun(res.runs[0].started_at);
    }
  }, [markRun]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const loadMilestones = useCallback(async () => {
    setMilestonesLoading(true);
    const res = await callPortal<{ milestones: CertMilestone[]; summary: MilestoneSummary }>("milestones");
    if (res) {
      setMilestones(res.milestones ?? []);
      setMilestoneSummary(res.summary ?? null);
    }
    setMilestonesLoading(false);
  }, []);

  const downloadEvidence = useCallback(async (runId: string) => {
    const res = await callPortal<{ evidence: Record<string, unknown> }>("evidence", { run_id: runId });
    if (!res?.evidence) return;
    const blob = new Blob([JSON.stringify(res.evidence, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ru-certification-evidence-${runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Evidence bundle downloaded");
  }, []);



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

  const loadUserMgmt = useCallback(async () => {
    setUserMgmtLoading(true);
    const res = await callPortal<UserMgmtState>("user_management");
    if (res) setUserMgmt(res);
    setUserMgmtLoading(false);
  }, []);

  const toggleUserMgmt = async (enabled: boolean) => {
    setSavingFlag(true);
    const res = await callPortal<{ enabled: boolean; note: string }>("set_user_management", { enabled });
    setSavingFlag(false);
    if (res) {
      toast.success(enabled ? "RU user management enabled" : "RU user management parked");
      loadUserMgmt();
    }
  };

  const createRuUser = async () => {
    const { first_name, last_name, email, password } = userDraft;
    if (!first_name || !last_name || !email || password.length < 8) {
      toast.error("First name, last name, email and an 8+ character password are required");
      return;
    }
    setCreatingUser(true);
    const res = await callPortal("create_user", { user: userDraft });
    setCreatingUser(false);
    if (res) {
      toast.success("Sub-user request sent to Rentals United");
      setUserDraft({ first_name: "", last_name: "", email: "", password: "" });
      loadUserMgmt();
    }
  };

  const onSelectEndpoint = (key: string) => {
    setPgEndpoint(key);
    const ep = USER_ENDPOINTS.find((e) => e.key === key);
    if (ep) {
      setPgPayload(JSON.stringify(ep.defaultPayload, null, 2));
      setPgResponse("");
    }
  };

  const sendPlayground = async () => {
    const ep = USER_ENDPOINTS.find((e) => e.key === pgEndpoint);
    if (!ep) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(pgPayload);
    } catch {
      toast.error("Payload is not valid JSON");
      return;
    }
    setPgSending(true);
    setPgResponse("");
    try {
      const fn = ep.route;
      const { data, error } = await supabase.functions.invoke(fn, { body: parsed });
      if (error) {
        const msg = await extractFunctionError(error, "Request failed");
        setPgResponse(JSON.stringify({ success: false, error: msg }, null, 2));
        toast.error(msg);
      } else {
        setPgResponse(JSON.stringify(data, null, 2));
        if (data?.success === false) {
          toast.error(data?.error?.message ?? "RU returned failure");
        } else {
          toast.success(`${ep.label} completed`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setPgResponse(JSON.stringify({ success: false, error: msg }, null, 2));
      toast.error(msg);
    } finally {
      setPgSending(false);
    }
  };


  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true);
    setReadiness([]);
    // The sweep is paged server-side (one small batch per invocation) so a long portfolio
    // can never run a worker out of time and report a false payload failure.
    let offset: number | null = 0;
    const rows: ReadinessRow[] = [];
    let guard = 0;
    while (offset !== null && guard++ < 50) {
      const res = await callPortal<{ properties: ReadinessRow[]; next_offset: number | null }>(
        "wl_readiness",
        { offset },
      );
      if (!res) break;
      rows.push(...(res.properties ?? []));
      setReadiness([...rows]);
      offset = res.next_offset ?? null;
    }
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

  /** Derived ladder = manual rules + long-stay / last-minute / advance-purchase specials. */
  const loadLadder = useCallback(async () => {
    if (propertyId === "none") { setLadder(null); return; }
    setLadderLoading(true);
    const res = await callPortal<LadderResponse>("discount_ladder", { property_id: propertyId });
    setLadder(res ?? null);
    setLadderLoading(false);
  }, [propertyId]);

  useEffect(() => { loadDiscounts(); loadLadder(); }, [loadDiscounts, loadLadder]);

  const runSuite = async () => {
    if (cooling) {
      toast.error(`Rentals United allows one call per sliding minute — wait ${cooldownSeconds}s.`);
      return;
    }
    if (activeSuite?.requiresProperty && propertyId === "none") {
      toast.error(`"${activeSuite.label}" needs a property — select one above.`);
      return;
    }
    setRunning(true);
    markRun();
    const property_id = propertyId === "none" ? null : propertyId;

    // A full certification exceeds a single request's lifetime once Rentals United's
    // sliding-minute waits are added up, so it is driven as three consecutive phases that
    // append to one run record — each phase gets a fresh request budget.
    const phases: (string | null)[] = suite === "full" ? ["read_only", "mandatory", "discounts"] : [null];
    let runId: string | null = null;
    let lastRun: CertRun | null = null;

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      if (phase) setPhaseProgress({ label: phase, index: i + 1, total: phases.length });
      const res = await callPortal<{ run: CertRun; run_id?: string }>("run_suite", {
        suite,
        property_id,
        phase,
        run_id: runId,
        final: i === phases.length - 1,
      });
      if (!res?.run) break;
      runId = res.run_id ?? res.run.id;
      lastRun = res.run;
      setSelectedRun(res.run);
    }

    setPhaseProgress(null);
    setRunning(false);
    if (lastRun) {
      toast.success(`Run complete — ${lastRun.passed}/${lastRun.total} passed`);
      loadRuns();
    }
  };


  const pushDiscountsNow = async () => {
    if (cooling) {
      toast.error(`Rentals United allows one call per sliding minute — wait ${cooldownSeconds}s.`);
      return;
    }
    setRunning(true);
    markRun();
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
    else { toast.success("Discount rule added"); loadDiscounts(); loadLadder(); }
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

  const selectedEp = USER_ENDPOINTS.find((e) => e.key === pgEndpoint);

  /**
   * The runner, its run history and refresh compliance live on the engineers' surface; the
   * operator console keeps the evidence tabs. One component, two mounts, no duplicated logic.
   */
  const allowedTabs = variant === "advanced"
    ? ["runs", "cadence"]
    : ["milestones", "coverage", "availability", "pricing", "discounts", "readiness", "users"];
  const shows = (key: string) => allowedTabs.includes(key);
  const defaultTab = initialTab && allowedTabs.includes(initialTab) ? initialTab : allowedTabs[0];

  return (
    <div className="space-y-6">
      {/* Runner — engineers only; the operator console reads the stored evidence instead. */}
      {variant === "advanced" && (
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
                {SUITES.map((s) => (
                  <SelectItem key={s.value} value={s.value} disabled={s.requiresProperty && propertyId === "none"}>
                    {s.label}
                    {s.requiresProperty && propertyId === "none" ? " — needs a property" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs">Property (required for push & discount suites)</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Account-level only</SelectItem>
                {candidateProperties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={runSuite} disabled={running || cooling || (activeSuite.requiresProperty && propertyId === "none")} className="gap-2">
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {cooling
              ? `Rate limit — ${cooldownSeconds}s`
              : phaseProgress
                ? `Phase ${phaseProgress.index}/${phaseProgress.total} — ${PHASE_LABELS[phaseProgress.label] ?? phaseProgress.label}`
                : "Run suite"}

          </Button>
        </CardContent>
        <CardContent className="pt-0 space-y-1">
          <p className="text-xs text-muted-foreground">{activeSuite.coverage}</p>
          {propertyId === "none" && (
            <p className="text-xs text-muted-foreground">
              Account-level only: property-scoped checks (content, availability, prices, buildings, discounts) are skipped
              instead of being graded against an unrelated property.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Rentals United accepts about one call per sliding minute — runs are paused for 60s after each attempt.
          </p>
        </CardContent>
      </Card>
      )}

      <Tabs key={defaultTab} defaultValue={defaultTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          {shows("runs") && (
            <TabsTrigger value="runs" className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Runs</TabsTrigger>
          )}
          {shows("milestones") && (
            <TabsTrigger value="milestones" className="gap-1.5" onClick={loadMilestones}>
              <CheckCircle2 className="h-3.5 w-3.5" />Milestones
            </TabsTrigger>
          )}
          {shows("coverage") && (
            <TabsTrigger value="coverage" className="gap-1.5"><ListChecks className="h-3.5 w-3.5" />Coverage</TabsTrigger>
          )}
          {shows("availability") && (
            <TabsTrigger value="availability" className="gap-1.5"><CalendarRange className="h-3.5 w-3.5" />Availability window</TabsTrigger>
          )}
          {shows("pricing") && (
            <TabsTrigger value="pricing" className="gap-1.5"><Tags className="h-3.5 w-3.5" />Pricing window</TabsTrigger>
          )}
          {shows("cadence") && (
            <TabsTrigger value="cadence" className="gap-1.5" onClick={loadCadence}><Clock className="h-3.5 w-3.5" />Refresh compliance</TabsTrigger>
          )}
          {shows("discounts") && (
            <TabsTrigger value="discounts" className="gap-1.5"><Percent className="h-3.5 w-3.5" />Discounts</TabsTrigger>
          )}
          {shows("readiness") && (
            <TabsTrigger value="readiness" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />WL readiness</TabsTrigger>
          )}
          {shows("users") && (
            <TabsTrigger value="users" className="gap-1.5" onClick={loadUserMgmt}>
              <Users className="h-3.5 w-3.5" />User management
            </TabsTrigger>
          )}
        </TabsList>

        {shows("coverage") && (
        <TabsContent value="coverage">
          <RuCoverageTab />
        </TabsContent>
        )}

        {/* Availability — rolling 365-day window evidence (Step 3) */}
        {shows("availability") && (
        <TabsContent value="availability">
          <RuAvailabilityPlayground
            propertyId={propertyId}
            propertyName={properties.find((p) => p.id === propertyId)?.name}
          />
        </TabsContent>
        )}

        {/* Pricing — rolling 365-day price window evidence (Step 4) */}
        {shows("pricing") && (
        <TabsContent value="pricing">
          <RuPricingPlayground
            propertyId={propertyId}
            propertyName={properties.find((p) => p.id === propertyId)?.name}
          />
        </TabsContent>
        )}





        {/* Milestones — core functional certification matrix */}
        <TabsContent value="milestones">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Certification milestone matrix</CardTitle>
                <CardDescription>
                  Latest observed result per Rentals United method across the last 25 runs. Status 5 means a
                  partial success — check the notifications on the run before signing off.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {milestoneSummary && (
                  <Badge variant={milestoneSummary.mandatory_passed === milestoneSummary.mandatory_total ? "default" : "destructive"}>
                    {milestoneSummary.mandatory_passed}/{milestoneSummary.mandatory_total} mandatory
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={loadMilestones}>
                  <RefreshCw className={`h-4 w-4 ${milestonesLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Milestone</TableHead>
                    <TableHead>RU method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last run</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {milestones.map((m) => (
                    <TableRow key={m.key}>
                      <TableCell className="text-sm">
                        {m.label}
                        {!m.mandatory && <Badge variant="outline" className="ml-2 text-[10px]">optional</Badge>}
                        <span className="ml-2 inline-flex align-middle"><ScopeBadge scope={m.scope} /></span>
                        {m.note && <span className="block text-xs text-muted-foreground">{m.note}</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{m.ru_method}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            m.status === "passed" && !m.partial_success
                              ? "default"
                              : m.partial_success
                                ? "secondary"
                                : m.status === "never_run"
                                  ? "outline"
                                  : "destructive"
                          }
                        >
                          {m.partial_success ? "Partial (status 5)" : m.status === "never_run" ? "Never run" : m.status}
                        </Badge>
                        {m.detail && <span className="block text-xs text-muted-foreground mt-1">{m.detail}</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.last_run_at ? format(new Date(m.last_run_at), "MMM d HH:mm") : "—"}
                      </TableCell>
                      <TableCell>
                        {m.run_id && (
                          <Button variant="ghost" size="sm" onClick={() => downloadEvidence(m.run_id!)}>
                            Evidence
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {milestones.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        {milestonesLoading ? "Loading milestones…" : "No milestone data yet — run a suite."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>


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
                        {(() => {
                          const passed = r.passed ?? 0;
                          const total = r.total ?? 0;
                          const rag: "green" | "amber" | "red" =
                            r.status === "running"
                              ? "amber"
                              : total > 0 && passed === total
                                ? "green"
                                : passed > 0
                                  ? "amber"
                                  : "red";
                          const cls =
                            rag === "green"
                              ? "bg-success-surface text-success border-success-border"
                              : rag === "amber"
                                ? "bg-warning-surface text-warning border-warning-border"
                                : "bg-danger-surface text-destructive border-danger-border";
                          return (
                            <Badge variant="outline" className={cls}>
                              {r.status === "running" ? "Running · " : ""}
                              {passed}/{total} passed
                            </Badge>
                          );
                        })()}
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
        )}


        {/* Discounts */}
        {shows("discounts") && (
        <TabsContent value="discounts">

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Long-stay & last-minute discounts</CardTitle>
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
                    <Button
                      variant="outline"
                      disabled={running || (ladder ? ladder.ladder.longStay.length === 0 && ladder.ladder.lastMinute.length === 0 : discounts.length === 0)}
                      onClick={pushDiscountsNow}
                      className="gap-1.5"
                    >
                      <Percent className="h-4 w-4" />Push & verify now
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

                  {/* Derived ladder — exactly what a push sends to Rentals United */}
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-medium">Derived ladder sent to Rentals United</h4>
                        <p className="text-xs text-muted-foreground">
                          Manual rules above merged with the property's Long stay, Last minute and Advance purchase
                          specials. Certification pushes and verifies this exact ladder.
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={loadLadder} disabled={ladderLoading} className="gap-1.5">
                        <RefreshCw className={`h-4 w-4 ${ladderLoading ? "animate-spin" : ""}`} />Refresh
                      </Button>
                    </div>

                    {ladderLoading && <Skeleton className="h-24 w-full" />}

                    {!ladderLoading && ladder && (
                      <>
                        {!ladder.validation.ok && (
                          <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Ladder cannot be pushed</AlertTitle>
                            <AlertDescription className="text-xs">
                              <ul className="list-disc pl-4 space-y-0.5">
                                {ladder.validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}
                        {ladder.ladder.warnings.length > 0 && (
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle className="text-sm">Warnings</AlertTitle>
                            <AlertDescription className="text-xs">
                              <ul className="list-disc pl-4 space-y-0.5">
                                {ladder.ladder.warnings.map((w, i) => <li key={i}>{w}</li>)}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="text-xs text-muted-foreground">
                          Long stay: {ladder.summary.long_stay} · Last minute: {ladder.summary.last_minute}
                        </div>

                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Type</TableHead>
                              <TableHead>Trigger</TableHead>
                              <TableHead>Discount</TableHead>
                              <TableHead>Window</TableHead>
                              <TableHead>Source</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ladder.ladder.longStay.map((t, i) => (
                              <TableRow key={`ls-${i}`}>
                                <TableCell><Badge variant="outline">Long stay</Badge></TableCell>
                                <TableCell>{t.nights_from}{t.nights_to ? `–${t.nights_to}` : "+"} nights</TableCell>
                                <TableCell>{t.percentage}%</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{t.date_from} → {t.date_to}</TableCell>
                                <TableCell className="text-xs">
                                  <Badge variant={t.source === "special" ? "secondary" : "outline"} className="text-[10px]">
                                    {t.source_label}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                            {ladder.ladder.lastMinute.map((t, i) => (
                              <TableRow key={`lm-${i}`}>
                                <TableCell><Badge variant="outline">Last minute</Badge></TableCell>
                                <TableCell>
                                  {t.days_to_arrival_from}
                                  {t.days_to_arrival_to != null ? `–${t.days_to_arrival_to}` : "+"} days out
                                </TableCell>
                                <TableCell>{t.percentage}%</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{t.date_from} → {t.date_to}</TableCell>
                                <TableCell className="text-xs">
                                  <Badge variant={t.source === "special" ? "secondary" : "outline"} className="text-[10px]">
                                    {t.source_label}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                            {ladder.ladder.longStay.length === 0 && ladder.ladder.lastMinute.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                                  Nothing to push — no active manual rules or eligible specials.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>

                        {ladder.ladder.unmapped.length > 0 && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p className="font-medium text-foreground">Specials not mapped to Rentals United</p>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {ladder.ladder.unmapped.map((u) => <li key={u.id}>{u.name} — {u.reason}</li>)}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}


        {/* Readiness */}
        {shows("readiness") && (
        <TabsContent value="readiness">

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">White-Label minimum inventory readiness</CardTitle>
                <CardDescription>
                  Name hygiene (no emoji / specials / ALL CAPS), ObjectTypeID, CanSleepMax, street/ZIP/geo,
                  DetailedLocationID, description ≥ 700 characters, ≥10 images measured at 1024×768+ with a main photo,
                  ≥10 amenities, composition with bedroom / kitchen / bathroom and beds distributed, arrival
                  instructions, check-in / check-out times, payment method, cancellation policy, plus live 365-day
                  availability with MinStay and ≥3 consecutive bookable days priced above zero.
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
                  {r.content_quality && r.content_quality.units.length > 0 && (
                    <details className="mt-2 rounded-md border bg-muted/40 p-2">
                      <summary className="cursor-pointer text-xs font-medium">
                        Content-quality evidence ({r.content_quality.units.length} unit(s))
                      </summary>
                      <div className="mt-2 space-y-2">
                        {r.content_quality.units.map((u, i) => (
                          <div key={i} className="text-[11px] leading-relaxed">
                            <p className="font-medium">{u.unit ?? `Unit ${i + 1}`}</p>
                            <p className="text-muted-foreground">
                              Name {u.name_clean === false ? `rejected (${u.name_issues.join(", ")})` : "clean"} ·
                              {" "}Description {u.description_chars ?? 0} chars{u.description_meets_cert === false ? " (below 700)" : ""} ·
                              {" "}Images {u.images_meeting_cert_size ?? 0}/{u.images_count ?? 0} ≥ 1024×768
                              {u.smallest_image ? ` (smallest ${u.smallest_image})` : ""}
                              {u.images_unmeasured ? ` · ${u.images_unmeasured} unmeasured` : ""} ·
                              {" "}Main photo {u.has_main_image ? "yes" : "no"}
                            </p>
                            <p className="text-muted-foreground">
                              Street {u.has_street ? "✓" : "✗"} · ZIP {u.has_zip_code ? "✓" : "✗"} ·
                              {" "}DetailedLocationID {u.has_detailed_location_id ? "✓" : "✗"} ·
                              {" "}Coordinates {u.has_coordinates ? "✓" : "✗"} · CanSleepMax {u.can_sleep_max ?? 0} ·
                              {" "}Cancellation policy {u.has_cancellation_policies ? "✓" : "✗"} ·
                              {" "}Payment method {u.has_payment_methods ? "✓" : "✗"}
                            </p>
                            <p className="text-muted-foreground">
                              Check-in {u.check_in_from ?? "—"} / out {u.check_out_until ?? "—"} ·
                              {" "}Bedrooms {u.bedrooms_with_beds ?? 0}/{u.bedroom_blocks ?? 0} with beds
                              {u.beds_distributed === false ? " (not distributed)" : ""} ·
                              {" "}Kitchen {u.has_kitchen ? "✓" : "✗"} · Bathroom {u.has_bathroom_room ? "✓" : "✗"} ·
                              {" "}Sleeps {u.total_bed_capacity ?? 0} ·
                              {" "}Arrival instructions {u.arrival_instructions_chars ?? 0} chars
                            </p>
                          </div>
                        ))}
                        {r.content_quality.bookable_window?.map((w) => (
                          <p key={w.ru_property_id} className="text-[11px] text-muted-foreground">
                            RU {w.ru_property_id}: longest bookable+priced run {w.longest_run ?? 0} day(s)
                            {w.first_window ? ` from ${w.first_window}` : ""} · MinStay {w.min_stay_set ? "set" : "missing"} ·
                            {" "}{w.open_days ?? 0} open day(s)
                          </p>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            const blob = new Blob([JSON.stringify(r.content_quality, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `ru-content-quality-${r.name.replace(/\W+/g, "-").toLowerCase()}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Download evidence (JSON)
                        </Button>
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        )}


        {/* Users */}
        {shows("users") && (
        <TabsContent value="users">

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">RU user management</CardTitle>
                <CardDescription>
                  Push_CreateUser_RQ, Push_FillCompanyDetails_RQ, Pull_ListMyUsers_RQ and Push_ArchiveUser_RQ.
                  Side-by-side payload / response for live debugging.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadUserMgmt} disabled={userMgmtLoading} className="gap-1.5">
                <RefreshCw className={`h-4 w-4 ${userMgmtLoading ? "animate-spin" : ""}`} />Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {userMgmtLoading && !userMgmt && <Skeleton className="h-32 w-full" />}

              <Alert variant={userMgmt?.enabled ? "default" : undefined}>
                <AlertTitle className="flex items-center gap-2">
                  {userMgmt?.enabled ? "Enabled — sub-user creation is live" : "Pending RU PMS profile — parked"}
                  <Badge variant={userMgmt?.enabled ? "default" : "secondary"}>
                    {userMgmt?.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </AlertTitle>
                <AlertDescription className="text-xs space-y-2">
                  <p>{userMgmt?.note ?? "Sub-user creation stays disabled until RU confirms the PMS profile."}</p>
                  <p className="text-muted-foreground">
                    {userMgmt?.guest_communication ?? "Out of scope — Guest Communication API is not implemented."}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      checked={!!userMgmt?.enabled}
                      disabled={savingFlag || userMgmtLoading}
                      onCheckedChange={toggleUserMgmt}
                    />
                    <Label className="text-xs">Enable RU sub-user management</Label>
                    {userMgmt?.updated_at && (
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        Updated {format(new Date(userMgmt.updated_at), "MMM d HH:mm")}
                      </span>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              {userMgmt?.endpoints && userMgmt.endpoints.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>RU method</TableHead>
                      <TableHead>State</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userMgmt.endpoints.map((e) => (
                      <TableRow key={e.action}>
                        <TableCell className="text-sm">{e.action}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{e.ru_method}</TableCell>
                        <TableCell>
                          <Badge variant={e.status === "enabled" || e.status === "reachable" ? "default" : "secondary"}>
                            {e.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Side-by-side endpoint playground */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5 flex-1 min-w-[220px]">
                    <Label className="text-xs">Endpoint</Label>
                    <Select value={pgEndpoint} onValueChange={onSelectEndpoint}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {USER_ENDPOINTS.map((e) => (
                          <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" onClick={sendPlayground} disabled={pgSending} className="gap-1.5">
                    {pgSending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send
                  </Button>
                </div>
                {selectedEp && (
                  <p className="text-[11px] text-muted-foreground">{selectedEp.description}</p>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Request payload</Label>
                    <Textarea
                      value={pgPayload}
                      onChange={(e) => setPgPayload(e.target.value)}
                      className="font-mono text-[11px] min-h-[280px] leading-relaxed"
                      spellCheck={false}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Response</Label>
                    <pre className="rounded-md border bg-muted/40 p-3 text-[11px] font-mono min-h-[280px] max-h-[420px] overflow-auto whitespace-pre-wrap">
                      {pgResponse || "— send a request to see the live response —"}
                    </pre>
                  </div>
                </div>
              </div>

              {userMgmt?.enabled && (
                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-sm font-medium">Quick create RU sub-user</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">First name</Label>
                      <Input value={userDraft.first_name} onChange={(e) => setUserDraft((d) => ({ ...d, first_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Last name</Label>
                      <Input value={userDraft.last_name} onChange={(e) => setUserDraft((d) => ({ ...d, last_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input type="email" value={userDraft.email} onChange={(e) => setUserDraft((d) => ({ ...d, email: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Password</Label>
                      <Input type="password" value={userDraft.password} onChange={(e) => setUserDraft((d) => ({ ...d, password: e.target.value }))} />
                    </div>
                  </div>
                  <Button size="sm" onClick={createRuUser} disabled={creatingUser} className="gap-1.5">
                    <Plus className="h-4 w-4" />{creatingUser ? "Creating…" : "Create sub-user"}
                  </Button>
                </div>
              )}

              {allSubUsers.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium">Current RU sub-users (from last probe)</p>
                    {archivedCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowArchivedUsers((v) => !v)}
                      >
                        {showArchivedUsers ? "Hide" : "View"} archived ({archivedCount})
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {visibleSubUsers.length === 0 && (
                      <p className="text-xs text-muted-foreground">No active sub-users.</p>
                    )}
                    {visibleSubUsers.map((u, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs border rounded px-2 py-1.5">
                        <span className="font-mono">OwnerID {u.owner_id ?? u.id ?? "?"}</span>
                        <span className="text-muted-foreground truncate">{u.email ?? "—"}</span>
                        {u.archived && <Badge variant="secondary" className="text-[10px]">Archived</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {userMgmt?.probe && (
                <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                  {typeof userMgmt.probe === "string" ? userMgmt.probe : JSON.stringify(userMgmt.probe, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

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
                        <ScopeBadge scope={s.scope} />
                        {s.status === "skipped" && (
                          <Badge variant="secondary" className="text-[10px]">not tested — excluded</Badge>
                        )}
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
