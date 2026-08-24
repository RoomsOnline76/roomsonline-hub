import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2, Building2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  GATEWAY_BILLING_MODELS,
  GATEWAY_MODEL_LABELS,
  PAYFAST_COST_FIXED_FEE,
  PAYFAST_COST_PERCENTAGE,
  coversAcquirerCost,
  getEffectiveBillingRate,
  normalizeGatewayModel,
  normalizeVolumeTiers,
  summariseVolumeTiers,
  type GatewayBillingConfig,
  type GatewayBillingModel,
  type GatewayVolumeTier,
} from "@/lib/gatewayBillingRate";

interface ScheduleRow extends GatewayBillingConfig {
  id: string;
  is_active?: boolean | null;
  effective_from?: string | null;
}

interface AssignmentRow {
  property_id: string | null;
  gateway_billing_config_id: string | null;
  properties?: { name: string | null } | null;
}

const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const money = (v: number) => `R${v.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;

/** Editable draft of a schedule — string-backed so partial input is preserved. */
interface Draft {
  name: string;
  model: GatewayBillingModel;
  base_percentage: string;
  fixed_fee_per_txn: string;
  monthly_platform_fee: string;
  passthrough_markup_percentage: string;
  currency: string;
  is_active: boolean;
  tiers: GatewayVolumeTier[];
}

function toDraft(row: ScheduleRow): Draft {
  return {
    name: row.name || "",
    model: normalizeGatewayModel(row.model),
    base_percentage: row.base_percentage != null ? String(row.base_percentage) : "",
    fixed_fee_per_txn: row.fixed_fee_per_txn != null ? String(row.fixed_fee_per_txn) : "",
    monthly_platform_fee: row.monthly_platform_fee != null ? String(row.monthly_platform_fee) : "",
    passthrough_markup_percentage:
      row.passthrough_markup_percentage != null ? String(row.passthrough_markup_percentage) : "",
    currency: row.currency || "ZAR",
    is_active: !!row.is_active,
    tiers: normalizeVolumeTiers(row.volume_tiers),
  };
}

function TierEditor({ tiers, onChange }: { tiers: GatewayVolumeTier[]; onChange: (t: GatewayVolumeTier[]) => void }) {
  const set = (i: number, patch: Partial<GatewayVolumeTier>) =>
    onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_90px_90px_36px] gap-2 text-[11px] text-muted-foreground">
        <span>Volume from</span>
        <span>Volume to (blank = open)</span>
        <span>Rate %</span>
        <span>Fixed fee</span>
        <span />
      </div>
      {tiers.map((tier, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_90px_90px_36px] gap-2">
          <Input
            type="number"
            value={String(tier.min_monthly_volume)}
            onChange={(e) => set(i, { min_monthly_volume: num(e.target.value) ?? 0 })}
          />
          <Input
            type="number"
            value={tier.max_monthly_volume == null ? "" : String(tier.max_monthly_volume)}
            placeholder="No cap"
            onChange={(e) => set(i, { max_monthly_volume: num(e.target.value) })}
          />
          <Input
            type="number"
            step="0.01"
            value={String(tier.percentage)}
            onChange={(e) => set(i, { percentage: num(e.target.value) ?? 0 })}
          />
          <Input
            type="number"
            step="0.01"
            value={tier.fixed_fee == null ? "" : String(tier.fixed_fee)}
            onChange={(e) => set(i, { fixed_fee: num(e.target.value) })}
          />
          <Button variant="ghost" size="icon" onClick={() => onChange(tiers.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...tiers,
            {
              min_monthly_volume: tiers.length ? (tiers[tiers.length - 1].max_monthly_volume ?? 0) + 0.01 : 0,
              max_monthly_volume: null,
              percentage: tiers.length ? tiers[tiers.length - 1].percentage : 3.9,
              fixed_fee: tiers.length ? tiers[tiers.length - 1].fixed_fee : 2.5,
            },
          ])
        }
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add band
      </Button>
    </div>
  );
}

/**
 * Gateway processing schedules: view the active schedule, publish a new version,
 * and see which properties sit on which schedule. Versions are immutable in
 * spirit — "Save as new version" is the intended way to change commercial terms.
 */
export function GatewaySchedulesPanel() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [probe, setProbe] = useState({ amount: "1500", volume: "80000" });

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["gateway-billing-configs"],
    queryFn: async (): Promise<ScheduleRow[]> => {
      const { data, error } = await supabase
        .from("gateway_billing_configs" as never)
        .select("*")
        .order("is_active", { ascending: false })
        .order("name", { ascending: true })
        .order("version", { ascending: false });
      if (error) throw error;
      return (data as unknown as ScheduleRow[]) || [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["gateway-billing-assignments"],
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data } = await supabase
        .from("property_billing_configs")
        .select("property_id, gateway_billing_config_id, properties(name)")
        .not("gateway_billing_config_id", "is", null);
      return (data as unknown as AssignmentRow[]) || [];
    },
  });

  const selected = useMemo(
    () => schedules.find((s) => s.id === selectedId) ?? schedules[0] ?? null,
    [schedules, selectedId],
  );
  const current = draft ?? (selected ? toDraft(selected) : null);

  const assignedFor = (configId: string) => assignments.filter((a) => a.gateway_billing_config_id === configId);

  const preview = useMemo(() => {
    if (!current) return null;
    const amount = num(probe.amount) ?? 0;
    return getEffectiveBillingRate(
      {
        model: current.model,
        base_percentage: num(current.base_percentage),
        fixed_fee_per_txn: num(current.fixed_fee_per_txn),
        monthly_platform_fee: num(current.monthly_platform_fee),
        passthrough_markup_percentage: num(current.passthrough_markup_percentage),
        volume_tiers: current.tiers,
        currency: current.currency,
      },
      amount,
      num(probe.volume),
    );
  }, [current, probe]);

  const safeMargin = preview ? coversAcquirerCost(preview, num(probe.amount) ?? 0) : true;

  const saveVersion = useMutation({
    mutationFn: async ({ asNewVersion }: { asNewVersion: boolean }) => {
      if (!current) throw new Error("Nothing to save");
      const payload = {
        name: current.name.trim() || "Gateway Schedule",
        model: current.model,
        base_percentage: num(current.base_percentage),
        fixed_fee_per_txn: num(current.fixed_fee_per_txn),
        monthly_platform_fee: num(current.monthly_platform_fee),
        passthrough_markup_percentage: num(current.passthrough_markup_percentage),
        volume_tiers: current.tiers,
        currency: current.currency || "ZAR",
        is_active: current.is_active,
      };

      if (!asNewVersion && selected) {
        const { error } = await supabase
          .from("gateway_billing_configs" as never)
          .update(payload as never)
          .eq("id", selected.id);
        if (error) throw error;
        return selected.id;
      }

      const nextVersion =
        Math.max(0, ...schedules.filter((s) => s.name === payload.name).map((s) => Number(s.version) || 0)) + 1;
      const { data, error } = await supabase
        .from("gateway_billing_configs" as never)
        .insert({ ...payload, version: nextVersion, effective_from: new Date().toISOString() } as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as unknown as { id: string }).id;
    },
    onSuccess: async (id, vars) => {
      // Only one schedule can be the active default.
      if (current?.is_active) {
        await supabase
          .from("gateway_billing_configs" as never)
          .update({ is_active: false } as never)
          .neq("id", id);
      }
      setDraft(null);
      setSelectedId(id);
      qc.invalidateQueries({ queryKey: ["gateway-billing-configs"] });
      toast.success(vars.asNewVersion ? "New schedule version published" : "Schedule updated");
    },
    onError: (e: Error) => toast.error(e.message || "Could not save the schedule"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Schedules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {schedules.map((s) => {
            const count = assignedFor(s.id).length;
            const isSel = current && s.id === (selected?.id ?? "");
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  setDraft(null);
                }}
                className={`w-full rounded-md border p-2.5 text-left transition-colors ${
                  isSel ? "border-primary bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{s.name}</span>
                  <Badge variant="outline" className="text-[10px]">v{s.version ?? 1}</Badge>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{GATEWAY_MODEL_LABELS[normalizeGatewayModel(s.model)]}</span>
                  {s.is_active && (
                    <Badge className="text-[10px]">
                      <ShieldCheck className="mr-1 h-3 w-3" /> Active
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Building2 className="h-3 w-3" /> {count} propert{count === 1 ? "y" : "ies"}
                </div>
              </button>
            );
          })}
          {!schedules.length && <p className="text-sm text-muted-foreground">No schedules yet.</p>}
        </CardContent>
      </Card>

      {current ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {current.name || "Schedule"}{" "}
              {selected?.version != null && <span className="text-muted-foreground">v{selected.version}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={current.name} onChange={(e) => setDraft({ ...current, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Model</Label>
                <Select
                  value={current.model}
                  onValueChange={(v) => setDraft({ ...current, model: normalizeGatewayModel(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GATEWAY_BILLING_MODELS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {GATEWAY_MODEL_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Base percentage</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={current.base_percentage}
                  onChange={(e) => setDraft({ ...current, base_percentage: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Fixed fee per transaction</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={current.fixed_fee_per_txn}
                  onChange={(e) => setDraft({ ...current, fixed_fee_per_txn: e.target.value })}
                  disabled={current.model === "flat"}
                />
              </div>
              <div>
                <Label className="text-xs">Monthly platform fee</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={current.monthly_platform_fee}
                  onChange={(e) => setDraft({ ...current, monthly_platform_fee: e.target.value })}
                />
              </div>
              {current.model === "passthrough_plus" && (
                <div>
                  <Label className="text-xs">Markup over acquirer cost (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={current.passthrough_markup_percentage}
                    onChange={(e) => setDraft({ ...current, passthrough_markup_percentage: e.target.value })}
                  />
                </div>
              )}
            </div>

            {(current.model === "hybrid" || current.model === "volume_tiered") && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs">Monthly volume bands</Label>
                  <TierEditor tiers={current.tiers} onChange={(tiers) => setDraft({ ...current, tiers })} />
                  {!!current.tiers.length && (
                    <p className="text-[11px] text-muted-foreground">{summariseVolumeTiers(current.tiers, current.currency)}</p>
                  )}
                </div>
              </>
            )}

            <Separator />
            <div className="space-y-2">
              <Label className="text-xs">Check a transaction</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="number"
                  value={probe.amount}
                  onChange={(e) => setProbe({ ...probe, amount: e.target.value })}
                  placeholder="Transaction amount"
                />
                <Input
                  type="number"
                  value={probe.volume}
                  onChange={(e) => setProbe({ ...probe, volume: e.target.value })}
                  placeholder="Monthly volume"
                />
              </div>
              {preview && (
                <div className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      Charge <strong>{money(preview.amount_charged)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      {preview.percentage}%{preview.fixed_fee ? ` + ${money(preview.fixed_fee)}` : ""} — effective{" "}
                      {preview.effective_rate}%
                    </span>
                  </div>
                  {!safeMargin && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                      <TriangleAlert className="h-3.5 w-3.5" />
                      Below the acquirer cost of {PAYFAST_COST_PERCENTAGE}% + {money(PAYFAST_COST_FIXED_FEE)} on this
                      transaction.
                    </p>
                  )}
                </div>
              )}
            </div>

            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={current.is_active}
                  onCheckedChange={(v) => setDraft({ ...current, is_active: v })}
                  id="gw-active"
                />
                <Label htmlFor="gw-active" className="text-xs">
                  Active default for unassigned properties
                </Label>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saveVersion.isPending || !draft}
                  onClick={() => saveVersion.mutate({ asNewVersion: false })}
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" /> Save in place
                </Button>
                <Button size="sm" disabled={saveVersion.isPending} onClick={() => saveVersion.mutate({ asNewVersion: true })}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Save as new version
                </Button>
              </div>
            </div>

            {!!selected && (
              <div className="space-y-1">
                <Label className="text-xs">Properties on this schedule</Label>
                {assignedFor(selected.id).length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {assignedFor(selected.id).map((a) => (
                      <Badge key={a.property_id} variant="outline" className="text-[10px]">
                        {a.properties?.name || a.property_id}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    No property is pinned to this schedule. Unpinned properties use the active default.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground">No schedule selected.</CardContent>
        </Card>
      )}
    </div>
  );
}
