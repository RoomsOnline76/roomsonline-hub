import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, CreditCard, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GATEWAY_MODEL_LABELS,
  getEffectiveBillingRate,
  listGatewaySchedules,
  loadGatewaySchedule,
  loadPeriodVolume,
  normalizeGatewayModel,
  summariseVolumeTiers,
  normalizeVolumeTiers,
} from "@/lib/gatewayBillingRate";

const money = (v: number) => `R${v.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
const GLOBAL = "__global__";

const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Shows the payment-processing schedule that actually applies to this property
 * and — for elevated roles only — allows pinning a schedule version or agreeing
 * a negotiated rate. Read-only for everyone else.
 */
export function GatewayScheduleCard({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const { isAdmin, isDev, isFearlessLeader } = useAuth();
  const canEdit = !!(isDev || isFearlessLeader || isAdmin);

  const [configId, setConfigId] = useState<string>(GLOBAL);
  const [pctOverride, setPctOverride] = useState("");
  const [feeOverride, setFeeOverride] = useState("");
  const [probeAmount, setProbeAmount] = useState("1500");

  const { data: schedules = [] } = useQuery({
    queryKey: ["gateway-billing-configs", "list"],
    queryFn: listGatewaySchedules,
  });

  const { data: resolved, isLoading } = useQuery({
    queryKey: ["gateway-schedule-for-property", propertyId],
    queryFn: async () => {
      const [schedule, volume] = await Promise.all([loadGatewaySchedule(propertyId), loadPeriodVolume(propertyId)]);
      const { data: row } = await supabase
        .from("property_billing_configs")
        .select("gateway_billing_config_id, gateway_percentage_override, gateway_fixed_fee_override")
        .eq("property_id", propertyId)
        .maybeSingle();
      return { schedule, volume, row: row as Record<string, unknown> | null };
    },
    enabled: !!propertyId,
  });

  useEffect(() => {
    const row = resolved?.row as
      | { gateway_billing_config_id?: string | null; gateway_percentage_override?: number | null; gateway_fixed_fee_override?: number | null }
      | null
      | undefined;
    setConfigId(row?.gateway_billing_config_id || GLOBAL);
    setPctOverride(row?.gateway_percentage_override != null ? String(row.gateway_percentage_override) : "");
    setFeeOverride(row?.gateway_fixed_fee_override != null ? String(row.gateway_fixed_fee_override) : "");
  }, [resolved?.row]);

  // Preview reflects the unsaved selection, so the quoted rate matches intent.
  const previewConfig = useMemo(() => {
    if (configId !== GLOBAL) return schedules.find((s) => s.id === configId) ?? null;
    return resolved?.schedule.config ?? null;
  }, [configId, schedules, resolved?.schedule.config]);

  const rate = useMemo(
    () =>
      getEffectiveBillingRate(previewConfig, num(probeAmount) ?? 0, resolved?.volume ?? 0, {
        gateway_percentage_override: num(pctOverride),
        gateway_fixed_fee_override: num(feeOverride),
      }),
    [previewConfig, probeAmount, resolved?.volume, pctOverride, feeOverride],
  );

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("property_billing_configs")
        .update({
          gateway_billing_config_id: configId === GLOBAL ? null : configId,
          gateway_percentage_override: num(pctOverride),
          gateway_fixed_fee_override: num(feeOverride),
        } as never)
        .eq("property_id", propertyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gateway-schedule-for-property", propertyId] });
      qc.invalidateQueries({ queryKey: ["gateway-billing-assignments"] });
      toast.success("Processing schedule saved");
    },
    onError: (e: Error) => toast.error(e.message || "Could not save the schedule"),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Resolving processing schedule…
        </CardContent>
      </Card>
    );
  }

  const source = resolved?.schedule.source ?? "none";
  const tiers = normalizeVolumeTiers(previewConfig?.volume_tiers);
  const model = normalizeGatewayModel(previewConfig?.model);
  const banded = model === "hybrid" || model === "volume_tiered";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4" /> Payment processing schedule
          <Badge variant="outline" className="text-[10px] capitalize">
            {source === "none" ? "none configured" : `${source} level`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {previewConfig ? (
          <div className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium">
                {GATEWAY_MODEL_LABELS[model]}
                {previewConfig.version != null ? ` v${previewConfig.version}` : ""}
              </span>
              <span className="text-muted-foreground">
                {rate.percentage}%{rate.fixed_fee ? ` + ${money(rate.fixed_fee)} per transaction` : ""}
                {rate.monthly_fee ? ` · ${money(rate.monthly_fee)} per month` : ""}
              </span>
              {rate.usedOverride && (
                <Badge variant="secondary" className="text-[10px]">
                  Negotiated rate
                </Badge>
              )}
            </div>
            {banded && !!tiers.length && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Bands: {summariseVolumeTiers(tiers, rate.currency)} · trailing 30-day volume{" "}
                {money(resolved?.volume ?? 0)}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">On a booking of</Label>
              <Input
                type="number"
                className="h-8 w-28"
                value={probeAmount}
                onChange={(e) => setProbeAmount(e.target.value)}
              />
              <span className="text-sm">
                the fee is <strong>{money(rate.amount_charged)}</strong>{" "}
                <span className="text-muted-foreground">({rate.effective_rate}% effective)</span>
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No processing schedule is configured. The legacy flat transaction fee applies.
          </p>
        )}

        {canEdit ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Pinned schedule</Label>
              <Select value={configId} onValueChange={setConfigId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL}>Follow the active default</SelectItem>
                  {schedules.map((s) => (
                    <SelectItem key={s.id} value={s.id!}>
                      {s.name} v{s.version ?? 1} — {GATEWAY_MODEL_LABELS[normalizeGatewayModel(s.model)]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Negotiated percentage</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Schedule rate"
                  value={pctOverride}
                  onChange={(e) => setPctOverride(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Negotiated fixed fee</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Schedule fee"
                  value={feeOverride}
                  onChange={(e) => setFeeOverride(e.target.value)}
                />
              </div>
            </div>
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save schedule
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Changing the schedule changes what the next contract quotes and what the invoice run charges.
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> Only administrators can change the processing schedule.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
