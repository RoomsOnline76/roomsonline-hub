import { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { ChannelCostSummary } from "@/components/admin/channel-monitor/ChannelCostSummary";
import { ChannelBillingSchedule } from "@/components/admin/channel-monitor/ChannelBillingSchedule";
import { ChannelPropertyTable } from "@/components/admin/channel-monitor/ChannelPropertyTable";
import { ChannelArchiveLog } from "@/components/admin/channel-monitor/ChannelArchiveLog";
import { ArchivePropertyDialog } from "@/components/admin/channel-monitor/ArchivePropertyDialog";
import { ChannelRuStatusStrip } from "@/components/admin/channel-monitor/ChannelRuStatusStrip";
import { notifyRuAccountsChanged } from "@/lib/ruAccountsSignal";
import { ChannelCallQueuePanel } from "@/components/admin/channel-monitor/ChannelCallQueuePanel";
import { ChannelLedgerMetricsPanel } from "@/components/admin/channel-monitor/ChannelLedgerMetricsPanel";


import { ChannelReconciliationPanel } from "@/components/admin/channel-monitor/ChannelReconciliationPanel";


// Heavy panels only load when their tab is opened, keeping the default cost view fast.
const PortfolioRuAccountsTab = lazy(() =>
  import("@/components/portfolio/PortfolioRuAccountsTab").then((m) => ({ default: m.PortfolioRuAccountsTab })),
);
const ChannelCertificationTab = lazy(() =>
  import("@/components/admin/channel-monitor/ChannelCertificationTab").then((m) => ({
    default: m.ChannelCertificationTab,
  })),
);
const RuReservationsPanel = lazy(() =>
  import("@/components/integrations/RuReservationsPanel").then((m) => ({ default: m.RuReservationsPanel })),
);
const BookingSyncTrailPanel = lazy(() =>
  import("@/components/admin/channel-monitor/BookingSyncTrailPanel").then((m) => ({
    default: m.BookingSyncTrailPanel,
  })),
);
const RuApiLogPanel = lazy(() =>
  import("@/components/admin/channel-monitor/RuApiLogPanel").then((m) => ({ default: m.RuApiLogPanel })),
);

const RuBuildingsPanel = lazy(() =>
  import("@/components/integrations/RuBuildingsPanel").then((m) => ({ default: m.RuBuildingsPanel })),
);
const RuCoverageTab = lazy(() =>
  import("@/components/integrations/RuCoverageTab").then((m) => ({ default: m.RuCoverageTab })),
);
const RuAvailabilityPlayground = lazy(() =>
  import("@/components/integrations/RuAvailabilityPlayground").then((m) => ({
    default: m.RuAvailabilityPlayground,
  })),
);
const RuPricingPlayground = lazy(() =>
  import("@/components/integrations/RuPricingPlayground").then((m) => ({ default: m.RuPricingPlayground })),
);
const RuCalendarVerifyPanel = lazy(() =>
  import("@/components/integrations/RuCalendarVerifyPanel").then((m) => ({
    default: m.RuCalendarVerifyPanel,
  })),
);

/** Left-rail sections. Order is fixed so RU IT always finds a surface in two clicks. */
type TabKey =
  | "accounts"
  | "cost"
  | "binding"
  | "mapping"
  | "ari"
  | "reservations"
  | "cert"
  | "advanced";

const RAIL: Array<{ key: TabKey; title: string; tests: string; devOnly?: boolean }> = [
  {
    key: "accounts",
    title: "Accounts & Company",
    tests: "Create / archive sub-users and push company details required for cert.",
  },
  {
    key: "cost",
    title: "Cost Monitor",
    tests: "Confirms billable listing counts and forecast spend per sub-account.",
  },
  {
    key: "binding",
    title: "Property Binding",
    tests: "Verifies each property is bound to the correct channel listing and building.",
  },
  {
    key: "mapping",
    title: "Room & Rate Mapping",
    tests: "Checks room types and rate plans map to live channel listings.",
  },
  {
    key: "ari",
    title: "ARI Live Lab",
    tests: "Runs live availability and pricing reads against the channel for a chosen property.",
  },
  {
    key: "reservations",
    title: "Reservation Round-Trip",
    tests: "Creates, modifies and cancels reservations end-to-end and shows the sync trail.",
  },
  {
    key: "cert",
    title: "Cert Status & Logs",
    tests: "Full certification console with run history and the searchable RU exchange log.",
  },
  {
    key: "advanced",
    title: "Advanced (Dev only)",
    tests: "Queue, retries and low-level channel plumbing for engineers.",
    devOnly: true,
  },
];

const TAB_KEYS: TabKey[] = RAIL.map((r) => r.key);
// Old tab names stay valid so health-report and wizard deep links keep working.
const LEGACY_TAB_MAP: Record<string, TabKey> = { diagnostics: "cert" };

/** Chip tone: ready / attention / failing / unknown. Presentation only. */
type ChipTone = "ok" | "warn" | "bad" | "muted";

const CHIP_TONE: Record<ChipTone, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
};

