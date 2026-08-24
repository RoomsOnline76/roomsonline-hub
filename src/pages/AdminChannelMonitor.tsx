import { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent } from "@/components/ui/card";

import { useChannelCostMonitor, type ChannelPropertyRow, type ChannelUnitRow } from "@/hooks/useChannelCostMonitor";
import { useChannelRailStatus } from "@/hooks/useChannelRailStatus";

import { ChannelCostSummary } from "@/components/admin/channel-monitor/ChannelCostSummary";
import { ChannelBillingSchedule } from "@/components/admin/channel-monitor/ChannelBillingSchedule";
import { ChannelPropertyTable } from "@/components/admin/channel-monitor/ChannelPropertyTable";
import { ChannelArchiveLog } from "@/components/admin/channel-monitor/ChannelArchiveLog";
import { ArchivePropertyDialog } from "@/components/admin/channel-monitor/ArchivePropertyDialog";
import { ChannelRuStatusStrip } from "@/components/admin/channel-monitor/ChannelRuStatusStrip";
import { notifyRuAccountsChanged } from "@/lib/ruAccountsSignal";
import { ChannelCallQueuePanel } from "@/components/admin/channel-monitor/ChannelCallQueuePanel";
import { LiveTrafficFrame } from "@/components/admin/channel-monitor/live/LiveTrafficFrame";


import { ChannelReconciliationPanel } from "@/components/admin/channel-monitor/ChannelReconciliationPanel";


// Heavy panels only load when their tab is opened, keeping the default cost view fast.
const ChannelOnboardTab = lazy(() =>
  import("@/components/admin/channel-monitor/ChannelOnboardTab").then((m) => ({ default: m.ChannelOnboardTab })),
);
const ChannelCertificationTab = lazy(() =>
  import("@/components/admin/channel-monitor/ChannelCertificationTab").then((m) => ({
    default: m.ChannelCertificationTab,
  })),
);
const BookingSyncTrailPanel = lazy(() =>
  import("@/components/admin/channel-monitor/BookingSyncTrailPanel").then((m) => ({
    default: m.BookingSyncTrailPanel,
  })),
);
const RuApiLogPanel = lazy(() =>
  import("@/components/admin/channel-monitor/RuApiLogPanel").then((m) => ({ default: m.RuApiLogPanel })),
);
const ChannelSyncObservabilityPanel = lazy(() =>
  import("@/components/admin/channel-monitor/ChannelSyncObservabilityPanel").then((m) => ({
    default: m.ChannelSyncObservabilityPanel,
  })),
);


/** Left-rail sections. Order is fixed so RU IT always finds a surface in two clicks. */
type TabKey = "onboard" | "cost" | "advanced";

const RAIL: Array<{ key: TabKey; title: string; tests: string; devOnly?: boolean }> = [
  {
    key: "onboard",
    title: "Onboard Property",
    tests: "Readiness gate, owner binding, then the two steps that take a property live.",
  },
  {
    key: "cost",
    title: "Cost Monitor",
    tests: "Confirms billable listing counts and forecast spend per sub-account.",
  },
  {
    key: "advanced",
    title: "Advanced",
    tests: "Exchange log, booking sync trail, refresh compliance and the background call queue.",
    devOnly: true,
  },
];

const TAB_KEYS: TabKey[] = RAIL.map((r) => r.key);
/**
 * Retired rails keep working as deep links: mapping/coverage evidence lives in Cert, while the
 * engineering surfaces (diagnostics, ARI labs, reservation round-trip, binding) fold into Advanced.
 */
const LEGACY_TAB_MAP: Record<string, TabKey> = {
  // Account management and the company profile now live inside Step A's preview modal.
  accounts: "onboard",
  diagnostics: "advanced",
  binding: "advanced",
  ari: "advanced",
  reservations: "advanced",
  // Certification evidence retired: the compliance frame it mattered for lives in Advanced.
  cert: "advanced",
  mapping: "advanced",
};


/** Chip tone: ready / attention / failing / unknown. Presentation only. */
type ChipTone = "ok" | "warn" | "bad" | "muted";

const CHIP_TONE: Record<ChipTone, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
};



