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

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDashed,
  Clock,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserCog,
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
  describeAccountScope,
  describeListingState,
  planOwnerAccount,
  rebindOwner,
  runOnboardStep,
  type OwnerAccountPlan,
  type TaskOutcome,
} from "@/lib/channelOnboardOrchestrator";

import { useChannelOnboardGate, type GateStepStatus } from "@/hooks/useChannelOnboardGate";

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


type TaskState = { state: "idle" | "running" | TaskOutcome; detail?: string };

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
  if (state === "pending") return <Clock className="h-4 w-4 shrink-0 text-amber-600" />;
  if (state === "failed") return <X className="h-4 w-4 shrink-0 text-destructive" />;
  return <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

export function ChannelOnboardTab({
  initialPropertyId,
  initialPortfolioId,
  onSelectionChange,
}: {
  initialPropertyId?: string | null;
  initialPortfolioId?: string | null;
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

  const [taskStates, setTaskStates] = useState<Record<string, TaskState>>({});
  const [runningStep, setRunningStep] = useState<ChannelOnboardStep | null>(null);
  const [pushProgress, setPushProgress] = useState<{ pushed: number; total: number } | null>(null);

  const [plan, setPlan] = useState<OwnerAccountPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);

  const [rebindEmail, setRebindEmail] = useState("");
  const [rebindOpen, setRebindOpen] = useState(false);
  const [rebinding, setRebinding] = useState(false);

  // Only properties that are active, entitled to the Channel Manager add-on and
  // hold a signed (or overridden) contract may be onboarded to a channel.
  // Archived properties (and the members of archived portfolios) are excluded —
  // archiving flips `ru_archived` on the property row, so it must be filtered
  // here explicitly: it does not touch `is_active` or the billing toggle.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, owner_email")
        .eq("is_active", true)
        // Exclude archived listings. `ru_archived` is nullable, so accept null
        // or false — only `true` means "held off the distribution layer".
        .or("ru_archived.is.null,ru_archived.eq.false")
        .order("name");
      if (cancelled) return;
      if (error) toast.error("Could not load the property list");

      const rows = (data ?? []) as PropertyOption[];
      const ids = rows.map((r) => r.id);
      let eligible: PropertyOption[] = [];
      if (ids.length > 0) {
        // Contract status is authored per owner in `owner_contracts` (same source
        // the onboarding queue reads); `property_contracts` is a legacy fallback.
        const emails = [
          ...new Set(rows.map((r) => (r.owner_email ?? "").toLowerCase()).filter(Boolean)),
        ];
        const [entitlements, { data: ownerContracts }, { data: contracts }] = await Promise.all([
          fetchChannelManagerEntitlements(ids),
          emails.length
            ? supabase.from("owner_contracts").select("owner_email, status").in("owner_email", emails)
            : Promise.resolve({ data: [] as { owner_email: string; status: string }[] }),
          supabase
            .from("property_contracts")
            .select("property_id, status")
            .in("property_id", ids)
            .in("status", ["signed", "overridden"]),
        ]);
        const OK = new Set(["signed", "overridden"]);
        const signedEmails = new Set(
          (ownerContracts ?? [])
            .filter((c) => OK.has(String(c.status ?? "").toLowerCase()))
            .map((c) => String(c.owner_email ?? "").toLowerCase()),
        );
        const signed = new Set((contracts ?? []).map((c) => c.property_id));
        eligible = rows.filter(
          (r) =>
            entitlements.get(r.id) === true &&
            (signed.has(r.id) || signedEmails.has((r.owner_email ?? "").toLowerCase())),
        );
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
      const requestedName = rows.find((r) => r.id === requestedProperty)?.name ?? null;

      if (resolved) {
        setPropertyId(resolved.id);
        setRequestNotice(
          resolved.kind === "portfolio" && requestedName
            ? `${requestedName} is onboarded with its portfolio — the portfolio entry is selected.`
            : null,
        );
        return;
      }

      setRequestNotice(
        requestedName
          ? `${requestedName} cannot be onboarded yet: it needs the Channel Manager add-on activated and a signed contract, and must not be archived.`
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
  }, [propertyId]);

  const binding = gate.snapshot?.binding;
  const property = gate.snapshot?.property;
  const bindingUnreadable = Boolean(binding?.read_error);
  const sameEmailReset =
    rebindEmail.trim().length > 0 &&
    rebindEmail.trim().toLowerCase() === (property?.owner_email ?? "").trim().toLowerCase();

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

  const runStep = useCallback(
    async (step: ChannelOnboardStep) => {
      if (!propertyId) return;
      setRunningStep(step);
      setPushProgress(null);
      setTaskStates((prev) => {
        const next = { ...prev };
        for (const task of CHANNEL_ONBOARD_TASKS.filter((t) => t.step === step)) next[task.id] = { state: "idle" };
        return next;
      });
      try {
        const result = await runOnboardStep(step, {
          propertyId,
          confirmedOwnerEmail: step === "a" ? plan?.login_email ?? null : null,
          confirmedOwnerName:
            step === "a"
              ? [plan?.contact_first_name, plan?.contact_last_name].filter(Boolean).join(" ").trim() || null
              : null,
          onTask: (id: ChannelOnboardTaskId, state, detail) =>
            setTaskStates((prev) => ({ ...prev, [id]: { state, detail } })),
          onPushProgress: (progress) => setPushProgress(progress),
        });
        if (result.passed) {
          toast.success(
            step === "a" ? "Distribution account confirmed" : "Property published — channels can now connect",
          );
        } else if (result.pending) {
          toast.info("Step paused", {
            description: result.summary || "The channel deferred part of this step — retry in a minute.",
            duration: 9000,
          });
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
    [gate, plan, propertyId],
  );

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
          {step === "a" && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  Preview the account, the owner binding and the company details that will be sent — nothing leaves here
                  until you run the step.
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
            return (
              <div key={task.id} className="flex items-start gap-2 rounded-md border p-2.5">
                <TaskIcon state={state} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{detail || task.detail}</p>
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
            Only properties and portfolios with the Channel Manager add-on activated and a signed contract are listed.
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
                          ? "Nothing eligible (add-on + signed contract)"
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
          {/* 2 — readiness gate */}
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
            {gate.readyToSellStatus !== "passed" && (
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
            )}
          </Card>

          {/* 3 — the two steps. Owner binding and the account preview live in the Step A dialog. */}
          {renderStep("a")}
          {renderStep("b")}
        </>
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
