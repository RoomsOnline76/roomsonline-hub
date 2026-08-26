/**
 * Onboard Property — the deterministic two-step channel connection.
 *
 * Everything an operator needs to take a property live sits on this one surface:
 *   1. pick the property
 *   2. Ready-to-sell gate (mandatory steps 1–5, graded locally)
 *   3. owner binding (with the atomic re-assign)
 *   4. Step A → Step B, each a short chain of individually retryable tasks
 *
 * The panel is deliberately dumb about the channel: every action is delegated to the
 * onboarding orchestrator, which owns the ordering rules and the durable ledger writes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDashed,
  Clock,
  Hourglass,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fetchChannelManagerEntitlements } from "@/hooks/useChannelManagerEntitlement";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  CHANNEL_ONBOARD_STEP_META,
  CHANNEL_ONBOARD_TASKS,
  READY_TO_SELL_GROUP_LABELS,
  type ChannelOnboardStep,
  type ChannelOnboardTaskId,
} from "@/config/channelOnboard";
import {
  planOwnerAccount,
  rebindOwner,
  runOnboardStep,
  type LoginCandidate,
  type OwnerAccountPlan,
  type TaskOutcome,
} from "@/lib/channelOnboardOrchestrator";


import { useChannelOnboardGate, type GateStepStatus } from "@/hooks/useChannelOnboardGate";
import { StepAccountDialog } from "@/components/admin/channel-monitor/StepAccountDialog";
import { RuWhiteLabelEmbed } from "@/components/pms/channels/RuWhiteLabelEmbed";
import { resolveStepBRemedy } from "@/config/channelStepBRemedies";

interface PropertyOption {
  id: string;
  name: string;
  owner_email: string | null;
}

/**
 * A pick in the onboarding dropdown. Channel accounts are inherited from the
 * portfolio, so an eligible portfolio is offered as a single entry (anchored to
 * its first eligible member) and its members are dropped from the flat list.
 */
interface OnboardOption {
  /** The property id the orchestrator actually runs against. */
  id: string;
  label: string;
  kind: "portfolio" | "property";
  memberCount: number;
  /** Portfolio entries only: the portfolio and every eligible member it covers. */
  portfolioId?: string;
  memberIds?: string[];
}


type TaskState = {
  state: "idle" | "running" | TaskOutcome;
  detail?: string;
  /** Wall-clock moment the channel's rate window reopens, for the waiting countdown. */
  waitingUntil?: number;
};

/** How many times a rate-deferred step resumes itself before asking the operator. */
const MAX_AUTO_RESUMES = 4;