const relativeAge = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};


export default function AdminChannelMonitor() {
  const data = useChannelCostMonitor();
  const [params, setParams] = useSearchParams();
  const [target, setTarget] = useState<{ row: ChannelPropertyRow; mode: "archive" | "reactivate" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyUnitId, setBusyUnitId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<{ row: ChannelPropertyRow; unit?: ChannelUnitRow } | null>(null);
  // Deep link between the booking trail (decision) and the exchange log (raw payload).
  const [exchangeSearch, setExchangeSearch] = useState("");
  const exchangeLogRef = useRef<HTMLDivElement | null>(null);


  const { isDev, isFearlessLeader } = useAuth();
  const [certSubTab, setCertSubTab] = useState<string | undefined>(undefined);
  const [ariPropertyId, setAriPropertyId] = useState<string>("");

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

  // Deep-open the certification console on a specific sub-tab from another rail item.
  const openCert = useCallback(
    (subTab: string) => {
      setCertSubTab(subTab);
      setTab("cert");
    },
    [setTab],
  );

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
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      {item.tests}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </nav>

          <div className="min-w-0 space-y-4">
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

            {tab === "accounts" && (
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <PortfolioRuAccountsTab />
              </Suspense>
            )}

            {/* Listing/building binding evidence. */}
            {tab === "binding" && (
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <RuBuildingsPanel />
                <ChannelReconciliationPanel
                  billableListings={data.billableListings}
                  onChanged={() => data.refresh()}
                />
              </Suspense>
            )}

            {tab === "mapping" && (
              <>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => openCert("coverage")}>
                    Open certification coverage
                  </Button>
                </div>
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <RuCoverageTab />
                </Suspense>
              </>
            )}

            {tab === "ari" && (
              <>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-2 p-3">
                    <Select value={ariPropertyId} onValueChange={setAriPropertyId}>
                      <SelectTrigger className="w-full sm:w-80">
                        <SelectValue placeholder="Choose a property to test" />
                      </SelectTrigger>
                      <SelectContent>
                        {reservationProperties.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => openCert("availability")}>
                      Availability window
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openCert("pricing")}>
                      Pricing window
                    </Button>
                  </CardContent>
                </Card>
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <RuAvailabilityPlayground
                    propertyId={ariPropertyId}
                    propertyName={reservationProperties.find((p) => p.id === ariPropertyId)?.name}
                  />
                  <RuPricingPlayground
                    propertyId={ariPropertyId}
                    propertyName={reservationProperties.find((p) => p.id === ariPropertyId)?.name}
                  />
                </Suspense>
              </>
            )}

            {/* Reservation ingest diagnostics + Pull_GetReservationByID lookup + sync trail. */}
            {tab === "reservations" && (
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <RuReservationsPanel properties={reservationProperties} />
                <BookingSyncTrailPanel
                  properties={reservationProperties}
                  onInspectExchange={(term) => {
                    setExchangeSearch(term);
                    setTab("cert");
                    window.setTimeout(
                      () => exchangeLogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                      150,
                    );
                  }}
                />
              </Suspense>
            )}

            {/* Durable request/response/ResponseID log — the evidence trail for support escalations. */}
            {tab === "cert" && (
              <>
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <ChannelCertificationTab initialTab={certSubTab} />
                </Suspense>
                <ChannelLedgerMetricsPanel />
                <div ref={exchangeLogRef}>
                  <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                    <RuApiLogPanel properties={reservationProperties} searchTerm={exchangeSearch} />
                  </Suspense>
                </div>
              </>
            )}

            {tab === "advanced" && (
              <>
                <ChannelCallQueuePanel />
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <RuCalendarVerifyPanel properties={reservationProperties} />
                </Suspense>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm text-muted-foreground">
                    <span>Sync error classification, currency, live notifications and content quality.</span>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/admin/integrations/rentals-united?tab=errors">Open channel diagnostics</Link>
                    </Button>
                  </CardContent>
                </Card>
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
