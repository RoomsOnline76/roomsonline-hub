import { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type TabKey = "cost" | "accounts" | "cert" | "reservations" | "diagnostics";
const TAB_KEYS: TabKey[] = ["cost", "accounts", "cert", "reservations", "diagnostics"];

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


  const rawTab = params.get("tab") as TabKey | null;
  const tab: TabKey = rawTab && TAB_KEYS.includes(rawTab) ? rawTab : "cost";

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

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="cost">Cost &amp; listings</TabsTrigger>
            <TabsTrigger value="accounts">RU Accounts Manager</TabsTrigger>
            <TabsTrigger value="cert">Certification</TabsTrigger>
            <TabsTrigger value="reservations">Reservations</TabsTrigger>
            <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          </TabsList>


          <TabsContent value="cost" className="space-y-4">
            {data.loading && data.properties.length === 0 ? (
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
            )}

          </TabsContent>

          <TabsContent value="accounts">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <PortfolioRuAccountsTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="cert">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <ChannelCertificationTab />
            </Suspense>
          </TabsContent>

          {/* Reservation ingest diagnostics + Pull_GetReservationByID lookup live in the same console. */}
          <TabsContent value="reservations">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <RuReservationsPanel properties={reservationProperties} />
            </Suspense>
          </TabsContent>

          {/* Durable request/response/ResponseID log — the evidence trail for support escalations. */}
          <TabsContent value="diagnostics" className="space-y-6">
            <ChannelCallQueuePanel />
            <ChannelLedgerMetricsPanel />
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <BookingSyncTrailPanel
                properties={reservationProperties}
                onInspectExchange={(term) => {
                  setExchangeSearch(term);
                  exchangeLogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            </Suspense>
            <div ref={exchangeLogRef}>
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <RuApiLogPanel properties={reservationProperties} searchTerm={exchangeSearch} />
              </Suspense>
            </div>

          </TabsContent>
        </Tabs>

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
