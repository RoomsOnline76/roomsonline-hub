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
  ChevronsUpDown,
  Clock,
  Hourglass,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import { ensureFreshSession, SessionExpiredError } from "@/lib/ensureFreshSession";
import { fetchChannelManagerEntitlements } from "@/hooks/useChannelManagerEntitlement";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  /** Units verified live at the channel manager (null/0 = nothing live yet). */
  ru_listings_verified_units?: number | null;
  /** When the listing verification last ran — proof the property was pushed. */
  ru_listings_verified_at?: string | null;
  /** The account the listings were verified under — also proof of a push. */
  ru_listings_verified_owner?: string | null;
}


interface ContractRow {
  status: string;
}

interface OwnerContractRow extends ContractRow {
  owner_email: string | null;
}

interface PropertyContractRow extends ContractRow {
  property_id: string | null;
}

const VALID_CONTRACT_STATUSES = ["signed", "overridden"] as const;

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && email.length > 0 ? email : null;
}

/**
 * How far a pick has travelled towards selling on a channel:
 * - `not_pushed` (red) — no distribution account bound, or never pushed.
 * - `awaiting_channels` (orange) — pushed to the channel manager, no sales channel linked.
 * - `connected` (green) — pushed and a sales channel is linked for it.
 */
type OnboardStatus = "not_pushed" | "awaiting_channels" | "connected";

/** Red first, then orange, then green — the order of work outstanding. */
const ONBOARD_STATUS_RANK: Record<OnboardStatus, number> = {
  not_pushed: 0,
  awaiting_channels: 1,
  connected: 2,
};

/** Per-property channel signals, read from the database only (no channel traffic). */
interface PropertyChannelSignals {
  /** A distribution sub-account with a real OwnerID covers this property. */
  bound: boolean;
  /** The property has been pushed: listing verification ran, or units are live. */
  pushed: boolean;
  /** A property-scoped sales channel (ChannelID) is mapped for it. */
  salesChannel: boolean;
}

/** Pure derivation so the badge rule can be read without the query code around it. */
function deriveOnboardStatus(signals: PropertyChannelSignals): OnboardStatus {
  if (!signals.bound || !signals.pushed) return "not_pushed";
  return signals.salesChannel ? "connected" : "awaiting_channels";
}

