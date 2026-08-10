import { useCallback, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useChannelCostMonitor, type ChannelPropertyRow, type ChannelUnitRow } from "@/hooks/useChannelCostMonitor";
import { ChannelCostSummary } from "@/components/admin/channel-monitor/ChannelCostSummary";
import { ChannelBillingSchedule } from "@/components/admin/channel-monitor/ChannelBillingSchedule";
import { ChannelPropertyTable } from "@/components/admin/channel-monitor/ChannelPropertyTable";
import { ChannelArchiveLog } from "@/components/admin/channel-monitor/ChannelArchiveLog";
import { ArchivePropertyDialog } from "@/components/admin/channel-monitor/ArchivePropertyDialog";

export default function AdminChannelMonitor() {
  const data = useChannelCostMonitor();
  const [target, setTarget] = useState<{ row: ChannelPropertyRow; mode: "archive" | "reactivate" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyUnitId, setBusyUnitId] = useState<string | null>(null);

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
        const failed = (res as { failed?: number } | null)?.failed ?? 0;
        if (failed > 0) {
          toast.warning(
            `${unit.name} updated locally, but the channel manager rejected the status change.`,
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


  const handleConfirm = useCallback(
    async (reason: string) => {
      if (!target) return;
      const { row, mode } = target;
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
    [target, data],
  );

  const currentMonth = useMemo(() => data.forecast.month, [data.forecast.month]);

  return (
    <AppLayout>
      <div className="container mx-auto space-y-4 px-4 py-6">
        <PageHeader
          title="Channel Manager Cost Monitor"
          subtitle="Forecast distribution spend against the period minimums and archive listings you are not selling."
          actions={
            <Button variant="outline" size="sm" onClick={() => void data.refresh()} disabled={data.loading}>
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
              onReactivate={(row) => setTarget({ row, mode: "reactivate" })}
            />
            <ChannelArchiveLog events={data.events} />
          </>
        )}
      </div>

      <ArchivePropertyDialog
        open={!!target}
        mode={target?.mode ?? "archive"}
        property={target?.row ?? null}
        busy={!!busyId}
        onCancel={() => setTarget(null)}
        onConfirm={handleConfirm}
      />
    </AppLayout>
  );
}
