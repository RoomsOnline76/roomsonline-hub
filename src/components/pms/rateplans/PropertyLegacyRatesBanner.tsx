import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Wand2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AuditPlan {
  rate_plan_id: string;
  name: string;
  pending_cells: number;
}

interface Props {
  propertyId: string;
  /** Called after a successful migration so the caller can refresh its plan data. */
  onMigrated?: () => void;
}

/**
 * Property-wide sweep for rates that still live only in the legacy Calendar grid.
 *
 * The per-plan banner inside the editor is the precise tool; this is the "do the whole
 * property" shortcut. It never overwrites a rate already authored in Rate Plans.
 */
export function PropertyLegacyRatesBanner({ propertyId, onMigrated }: Props) {
  const [plans, setPlans] = useState<AuditPlan[]>([]);
  const [pendingCells, setPendingCells] = useState(0);
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const audit = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    const { data } = await supabase.functions.invoke("rolos-rate-plans", {
      body: { action: "legacy_rate_audit", property_id: propertyId },
    });
    const payload = data as { plans?: AuditPlan[]; pending_cells?: number } | null;
    const rows = (payload?.plans ?? []).filter((p) => Number(p.pending_cells) > 0);
    setPlans(rows);
    setPendingCells(Number(payload?.pending_cells ?? 0));
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    void audit();
  }, [audit]);

  const migrate = useCallback(async () => {
    setMigrating(true);
    const { data, error } = await supabase.functions.invoke("rolos-rate-plans", {
      body: { action: "migrate_calendar_rates", property_id: propertyId },
    });
    setMigrating(false);
    const payload = data as { migrated?: number; plans_migrated?: number; failures?: string[]; error?: string } | null;
    const failure = payload?.error || error?.message;
    if (failure) {
      toast.error(failure);
      return;
    }
    if (payload?.failures?.length) toast.warning(payload.failures.join(" · "));
    toast.success(
      `${payload?.migrated ?? 0} rate${payload?.migrated === 1 ? "" : "s"} moved into ${payload?.plans_migrated ?? 0} plan${payload?.plans_migrated === 1 ? "" : "s"}`,
    );
    await audit();
    onMigrated?.();
  }, [propertyId, audit, onMigrated]);

  if (loading && pendingCells === 0) return null;
  if (pendingCells === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="max-w-[44rem] space-y-1">
        <p className="text-xs font-medium">
          {pendingCells} rate{pendingCells === 1 ? "" : "s"} still stored on the old Calendar grid
        </p>
        <p className="text-xs text-muted-foreground">
          Affects {plans.map((p) => p.name).join(", ")}. Moving them makes Rate Plans the only place these prices are
          authored. Existing Rate Plan prices are never replaced.
        </p>
      </div>
      <Button type="button" size="sm" variant="secondary" className="h-7 shrink-0 gap-1.5 text-xs" disabled={migrating} onClick={() => void migrate()}>
        {migrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
        Move all into Rate Plans
      </Button>
    </div>
  );
}