const ONBOARD_STATUS_BADGE: Record<OnboardStatus, { label: string; className: string }> = {
  not_pushed: {
    label: "Not pushed",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  awaiting_channels: {
    label: "Awaiting channels",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  connected: {
    label: "Channels connected",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
};

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
  /** Undefined until the status read lands — the row then renders without a badge. */
  status?: OnboardStatus;
  /** Portfolio entries: how many members are pushed to the channel manager. */
  pushedCount?: number;
  /** Portfolio entries: how many members have a sales channel connected. */
  connectedCount?: number;
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
  /** Optional manual sub-account email entry (before any account exists). */
  const [manualEmailOpen, setManualEmailOpen] = useState(false);
  const [manualEmail, setManualEmail] = useState("");
  const [manualEmailError, setManualEmailError] = useState<string | null>(null);
  const [stepARemedyCode, setStepARemedyCode] = useState<string | null>(null);
  /** Last stop code per task, so a refused task can show its own remedy card inline. */
  const [taskCodes, setTaskCodes] = useState<Record<string, string | null>>({});


  const [rebindEmail, setRebindEmail] = useState("");
  const [rebindOpen, setRebindOpen] = useState(false);
  const [rebinding, setRebinding] = useState(false);

  // Only properties that are active, contract-approved and entitled to the Channel Manager add-on
  // may be onboarded to a channel.
  // Archived properties (and the members of archived portfolios) are excluded —
  // archiving flips `ru_archived` on the property row, so it must be filtered
  // here explicitly: it does not touch `is_active` or the billing toggle.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("properties")
        .select(
          "id, name, owner_email, ru_archived, ru_listings_verified_units, ru_listings_verified_at, ru_listings_verified_owner",
        )
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
      // Why an active property was left out, so a deep link can name the reason
      // instead of leaving the picker mysteriously blank.
      const exclusions = new Map<string, string>();
      if (ids.length > 0) {
        // Contract standing follows the *owner*, not one email string: a linked
        // owner on `property_owners` counts too, so correcting or re-assigning an
        // email never silently revokes a signed contract.
        const { data: ownerLinks } = await supabase
          .from("property_owners")
          .select("property_id, owner_email")
          .in("property_id", ids);
        const linkedEmails = new Map<string, string[]>();
        ((ownerLinks ?? []) as Array<{ property_id: string; owner_email: string | null }>).forEach((link) => {
          const email = normalizeEmail(link.owner_email);
          if (!email) return;
          linkedEmails.set(link.property_id, [...(linkedEmails.get(link.property_id) ?? []), email]);
        });

        const ownerEmails = [
          ...new Set(
            [
              ...rows.map((r) => normalizeEmail(r.owner_email)),
              ...[...linkedEmails.values()].flat(),
            ].filter((email): email is string => Boolean(email)),
          ),
        ];
        const [entitlements, ownerContractsResult, propertyContractsResult] = await Promise.all([
          fetchChannelManagerEntitlements(ids),
          ownerEmails.length > 0
            ? supabase
                .from("owner_contracts")
                .select("owner_email, status")
                .in("owner_email", ownerEmails)
                .in("status", [...VALID_CONTRACT_STATUSES])
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("property_contracts")
            .select("property_id, status")
            .in("property_id", ids)
            .in("status", [...VALID_CONTRACT_STATUSES]),
        ]);
        if (ownerContractsResult.error || propertyContractsResult.error) {
          toast.error("Could not verify contract eligibility");
        }
        const signedEmails = new Set(
          ((ownerContractsResult.data ?? []) as OwnerContractRow[])
            .map((contract) => normalizeEmail(contract.owner_email))
            .filter((email): email is string => Boolean(email)),
        );
        const signedProperties = new Set(
          ((propertyContractsResult.data ?? []) as PropertyContractRow[])
            .map((contract) => contract.property_id)
            .filter((id): id is string => Boolean(id)),
        );
        eligible = rows.filter((r) => {
          const emails = [normalizeEmail(r.owner_email), ...(linkedEmails.get(r.id) ?? [])].filter(
            (email): email is string => Boolean(email),
          );
          const entitled = entitlements.get(r.id) === true;
          const contracted = signedProperties.has(r.id) || emails.some((email) => signedEmails.has(email));
          if (!entitled) {
            exclusions.set(r.id, "the Channel Manager add-on is not activated for it");
            return false;
          }
          if (!contracted) {
            exclusions.set(
              r.id,
              `no signed or overridden contract was found for ${emails[0] ?? "its owner"}`,
            );
            return false;
          }
          return true;
        });
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
       * Onboarding status per entry, from the database only: the account binding
       * (property-scoped or inherited from the portfolio), whether the property
       * has actually been pushed, and whether a property-scoped sales channel
       * (ChannelID) is mapped. The badge lands a moment after the list so the
       * picker never blocks on it.
       */
      void (async () => {
        const [{ data: accountRows }, { data: settingRows }] = await Promise.all([
          supabase.from("ru_owner_accounts").select("property_id, portfolio_id, ru_owner_id"),
          supabase.from("ru_platform_settings").select("key"),
        ]);
        if (cancelled) return;

        const boundProperties = new Set<string>();
        const boundPortfolios = new Set<string>();
        ((accountRows ?? []) as Array<{
          property_id: string | null;
          portfolio_id: string | null;
          ru_owner_id: string | null;
        }>).forEach((row) => {
          if (!String(row.ru_owner_id ?? "").trim()) return;
          if (row.property_id) boundProperties.add(row.property_id);
          if (row.portfolio_id) boundPortfolios.add(row.portfolio_id);
        });

        const settingKeys = new Set(
          ((settingRows ?? []) as Array<{ key: string | null }>)
            .map((row) => row.key ?? "")
            .filter(Boolean),
        );

        // A push is proven by the listing verification record (owner or timestamp)
        // or by verified units — a freshly pushed property can legitimately report
        // zero units while its listings settle.
        const pushedIds = new Set(
          eligible
            .filter(
              (p) =>
                Number(p.ru_listings_verified_units ?? 0) > 0 ||
                Boolean(p.ru_listings_verified_at) ||
                Boolean(p.ru_listings_verified_owner),
            )
            .map((p) => p.id),
        );
        const signalsFor = (propertyId: string, portfolioId?: string): PropertyChannelSignals => ({
          bound:
            boundProperties.has(propertyId) ||
            (Boolean(portfolioId) && boundPortfolios.has(portfolioId as string)),
          pushed: pushedIds.has(propertyId),
          // Only a property-scoped mapping counts as selling: the account-wide
          // ChannelID says the master account can sell, not that this property does.
          salesChannel: settingKeys.has(`ru_channel_id:${propertyId}`),
        });

        const withStatus = options.map((option) => {
          const memberIds = option.memberIds ?? [option.id];
          const statuses = memberIds.map((memberId) =>
            deriveOnboardStatus(signalsFor(memberId, option.portfolioId)),
          );
          const connectedCount = statuses.filter((s) => s === "connected").length;
          const pushedCount = statuses.filter((s) => s !== "not_pushed").length;
          const status: OnboardStatus =
            connectedCount === statuses.length
              ? "connected"
              : pushedCount > 0
                ? "awaiting_channels"
                : "not_pushed";
          return { ...option, status, pushedCount, connectedCount };
        });
        if (cancelled) return;
        setProperties(withStatus);
      })();



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

      const reason = requestedProperty ? exclusions.get(requestedProperty) : null;
      setRequestNotice(
        reason
          ? `${requestedName ?? "This property"} cannot be onboarded yet: ${reason}.`
          : requestedName
            ? `${requestedName} cannot be onboarded yet: it needs the Channel Manager add-on activated, a signed or overridden contract, and must not be archived.`
            : "The requested property is not available for onboarding (inactive, archived, unsigned, or not entitled).",
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

  /**
   * Render order: red (not pushed), then orange (awaiting channels), then green
   * (connected), alphabetically inside each colour. Entries whose status has not
   * landed yet sort last until the badge read resolves.
   */
  const sortedProperties = useMemo(
    () =>
      [...properties].sort((a, b) => {
        const rankA = a.status ? ONBOARD_STATUS_RANK[a.status] : 3;
        const rankB = b.status ? ONBOARD_STATUS_RANK[b.status] : 3;
        if (rankA !== rankB) return rankA - rankB;
        return a.label.localeCompare(b.label);
      }),
    [properties],
  );

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
          // Failure-only modal: load the account plan first so the chooser paints
          // with the resolved login and its automatic fallback on first open.
          let resolvedPlan = plan;
          if (!resolvedPlan) {
            try {
              resolvedPlan = await planOwnerAccount(propertyId);
              setPlan(resolvedPlan);
            } catch {
              // The chooser still renders from the conflict candidates alone.
            }
          }
          setEmailConflict({
            email: chosenLoginEmail || String(resolvedPlan?.login_email ?? ""),
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
          // Step A is settled — the account modal has nothing left to ask.
          setAccountDialogOpen(false);

        } else if (stepABlocker) {
          setStepARemedyCode(stepABlocker.code ?? null);
          if (!plan) {
            try {
              setPlan(await planOwnerAccount(propertyId));
            } catch {
              // The blocker line and remedy still render without the plan.
            }
          }
          setAccountDialogOpen(true);
        }
        if (result.passed) {
          toast.success(
            step === "a"
              ? "Distribution account provisioned — keys minted and company details sent, ready for Step B"
              : "Property published — channels can now connect",
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
        if (err instanceof SessionExpiredError) {
          toast.error("Your session expired", {
            description: "Sign in again, then re-run the step.",
            duration: 12000,
          });
        } else {
          toast.error(err instanceof Error ? err.message : "The step could not be run");
        }
      } finally {
        setRunningStep(null);
        await gate.refresh();
      }
    },
    [chosenLoginEmail, gate, plan, propertyId],
  );

  /**
   * Try a silent token renewal first — a token that merely went stale while the tab sat
   * open comes back without a login. Only a genuinely dead session goes to /auth.
   */
  const handleReauth = useCallback(async () => {
    const token = await ensureFreshSession(true);
    if (token) {
      await gate.refresh();
      toast.success("Session renewed");
      return;
    }
    window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }, [gate]);

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

  /**
   * The distribution login is no longer a question put to the operator: the backend
   * resolves it (owner email, else the slug login) and Step A provisions it. Selecting
   * a property therefore opens nothing — the picker card shows the account it is bound
   * to and a single Create Account button starts Step A.
   */
  const [pickerOpen, setPickerOpen] = useState(false);
  const boundLogin = useMemo(() => {

    const b = gate.snapshot?.binding;
    return (b?.login_email || b?.owner_email || "").trim() || null;
  }, [gate.snapshot?.binding]);
  const boundOwnerId = (gate.snapshot?.binding?.ru_owner_id ?? "").trim() || null;
  const accountProvisioned = Boolean(boundOwnerId) && gate.stepAStatus === "passed";




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
    // A settled Step A names the account it provisioned — the operator's one takeaway.
    const title =
      step === "a" && status === "passed" && boundLogin
        ? `${meta.title} — Distribution account: ${boundLogin}`
        : meta.title;

    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base break-all">{title}</CardTitle>
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
              {/* Step A has no run button: it starts when the account modal is accepted. */}
              {step === "b" && (
                <Button size="sm" onClick={() => void runStep(step)} disabled={stepDisabled[step]}>
                  {runningStep === step ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {status === "passed" ? "Re-run" : meta.cta}
                </Button>
              )}

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

              {/* The account decision lives in the Preview account modal on the picker card. */}


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
            Only active, unarchived properties and portfolios with a signed or overridden contract and the Channel Manager add-on activated are listed.
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
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={pickerOpen}
                      disabled={properties.length === 0}
                      className="mt-1 w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {properties.find((p) => p.id === propertyId)?.label
                          ?? (properties.length === 0
                            ? "Nothing eligible (contract + Channel Manager add-on)"
                            : "Search for a property or portfolio")}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search by name…" />
                      <CommandList>
                        <CommandEmpty>No match.</CommandEmpty>
                        <CommandGroup>
                          {sortedProperties.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={p.label}
                              onSelect={() => {
                                selectProperty(p.id);
                                setPickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-3.5 w-3.5 shrink-0",
                                  p.id === propertyId ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <span className="truncate">{p.label}</span>
                              {p.status && (
                                <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
                                  {p.kind === "portfolio" && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {p.status === "awaiting_channels"
                                        ? `${p.pushedCount ?? 0} of ${p.memberCount} pushed`
                                        : `${p.connectedCount ?? 0} of ${p.memberCount} connected`}
                                    </span>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px] font-medium",
                                      ONBOARD_STATUS_BADGE[p.status].className,
                                    )}
                                  >
                                    {ONBOARD_STATUS_BADGE[p.status].label}
                                  </Badge>
                                </span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}

              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Not pushed = nothing at the channel manager yet · Awaiting channels = pushed, no
                sales channel connected · Channels connected = pushed and selling.
              </p>


              {requestNotice && (
                <p className="mt-1.5 text-xs text-muted-foreground">{requestNotice}</p>
              )}


            </div>
            {/* The account the pick is bound to, read straight from the gate snapshot. */}
            {propertyId && (
              <div className="min-w-[220px] flex-1">
                <Label className="text-xs">Distribution sub-account</Label>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {gate.loading
                    ? "Reading the binding…"
                    : boundLogin
                      ? `${boundLogin}${boundOwnerId ? ` · OwnerID ${boundOwnerId}` : " · not created yet"}`
                      : "Not linked to a sub-account yet — Step A will create one from the property slug."}
                </p>
                {!boundLogin && chosenLoginEmail && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Will use:</span>
                    <span className="font-mono break-all">{chosenLoginEmail}</span>
                    <button
                      type="button"
                      aria-label="Clear manual sub-account email"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setChosenLoginEmail("")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </p>
                )}
              </div>
            )}
            {propertyId && !accountProvisioned && (
              <Button
                size="sm"
                onClick={() => void runStep("a")}
                disabled={stepDisabled.a}
              >
                {runningStep === "a" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                )}
                {gate.stepAStatus === "blocked" ? "Retry Step A" : "Create Account"}
              </Button>
            )}
            {propertyId && !accountProvisioned && !boundLogin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setManualEmail(chosenLoginEmail);
                  setManualEmailError(null);
                  setManualEmailOpen(true);
                }}
                disabled={runningStep === "a"}
              >
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Add sub-account
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void gate.refresh()} disabled={!propertyId || gate.loading}>
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", gate.loading && "animate-spin")} />
              Refresh
            </Button>

          </div>

          {gate.sessionExpired ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
              <span>Your session expired — sign in again to continue onboarding.</span>
              <Button size="sm" variant="outline" onClick={() => void handleReauth()}>
                Sign in
              </Button>
            </div>
          ) : (
            gate.error && <p className="text-xs text-destructive">{gate.error}</p>
          )}
          {gate.connected && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              This property is live on the distribution layer — ordinary edits now push as deltas automatically.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Optional manual sub-account email: when saved, Step A uses it instead of the slug flow. */}
      <Dialog open={manualEmailOpen} onOpenChange={setManualEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add sub-account email</DialogTitle>
            <DialogDescription>
              Enter the owner email to register as the distribution sub-account. Leave it blank or
              cancel and Step A will generate one from the property slug instead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="manual-sub-account-email" className="text-xs">Owner email</Label>
            <Input
              id="manual-sub-account-email"
              type="email"
              value={manualEmail}
              onChange={(e) => {
                setManualEmail(e.target.value);
                setManualEmailError(null);
              }}
              placeholder="owner@example.com"
              maxLength={50}
            />
            {manualEmailError && <p className="text-xs text-destructive">{manualEmailError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setManualEmailOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const email = manualEmail.trim().toLowerCase();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                  setManualEmailError("Enter a valid email address.");
                  return;
                }
                if (email.length > 50) {
                  setManualEmailError("The channel limits emails to 50 characters.");
                  return;
                }
                setChosenLoginEmail(email);
                setManualEmailOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          onRunStepA={() => {
            // Accepting hands over to the Step A card: close here, then run.
            setAccountDialogOpen(false);
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