export default function AdminChannelMonitor() {
  const data = useChannelCostMonitor();
  // Shared readiness snapshot (also feeding the status strip) — no extra queries.
  const railStatus = useChannelRailStatus();
  const [params, setParams] = useSearchParams();
  const [target, setTarget] = useState<{ row: ChannelPropertyRow; mode: "archive" | "reactivate" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyUnitId, setBusyUnitId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<{ row: ChannelPropertyRow; unit?: ChannelUnitRow } | null>(null);
  // Deep link between the booking trail (decision) and the exchange log (raw payload).
  const [exchangeSearch, setExchangeSearch] = useState("");
  const [exchangeOpen, setExchangeOpen] = useState(false);
  // Every Advanced frame opens closed: engineers reach for one tool at a time.
  const [trailOpen, setTrailOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [observabilityOpen, setObservabilityOpen] = useState(false);
  const exchangeLogRef = useRef<HTMLElement | null>(null);


  const { isDev, isFearlessLeader } = useAuth();

  const rawTab = params.get("tab");
  const mapped = rawTab ? (LEGACY_TAB_MAP[rawTab] ?? (rawTab as TabKey)) : null;
  const tab: TabKey = mapped && TAB_KEYS.includes(mapped) ? mapped : "cost";

  // Tab lives in the URL so health reports, the RU wizard and certification logs can deep-link.
  const setTab = useCallback(
    (next: string) => {
      const nextParams = new URLSearchParams(params);
      if (next === "cost") nextParams.delete("tab");
      else nextParams.set("tab", next);
      setParams(nextParams, { replace: true });
    },
    [params, setParams],
  );

  const handleToggleUnit = useCallback(
    async (row: ChannelPropertyRow, unit: ChannelUnitRow, activate: boolean) => {
      setBusyUnitId(unit.id);
      try {
        const { data: res, error } = await supabase.functions.invoke("channel-manager-entitlement", {
          body: {
            scope: "unit",
            entity_id: unit.id,
            enabled: activate,
            notify: false,
          },
        });
        if (error) throw new Error(error.message);
        const payload = res as { failed?: number; results?: Array<{ kept_active?: boolean }> } | null;
        const failed = payload?.failed ?? 0;
        const keptActive = payload?.results?.[0]?.kept_active === true;
        if (failed > 0) {
          toast.warning(
            `${unit.name} updated locally, but the channel manager rejected the status change.`,
          );
        } else if (!activate && keptActive) {
          toast.success(
            `${unit.name} delisted from the channel — still active and sellable in ROL'OS (it is on the property's Rooms tab).`,
          );
        } else {
          toast.success(`${unit.name} ${activate ? "re-activated" : "deactivated"}`);
        }

        await data.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusyUnitId(null);
      }
    },
    [data],
  );

  const runPurgeDuplicate = useCallback(
    async (row: ChannelPropertyRow, unit?: ChannelUnitRow) => {
      setPurgeTarget(null);
      if (unit) setBusyUnitId(unit.id);
      else setBusyId(row.id);
      try {
        const { data: res, error } = await supabase.functions.invoke("channel-manager-entitlement", {
          body: {
            scope: "purge_duplicates",
            entity_id: row.id,
            unit_id: unit?.id,
            reason: "Duplicate listing purge from Channel Monitor",
          },
        });
        if (error) throw new Error(error.message);
        const payload = res as { purged?: number; failed?: number } | null;
        const purged = payload?.purged ?? 0;
        const failed = payload?.failed ?? 0;
        if (failed > 0) {
          toast.warning(`${purged} removed, ${failed} could not be removed at the channel manager.`);
        } else {
          toast.success(`${purged} duplicate listing${purged === 1 ? "" : "s"} removed from the channel manager`);
        }
        await data.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Purge failed");
      } finally {
        setBusyUnitId(null);
        setBusyId(null);
      }
    },
    [data],
  );


  const runPropertyToggle = useCallback(
    async (row: ChannelPropertyRow, mode: "archive" | "reactivate", reason?: string) => {
      setBusyId(row.id);
      try {
        const { data: res, error } = await supabase.functions.invoke("channel-manager-entitlement", {
          body: {
            scope: "property",
            entity_id: row.id,
            // enabled=false archives the property at the channel manager.
            enabled: mode === "reactivate",
            include_units: true,
            notify: mode === "reactivate",
            reason: reason || undefined,
          },
        });


        if (error) throw new Error(error.message);
        const skipped = (
          res as { results?: Array<{ status?: string; detail?: string }> } | null
        )?.results?.filter((r) => r.status === "skipped") ?? [];
        if (mode === "reactivate" && skipped.length) {
          toast.error(
            skipped[0]?.detail ||
              "Push cannot be enabled until the Channel wizard gates pass (owner bound, key & secret, company details).",
          );
          await data.refresh();
          return;
        }
        const failed = (res as { failed?: number } | null)?.failed ?? 0;
        const noticeError = (res as { notification_error?: string | null } | null)?.notification_error;
        const ariRow = (
          res as { results?: Array<{ ari_push_error?: string | null; ari_push_retryable?: boolean }> } | null
        )?.results?.find((r) => r.ari_push_error);
        const ariError = ariRow?.ari_push_error;

        if (failed > 0) {
          toast.warning(
            mode === "archive"
              ? "Archived locally, but the channel manager rejected the status change."
              : "Re-activated locally, but the channel manager rejected the status change.",
          );
        } else {
          toast.success(
            mode === "archive"
              ? `${row.name} archived`
              : ariError
                ? `${row.name} is live again`
                : `${row.name} re-activated — availability and rates re-pushed`,
          );
        }
        if (mode === "reactivate" && ariError) {
          if (ariRow?.ari_push_retryable) {
            toast.info(
              `Availability and rates are still syncing — the channel manager was briefly unreachable. The scheduled sync will finish it, or use Refresh ARI to retry now.`,
            );
          } else {
            toast.warning(`Rates and availability re-push failed: ${ariError}`);
          }
        }

        if (mode === "reactivate" && noticeError) {
          toast.warning(`Re-activation notice not sent: ${noticeError}`);
        }


        setTarget(null);
        await data.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusyId(null);
      }
    },
    [data],
  );

  // Archiving asks for a reason (it stops selling); activation is a single click.
  const handleConfirm = useCallback(
    async (reason: string) => {
      if (!target) return;
      await runPropertyToggle(target.row, target.mode, reason);
    },
    [target, runPropertyToggle],
  );


  const currentMonth = useMemo(() => data.forecast.month, [data.forecast.month]);

  // Reservation diagnostics only make sense for properties the channel manager knows about.
  const reservationProperties = useMemo(
    () => data.properties.map((p) => ({ id: p.id, name: p.name })),
    [data.properties],
  );

  const visibleRail = useMemo(
    () => RAIL.filter((item) => !item.devOnly || isDev || isFearlessLeader),
    [isDev, isFearlessLeader],
  );

  // Every chip below reads state the page already has in memory — no extra queries.
  const railChips = useMemo<Record<TabKey, { tone: ChipTone; label: string }>>(() => {
    const loading = data.loading || railStatus.loading;
    const neverPushed = data.properties.filter((p) => p.neverPushed).length;
    const run = railStatus.latestRun;
    const keys = railStatus.keys;

    if (loading) {
      const pending = { tone: "muted" as ChipTone, label: "Checking…" };
      return {
        onboard: pending,
        cost: pending,
        advanced: { tone: "muted", label: "Engineers only" },
      };
    }


    return {
      // Account/key health now reports on the Onboard chip — Step A owns that surface.
      onboard:
        keys.total > 0 && keys.verified < keys.total
          ? {
              tone: keys.withKeys < keys.total ? "bad" : "warn",
              label: `${keys.total - keys.verified} account key(s) unverified`,
            }
          : neverPushed === 0
            ? { tone: "ok", label: "All properties pushed" }
            : { tone: "warn", label: `${neverPushed} awaiting go-live` },
      cost: { tone: "muted", label: `${data.billableListings} listings billable` },
      // Cost chip already reports listings; footprint/ARI/live counts feed the cert chip context.


      advanced: { tone: "muted", label: "Engineers only" },
    };
  }, [data, railStatus]);





  return (
    <AppLayout>
      <div className="container mx-auto space-y-4 px-4 py-6">
        <PageHeader
          title="Channel Monitor"
          subtitle="One console for distribution spend, sub-accounts and certification: everything needed to onboard and stay compliant."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                notifyRuAccountsChanged();
                void data.refresh();
              }}
              disabled={data.loading}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${data.loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

          }
        />

        {data.error && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">{data.error}</CardContent>
          </Card>
        )}

        <ChannelRuStatusStrip data={data} onNavigate={(t) => setTab(t)} />

        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Compact sticky rail: every testable surface is one click away. */}
          <nav className="lg:sticky lg:top-4 lg:self-start">
            <Card>
              <CardContent className="space-y-1 p-2">
                {visibleRail.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    aria-current={tab === item.key ? "page" : undefined}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left transition-colors",
                      tab === item.key
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-transparent hover:bg-muted",
                    )}
                  >
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span
                      className={cn(
                        "mt-1 inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        CHIP_TONE[railChips[item.key].tone],
                      )}
                    >
                      {railChips[item.key].label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                      {item.tests}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </nav>

          <div className="min-w-0 space-y-4">
            {tab === "onboard" && (
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <ChannelOnboardTab
                  initialPropertyId={params.get("property") ?? undefined}
                  initialPortfolioId={params.get("portfolio") ?? undefined}
                  focusConnect={params.get("focus") === "connect"}
                  onSelectionChange={(id) => {
                    // Keep the deep link honest so a refresh or a shared URL lands
                    // on the same target the operator is looking at.
                    const next = new URLSearchParams(params);
                    if (id) next.set("property", id);
                    else next.delete("property");
                    next.delete("portfolio");
                    setParams(next, { replace: true });
                  }}
                />

              </Suspense>
            )}

            {tab === "cost" &&
              (data.loading && data.properties.length === 0 ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : (
                <>
                  <ChannelCostSummary data={data} />
                  <ChannelBillingSchedule schedule={data.schedule} currentMonth={currentMonth} fx={data.fx} />
                  <ChannelPropertyTable
                    rows={data.properties}
                    fx={data.fx}
                    busyPropertyId={busyId}
                    busyUnitId={busyUnitId}
                    onToggleUnit={handleToggleUnit}
                    onArchive={(row) => setTarget({ row, mode: "archive" })}
                    onReactivate={(row) => void runPropertyToggle(row, "reactivate")}
                    onPurgeDuplicate={(row, unit) => setPurgeTarget({ row, unit })}
                  />
                  <ChannelReconciliationPanel
                    billableListings={data.billableListings}
                    onChanged={() => data.refresh()}
                  />
                  <ChannelArchiveLog events={data.events} />
                </>
              ))}

            {/* Engineers' surface: exchange log, booking trail, refresh compliance, call queue. */}
            {tab === "advanced" && (
              <>
                <Collapsible open={exchangeOpen} onOpenChange={setExchangeOpen}>
                  <section className="space-y-2" ref={exchangeLogRef}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Exchange log (sync &amp; errors)
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${exchangeOpen ? "rotate-180" : ""}`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2">
                      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                        <RuApiLogPanel properties={reservationProperties} searchTerm={exchangeSearch} />
                      </Suspense>
                    </CollapsibleContent>
                  </section>
                </Collapsible>

                <Collapsible open={trailOpen} onOpenChange={setTrailOpen}>
                  <section className="space-y-2">
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Booking sync trail
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${trailOpen ? "rotate-180" : ""}`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2">
                      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                        <BookingSyncTrailPanel
                          properties={reservationProperties}
                          onInspectExchange={(term) => {
                            setExchangeSearch(term);
                            setExchangeOpen(true);
                            window.setTimeout(
                              () => exchangeLogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                              150,
                            );
                          }}
                        />
                      </Suspense>
                    </CollapsibleContent>
                  </section>
                </Collapsible>

                <Collapsible open={complianceOpen} onOpenChange={setComplianceOpen}>
                  <section className="space-y-2">
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Refresh compliance
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${complianceOpen ? "rotate-180" : ""}`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2">
                      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                        <ChannelCertificationTab variant="advanced" />
                      </Suspense>
                    </CollapsibleContent>
                  </section>
                </Collapsible>

                <Collapsible open={observabilityOpen} onOpenChange={setObservabilityOpen}>
                  <section className="space-y-2">
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Sync observability &amp; error handling
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${observabilityOpen ? "rotate-180" : ""}`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2">
                      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                        <ChannelSyncObservabilityPanel />
                      </Suspense>
                    </CollapsibleContent>
                  </section>
                </Collapsible>

                <ChannelCallQueuePanel />

                {/* Always-on: the live feed is the one frame an engineer keeps open while pushing. */}
                <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                  <LiveTrafficFrame />
                </Suspense>


              </>
            )}


          </div>
        </div>


      </div>

      <ArchivePropertyDialog
        open={!!target}
        mode={target?.mode ?? "archive"}
        property={target?.row ?? null}
        busy={!!busyId}
        onCancel={() => setTarget(null)}
        onConfirm={handleConfirm}
      />

      <AlertDialog open={!!purgeTarget} onOpenChange={(open) => !open && setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove duplicate listings?</AlertDialogTitle>
            <AlertDialogDescription>
              {purgeTarget?.unit
                ? `"${purgeTarget.unit.name}" will be archived at the channel manager and its listing link cleared permanently.`
                : `${purgeTarget?.row.duplicateListings ?? 0} duplicate listing${
                    (purgeTarget?.row.duplicateListings ?? 0) === 1 ? "" : "s"
                  } for ${purgeTarget?.row.name ?? ""} will be archived at the channel manager and their listing links cleared permanently. Live listings are not affected.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyId || !!busyUnitId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!busyId || !!busyUnitId}
              onClick={(e) => {
                e.preventDefault();
                if (purgeTarget) void runPurgeDuplicate(purgeTarget.row, purgeTarget.unit);
              }}
            >
              Remove from channel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppLayout>
  );
}