/** A rate-deferred step: when to resume, and which task to resume from. */
interface WaitingState {
  until: number;
  resumeFromTaskId: ChannelOnboardTaskId | null;
  attempts: number;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const STATUS_BADGE: Record<GateStepStatus, { label: string; className: string }> = {
  passed: { label: "Passed", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  blocked: { label: "Blocked", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  pending: { label: "Not started", className: "border-border bg-muted text-muted-foreground" },
  stale: { label: "Needs recheck", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  unknown: { label: "Unknown", className: "border-border bg-muted text-muted-foreground" },
};

function StatusBadge({ status }: { status: GateStepStatus }) {
  const meta = STATUS_BADGE[status];
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium", meta.className)}>
      {meta.label}
    </Badge>
  );
}

function TaskIcon({ state }: { state: TaskState["state"] }) {
  if (state === "running") return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
  if (state === "passed") return <Check className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (state === "skipped") return <Check className="h-4 w-4 shrink-0 text-muted-foreground" />;
  if (state === "pending") return <Hourglass className="h-4 w-4 shrink-0 animate-pulse text-amber-600" />;
  if (state === "blocked") return <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />;
  if (state === "failed") return <X className="h-4 w-4 shrink-0 text-destructive" />;
  return <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

export function ChannelOnboardTab({
  initialPropertyId,
  initialPortfolioId,
  /** Deep link from the onboarding queue for an already-connected property. */
  focusConnect = false,
  onSelectionChange,
}: {
  initialPropertyId?: string | null;
  initialPortfolioId?: string | null;
  focusConnect?: boolean;
  onSelectionChange?: (propertyId: string) => void;
}) {
  const [properties, setProperties] = useState<OnboardOption[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [propertyId, setPropertyId] = useState<string>("");
  /** Why a deep-linked property could not be selected, or how it was resolved. */
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  const selectProperty = useCallback(
    (next: string) => {
      setPropertyId(next);
      setRequestNotice(null);
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );


  const gate = useChannelOnboardGate(propertyId || null);

  /** The white-label connector frame — the landing target for "Configure channels". */
  const connectFrameRef = useRef<HTMLDivElement | null>(null);
  const scrolledToConnect = useRef(false);

  // Deep link: once the connector frame renders, bring it into view (once).
  useEffect(() => {
    if (!focusConnect || scrolledToConnect.current) return;
    if (gate.stepBStatus !== "passed" || !connectFrameRef.current) return;
    scrolledToConnect.current = true;
    connectFrameRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusConnect, gate.stepBStatus]);

  const [taskStates, setTaskStates] = useState<Record<string, TaskState>>({});
  const [runningStep, setRunningStep] = useState<ChannelOnboardStep | null>(null);
  const [pushProgress, setPushProgress] = useState<{ pushed: number; total: number } | null>(null);
  /** Steps parked on the channel's rate window — waiting, not failed. */
  const [waiting, setWaiting] = useState<Partial<Record<ChannelOnboardStep, WaitingState>>>({});
  /** Ticks once a second so the waiting countdowns stay live. */
  const [nowTick, setNowTick] = useState(() => Date.now());
  /** Operator override: keep a passed Step A expanded. */
  const [stepDetailOpen, setStepDetailOpen] = useState<Partial<Record<ChannelOnboardStep, boolean>>>({});

  const [plan, setPlan] = useState<OwnerAccountPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  /** Set when the channel refused the resolved login; drives the modal's login chooser. */
  const [emailConflict, setEmailConflict] = useState<
    { email: string; message: string; candidates: LoginCandidate[] } | null
  >(null);
  const [chosenLoginEmail, setChosenLoginEmail] = useState("");
  const [stepARemedyCode, setStepARemedyCode] = useState<string | null>(null);
  /** Last stop code per task, so a refused task can show its own remedy card inline. */
  const [taskCodes, setTaskCodes] = useState<Record<string, string | null>>({});


  const [rebindEmail, setRebindEmail] = useState("");
  const [rebindOpen, setRebindOpen] = useState(false);
  const [rebinding, setRebinding] = useState(false);

  // Only properties that are active and entitled to the Channel Manager add-on
  // may be onboarded to a channel.
  // Archived properties (and the members of archived portfolios) are excluded —
  // archiving flips `ru_archived` on the property row, so it must be filtered
  // here explicitly: it does not touch `is_active` or the billing toggle.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, owner_email, ru_archived")
        .eq("is_active", true)
        .order("name");
      if (cancelled) return;
      if (error) toast.error("Could not load the property list");

      const allRows = (data ?? []) as Array<PropertyOption & { ru_archived: boolean | null }>;
      // Archived listings are held off the distribution layer, so they cannot be
      // onboarded — but we keep their ids so a deep link can say exactly that
      // instead of leaving the picker mysteriously blank.
      const archivedIds = new Set(allRows.filter((r) => r.ru_archived === true).map((r) => r.id));
      const rows: PropertyOption[] = allRows.filter((r) => !archivedIds.has(r.id));
      const ids = rows.map((r) => r.id);

      let eligible: PropertyOption[] = [];
      if (ids.length > 0) {
        const [entitlements] = await Promise.all([
          fetchChannelManagerEntitlements(ids),
        ]);
        eligible = rows.filter((r) => entitlements.get(r.id) === true);
      }

      if (cancelled) return;

      // Group the eligible properties by portfolio: a channel account is
      // inherited portfolio-wide, so the portfolio is onboarded once (anchored
      // to its first eligible member) and its members leave the flat list.
      let options: OnboardOption[] = eligible.map((p) => ({
        id: p.id,
        label: p.name,
        kind: "property" as const,
        memberCount: 1,
      }));

      if (eligible.length > 0) {
        const eligibleIds = eligible.map((p) => p.id);
        const { data: members } = await supabase
          .from("property_portfolio_members")
          .select("portfolio_id, property_id")
          .in("property_id", eligibleIds);
        const portfolioIds = [...new Set((members ?? []).map((m) => m.portfolio_id))];
        if (portfolioIds.length > 0) {
          const { data: portfolios } = await supabase
            .from("property_portfolios")
            .select("id, name")
            .in("id", portfolioIds);
          const names = new Map((portfolios ?? []).map((p) => [p.id, p.name as string]));
          const order = new Map(eligible.map((p, i) => [p.id, i]));
          const grouped = new Map<string, string[]>();
          for (const m of members ?? []) {
            if (!names.has(m.portfolio_id)) continue;
            const list = grouped.get(m.portfolio_id) ?? [];
            list.push(m.property_id);
            grouped.set(m.portfolio_id, list);
          }
          const claimed = new Set<string>();
          const portfolioOptions: OnboardOption[] = [];
          for (const [pid, memberIds] of grouped) {
            const sorted = [...memberIds].sort(
              (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
            );
            sorted.forEach((id) => claimed.add(id));
            portfolioOptions.push({
              id: sorted[0],
              label: `${names.get(pid)} (portfolio · ${sorted.length} ${sorted.length === 1 ? "property" : "properties"})`,
              kind: "portfolio",
              memberCount: sorted.length,
              portfolioId: pid,
              memberIds: sorted,
            });
          }
          options = [
            ...portfolioOptions.sort((a, b) => a.label.localeCompare(b.label)),
            ...options.filter((o) => !claimed.has(o.id)),
          ];
        }
      }

      if (cancelled) return;
      setProperties(options);
      setPropertiesLoading(false);

      /**
       * Resolve the deep link from the wizard ("Open Channel Monitor"). A portfolio
       * member is not itself an option — its portfolio entry is — so a raw property
       * id must be mapped onto the entry that actually onboards it. When nothing
       * matches we say why instead of leaving the picker mysteriously blank.
       */
      const requestedProperty = initialPropertyId ?? null;
      const requestedPortfolio = initialPortfolioId ?? null;
      if (!requestedProperty && !requestedPortfolio) return;

      const byPortfolio = requestedPortfolio
        ? options.find((o) => o.portfolioId === requestedPortfolio)
        : undefined;
      const exact = requestedProperty
        ? options.find((o) => o.id === requestedProperty)
        : undefined;
      const viaMember = requestedProperty
        ? options.find((o) => o.memberIds?.includes(requestedProperty))
        : undefined;
      const resolved = byPortfolio ?? exact ?? viaMember;
      const requestedName =
        allRows.find((r) => r.id === requestedProperty)?.name ?? null;

      if (resolved) {
        setPropertyId(resolved.id);
        setRequestNotice(
          resolved.kind === "portfolio" && requestedName
            ? `${requestedName} is onboarded with its portfolio — the portfolio entry is selected.`
            : null,
        );
        return;
      }

      if (requestedProperty && archivedIds.has(requestedProperty)) {
        setRequestNotice(
          `${requestedName ?? "This property"} is archived at the Channel Manager — reactivate its listing (Accounts & Company → listing state) before onboarding it.`,
        );
        return;
      }

      setRequestNotice(
        requestedName
          ? `${requestedName} cannot be onboarded yet: it needs the Channel Manager add-on activated and must not be archived.`
          : "The requested property is not available for onboarding (inactive, archived, or not entitled).",
      );

    })();
    return () => {
      cancelled = true;
    };
  }, [initialPropertyId, initialPortfolioId]);



  // Switching property resets the live task trail; the durable verdicts come from the gate.
  useEffect(() => {
    setTaskStates({});
    setPushProgress(null);
    setPlan(null);
    setRebindEmail("");
    setAccountDialogOpen(false);
    setEmailConflict(null);
    setChosenLoginEmail("");
    setStepARemedyCode(null);
  }, [propertyId]);

  const binding = gate.snapshot?.binding;
  const property = gate.snapshot?.property;
  const bindingUnreadable = Boolean(binding?.read_error);
  const sameEmailReset =
    rebindEmail.trim().length > 0 &&
    rebindEmail.trim().toLowerCase() === (property?.owner_email ?? "").trim().toLowerCase();

  /** The selected entry — a portfolio pick carries its portfolio id and member list. */
  const selectedOption = useMemo(
    () => properties.find((option) => option.id === propertyId) ?? null,
    [properties, propertyId],
  );

  // The preview modal only renders once the plan is in hand, so the operator never
  // sees an empty dialog while the resolution is still running.
  const openPlan = useCallback(async () => {
    if (!propertyId) return;
    setPlanLoading(true);
    try {
      setPlan(await planOwnerAccount(propertyId));
      setAccountDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not preview the distribution account");
    } finally {
      setPlanLoading(false);
    }
  }, [propertyId]);

  /**
   * Run (or resume) a step. A rate-deferred task is never a failure: the step parks with a
   * countdown and resumes itself from the deferred task once the channel's window reopens.
   */
  const runStep = useCallback(
    async (step: ChannelOnboardStep, options?: { startAtTaskId?: ChannelOnboardTaskId | null; attempt?: number; silent?: boolean }) => {
      if (!propertyId) return;
      const attempt = options?.attempt ?? 0;
      const resumeFrom = options?.startAtTaskId ?? null;
      setRunningStep(step);
      setPushProgress(null);
      setWaiting((prev) => ({ ...prev, [step]: undefined }));
      setTaskCodes({});
      setTaskStates((prev) => {
        const next = { ...prev };
        const stepTasks = CHANNEL_ONBOARD_TASKS.filter((t) => t.step === step);
        const from = resumeFrom ? Math.max(0, stepTasks.findIndex((t) => t.id === resumeFrom)) : 0;
        // A resume leaves the already-passed legs alone so the operator keeps their record.
        for (const task of stepTasks.slice(from)) next[task.id] = { state: "idle" };
        return next;
      });
      try {
        const result = await runOnboardStep(step, {
          propertyId,
          startAtTaskId: resumeFrom,
          // Only send an explicit operator override. If nothing was chosen in the
          // modal, the backend must resolve from the live property/portfolio rows so
          // a just-reassigned owner email cannot be overwritten by a stale preview.
          confirmedOwnerEmail: step === "a" ? chosenLoginEmail || null : null,
          confirmedOwnerName:
            step === "a" && chosenLoginEmail
              ? [plan?.contact_first_name, plan?.contact_last_name].filter(Boolean).join(" ").trim() || null
              : null,
          onTask: (id: ChannelOnboardTaskId, state, detail, retryAfterMs) =>
            setTaskStates((prev) => ({
              ...prev,
              [id]: {
                state,
                detail,
                waitingUntil: state === "pending" ? Date.now() + (retryAfterMs ?? 60_000) : undefined,
              },
            })),
          onPushProgress: (progress) => setPushProgress(progress),
        });
        // A taken login is a decision to hand back, not a plain failure: keep the modal
        // open on the chooser so the operator can pick or type a usable address.
        const conflict = result.results.find((r) => r.code === "RU_EMAIL_IN_USE");
        const stepABlocker = step === "a" ? result.results.find((r) => r.outcome === "blocked" && r.code) : null;
        // Keep every stop code so a refused task renders its own remedy instead of a bare line.
        setTaskCodes((prev) => {
          const next = { ...prev };
          for (const entry of result.results) {
            next[entry.id] =
              entry.outcome === "failed" || entry.outcome === "blocked" ? entry.code ?? "UNKNOWN" : null;
          }
          return next;
        });
        if (conflict) {
          setEmailConflict({
            email: chosenLoginEmail || String(plan?.login_email ?? ""),
            message: conflict.detail,
            candidates: (conflict.loginCandidates ?? []).filter((c) => c.email),
          });
          setStepARemedyCode(conflict.code ?? null);
          setChosenLoginEmail("");
          setAccountDialogOpen(true);
        } else if (result.passed && step === "a") {
          setEmailConflict(null);
          setChosenLoginEmail("");
          setStepARemedyCode(null);
        } else if (stepABlocker) {
          setStepARemedyCode(stepABlocker.code ?? null);
          setAccountDialogOpen(true);
        }
        if (result.passed) {
          toast.success(
            step === "a" ? "Distribution account confirmed" : "Property published — channels can now connect",
          );
        } else if (conflict) {
          toast.error("A different distribution login is needed", {
            description: conflict.detail,
            duration: 12000,
          });
        } else if (result.pending) {

          const waitMs = result.retryAfterMs ?? 60_000;
          const canAutoResume = attempt + 1 < MAX_AUTO_RESUMES;
          setWaiting((prev) => ({
            ...prev,
            [step]: {
              until: Date.now() + waitMs + 1_000,
              resumeFromTaskId: result.resumeFromTaskId ?? null,
              attempts: canAutoResume ? attempt + 1 : MAX_AUTO_RESUMES,
            },
          }));
          if (!options?.silent) {
            toast.info("Waiting on the channel", {
              description:
                `${result.summary || "The channel's read window is closed."} ` +
                (canAutoResume
                  ? `Resuming automatically in ${formatCountdown(waitMs)}.`
                  : "Use Retry now when you are ready."),
              duration: 9000,
            });
          }
        } else {
          toast.error("Step did not complete", { description: result.summary, duration: 12000 });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The step could not be run");
      } finally {
        setRunningStep(null);
        await gate.refresh();
      }
    },
    [chosenLoginEmail, gate, plan, propertyId],
  );

  /** Drive the waiting countdowns, and fire the automatic resume when a window reopens. */
  useEffect(() => {
    const parked = Object.entries(waiting).filter(([, value]) => value) as Array<[ChannelOnboardStep, WaitingState]>;
    if (parked.length === 0) return;
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
      for (const [step, state] of parked) {
        if (Date.now() < state.until) continue;
        setWaiting((prev) => ({ ...prev, [step]: undefined }));
        if (state.attempts < MAX_AUTO_RESUMES && runningStep === null) {
          void runStep(step, { startAtTaskId: state.resumeFromTaskId, attempt: state.attempts, silent: true });
        }
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [runStep, runningStep, waiting]);

  /** A new property starts with a clean slate — no stale waits or task rows. */
  useEffect(() => {
    setWaiting({});
    setStepDetailOpen({});
  }, [propertyId]);

  const doRebind = useCallback(
    async (confirmPortfolioScope: boolean) => {
      if (!propertyId) return;
      setRebinding(true);
      try {
        const result = await rebindOwner(propertyId, rebindEmail.trim(), { confirmPortfolioScope });
        toast.success(`Re-assigned to ${rebindEmail.trim()}`, {
          description: result.legs.map((leg) => `${leg.leg}: ${leg.detail ?? (leg.ok ? "ok" : "failed")}`).join(" · "),
          duration: 12000,
        });
        setRebindOpen(false);
        setRebindEmail("");
        setTaskStates({});
        setTaskCodes({});
        setPlan(null);
        setChosenLoginEmail("");
        setEmailConflict(null);
        setStepARemedyCode(null);
        setAccountDialogOpen(false);
        await gate.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "The re-assignment failed";
        // A portfolio-wide account needs a second, explicit confirmation.
        if (!confirmPortfolioScope && /portfolio/i.test(message)) {
          toast.warning("This is a portfolio-wide account", { description: message, duration: 14000 });
          setRebindOpen(true);
          return;
        }
        toast.error(message, { duration: 14000 });
      } finally {
        setRebinding(false);
      }
    },
    [gate, propertyId, rebindEmail],
  );

  const stepDisabled = useMemo(
    () => ({
      a: !gate.readyToSell || runningStep !== null,
      b: !gate.readyToSell || gate.stepAStatus !== "passed" || runningStep !== null,
    }),
    [gate.readyToSell, gate.stepAStatus, runningStep],
  );

  const renderStep = (step: ChannelOnboardStep) => {
    const meta = CHANNEL_ONBOARD_STEP_META[step];
    const status = step === "a" ? gate.stepAStatus : gate.stepBStatus;
    const tasks = CHANNEL_ONBOARD_TASKS.filter((task) => task.step === step);
    const ledgerTasks = ((gate.snapshot?.steps?.[meta.key]?.details as { tasks?: Array<{ id: string; outcome: TaskOutcome; detail: string }> } | null)
      ?.tasks ?? []);
    const stepWaiting = waiting[step];
    const waitRemaining = stepWaiting ? stepWaiting.until - nowTick : 0;
    /**
     * A passed step is settled work: it collapses to its one-line verdict until the
     * operator asks for the detail. A waiting or running step always stays open.
     */
    const collapsed =
      status === "passed" && runningStep !== step && !stepWaiting && stepDetailOpen[step] !== true;

    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base">{meta.title}</CardTitle>
              <CardDescription className="text-xs">{meta.goal}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={status} />
              {status === "passed" && runningStep !== step && !stepWaiting && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setStepDetailOpen((prev) => ({ ...prev, [step]: !collapsed ? false : true }))}
                >
                  {collapsed ? "Show detail" : "Hide detail"}
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => void runStep(step)}
                disabled={stepDisabled[step]}
              >
                {runningStep === step ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                )}
                {status === "passed" ? "Re-run" : meta.cta}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {collapsed ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <Check className="h-4 w-4 shrink-0" />
              <span>{meta.title} is complete — nothing to do here.</span>
            </div>
          ) : (
            <>
              {stepWaiting && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                  <Hourglass className="mt-0.5 h-4 w-4 shrink-0 animate-pulse" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      Waiting on the channel — {formatCountdown(Math.max(0, waitRemaining))}
                    </p>
                    <p className="leading-snug">
                      The channel only accepts one identical read per minute. Nothing has failed;{" "}
                      {stepWaiting.attempts < MAX_AUTO_RESUMES
                        ? "this step resumes on its own when the window reopens."
                        : "use Retry now to pick it up again."}
                    </p>
                  </div>
                  {stepWaiting.attempts >= MAX_AUTO_RESUMES && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={runningStep !== null}
                      onClick={() =>
                        void runStep(step, { startAtTaskId: stepWaiting.resumeFromTaskId, attempt: 0 })
                      }
                    >
                      Retry now
                    </Button>
                  )}
                </div>
              )}

              {step === "a" && (
                <div className="rounded-md border bg-muted/40 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Preview the account, the owner binding and the company details that will be sent — nothing leaves
                      here until you run the step.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void openPlan()}
                      disabled={planLoading || !propertyId}
                    >
                      {planLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Preview account
                    </Button>
                  </div>
                </div>
              )}

              {tasks.map((task) => {
                const live = taskStates[task.id];
                const recorded = ledgerTasks.find((t) => t.id === task.id);
                const state: TaskState["state"] = live?.state ?? recorded?.outcome ?? "idle";
                const detail = live?.detail ?? recorded?.detail;
                const taskWait = state === "pending" ? (live?.waitingUntil ?? stepWaiting?.until ?? 0) - nowTick : 0;
                // Step B refusals name the missing input and link to the editor tab that owns it.
                const remedy =
                  step === "b" && (state === "failed" || state === "blocked")
                    ? resolveStepBRemedy(taskCodes[task.id], detail)
                    : null;
                return (
                  <div key={task.id} className="flex items-start gap-2 rounded-md border p-2.5">
                    <TaskIcon state={state} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {task.title}
                        {state === "pending" && (
                          <span className="ml-2 text-[11px] font-normal text-amber-600">
                            Waiting{taskWait > 0 ? ` — ${formatCountdown(taskWait)}` : ""}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] leading-snug text-muted-foreground">{detail || task.detail}</p>
                      {remedy && (
                        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
                          <p className="font-medium">{remedy.title}</p>
                          <p className="mt-0.5">{remedy.explain}</p>
                          <p className="mt-0.5">{remedy.guidance}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {remedy.editorSection && propertyId && (
                              <Button asChild size="sm" variant="outline" className="h-6 text-[11px]">
                                <a
                                  href={`/properties/${propertyId}/edit?section=${remedy.editorSection}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open property editor
                                </a>
                              </Button>
                            )}
                            <span className="font-mono text-[10px] text-muted-foreground">
                              Reference: {remedy.code}
                            </span>
                          </div>
                        </div>
                      )}
                      {task.id === "push_property" && pushProgress && pushProgress.total > 0 && state === "running" && (
                        <div className="mt-1.5 space-y-1">
                          <Progress value={(pushProgress.pushed / pushProgress.total) * 100} className="h-1.5" />
                          <p className="text-[11px] text-muted-foreground">
                            {pushProgress.pushed}/{pushProgress.total} unit(s) pushed
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1 — property picker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Onboard a property</CardTitle>
          <CardDescription className="text-xs">
            Only active, unarchived properties and portfolios with the Channel Manager add-on activated are listed.
            Portfolios are onboarded once — their member properties inherit the same channel account. Pick one, clear the
            Ready-to-sell gate, then run Step A and Step B.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1">
              <Label className="text-xs">Property or portfolio</Label>
              {propertiesLoading ? (
                <Skeleton className="mt-1 h-9 w-full" />
              ) : (
                <Select value={propertyId} onValueChange={selectProperty} disabled={properties.length === 0}>
                  <SelectTrigger className="mt-1">
                    <SelectValue
                      placeholder={
                        properties.length === 0
                          ? "Nothing eligible (Channel Manager add-on)"
                          : "Select a property or portfolio"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {requestNotice && (
                <p className="mt-1.5 text-xs text-muted-foreground">{requestNotice}</p>
              )}

            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openPlan()}
              disabled={planLoading || !propertyId}
            >
              {planLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              )}
              Preview account
            </Button>
            <Button variant="outline" size="sm" onClick={() => void gate.refresh()} disabled={!propertyId || gate.loading}>
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", gate.loading && "animate-spin")} />
              Refresh
            </Button>

          </div>
          {gate.error && <p className="text-xs text-destructive">{gate.error}</p>}
          {gate.connected && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              This property is live on the distribution layer — ordinary edits now push as deltas automatically.
            </div>
          )}
        </CardContent>
      </Card>

      {!propertyId ? null : (
        <>
          {/* 2 — readiness gate (hidden once passed — the work is done) */}
          {gate.readyToSellStatus !== "passed" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Ready to sell (steps 1–5)</CardTitle>
                    <CardDescription className="text-xs">
                      {READY_TO_SELL_GROUP_LABELS.join(" · ")}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={gate.readyToSellStatus} />
                    <Button size="sm" variant="outline" onClick={() => void gate.regrade()} disabled={gate.grading}>
                      {gate.grading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Re-check
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    Step A and Step B stay locked until the mandatory content, rooms, photos, policies, pricing and
                    availability checks pass. Fix them in the property editor, then re-check here.
                  </span>
                </div>
                {gate.readyToSellBlockers.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {gate.readyToSellBlockers.slice(0, 12).map((blocker, index) => (
                      <li key={index} className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1">
                        {blocker}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {/* 3 — the two steps. Owner binding and the account preview live in the Step A dialog. */}
          {renderStep("a")}
          {renderStep("b")}

          {/* 4 — Connect channels via the white-label integration, once Step B completes. */}
          {gate.stepBStatus === "passed" && (
            <Card ref={connectFrameRef}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Connect channels</CardTitle>
                    <CardDescription className="text-xs">
                      Your property is live on the distribution layer — connect sales channels through the Channel Manager below.
                    </CardDescription>
                  </div>
                  <StatusBadge status="passed" />
                </div>
              </CardHeader>
              <CardContent>
                <RuWhiteLabelEmbed propertyId={propertyId} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {propertyId && (
        <StepAccountDialog
          open={accountDialogOpen}
          onOpenChange={setAccountDialogOpen}
          propertyId={propertyId}
          portfolioId={selectedOption?.portfolioId ?? null}
          memberIds={selectedOption?.memberIds}
          plan={plan}
          planLoading={planLoading}
          binding={binding as Record<string, any> | null | undefined}
          property={property as Record<string, any> | null | undefined}
          bindingUnreadable={bindingUnreadable}
          rebindEmail={rebindEmail}
          onRebindEmailChange={setRebindEmail}
          onRequestRebind={() => setRebindOpen(true)}
          rebinding={rebinding}
          sameEmailReset={sameEmailReset}
          runningStepA={runningStep === "a"}
          stepADisabled={stepDisabled.a}
          emailConflict={emailConflict}
          chosenLoginEmail={chosenLoginEmail}
          onChosenLoginEmailChange={setChosenLoginEmail}
          remedyCode={stepARemedyCode}

          runTasks={stepATaskLines}
          waitLabel={
            waiting.a && waiting.a.until > nowTick ? formatCountdown(Math.max(0, waiting.a.until - nowTick)) : null
          }
          onRunStepA={() => {
            // Proceed completes Step A inside the modal — it closes itself once the step passes.
            void runStep("a");
          }}

        />
      )}


      <AlertDialog open={rebindOpen} onOpenChange={setRebindOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-assign this property?</AlertDialogTitle>
            <AlertDialogDescription>
              {property?.name} will be archived on its current distribution account, unbound, and re-assigned to{" "}
              <span className="font-medium">{rebindEmail.trim()}</span>. If nothing else remains on the old account it is
              archived too. Step A and Step B will need to run again.
              {binding?.account_scope === "portfolio" && (
                <span className="mt-2 block text-destructive">
                  This account is shared across the portfolio — every property on it is affected.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rebinding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rebinding}
              onClick={(event) => {
                event.preventDefault();
                void doRebind(binding?.account_scope === "portfolio");
              }}
            >
              Re-assign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
