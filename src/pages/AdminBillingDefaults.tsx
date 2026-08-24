import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, DollarSign, ArrowLeft, Plus, Trash2, Layers, Sparkles, Users, Info, Boxes, Copy, CreditCard } from "lucide-react";
import { GatewaySchedulesPanel } from "@/components/admin/billing/GatewaySchedulesPanel";
import { BillingEstimator } from "@/components/admin/billing/BillingEstimator";

import { useBillingDefaults, BillingDefault, presetLabel } from "@/hooks/useBillingDefaults";
import { useAuth } from "@/hooks/useAuth";
import { normalizeTiers, PricingTier } from "@/lib/billingTierResolver";
import { DEFAULT_FEE_MARGIN_MAP, FEE_MARGIN_LABELS, type FeeMargin } from "@/lib/feeMargin";
import { DEFAULT_FREE_PERIOD_DAYS } from "@/lib/billingSchedule";
import { MonthlyAnnualSetup, MonthlyAnnualSetupValue } from "@/components/admin/billing/MonthlyAnnualSetup";
import { TierCriteriaEditor, RepTierCriteria, DEFAULT_TIER_CRITERIA } from "@/components/admin/billing/TierCriteriaEditor";
import {
  BillingConfigBuilder,
  BillingConfigValue,
  emptyBuilderValue,
  summarizeBuilderValue,
} from "@/components/admin/billing/BillingConfigBuilder";
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

function toStr(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}
function toNum(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// ─── Preset ↔ builder-value bridge ─────────────────────────────────────────
function presetToBuilder(row: BillingDefault): BillingConfigValue {
  const tiers = normalizeTiers((row as any).tier_pricing_json);
  const v = emptyBuilderValue();
  v.commission_enabled = row.default_commission_rate != null && row.default_commission_rate > 0 && row.strategy !== "widget";
  v.commission_rate = toStr(row.default_commission_rate);
  v.pms_commission_rate = toStr((row as any).pms_commission_rate ?? null);

  v.widget_tiers_enabled = row.strategy === "widget" && (row as any).widget_flat_commission_rate == null;
  v.widget_flat_enabled = (row as any).widget_flat_commission_rate != null;
  v.widget_flat_rate = toStr((row as any).widget_flat_commission_rate ?? null);
  v.pms_enabled = (row.default_subscription_fee ?? 0) > 0 || (row.channel_manager_per_unit_fee ?? 0) > 0 || ((row as any).enterprise_custom_fee ?? 0) > 0;
  v.subscription_fee = toStr(row.default_subscription_fee);
  v.channel_per_unit = toStr(row.channel_manager_per_unit_fee);
  v.enterprise_custom_fee = toStr((row as any).enterprise_custom_fee ?? null);
  v.volume_tiers_enabled = tiers.length > 0 && row.strategy !== "widget";
  v.tier_pricing_json = tiers.length ? tiers : null;
  v.facilitator_surcharge_enabled = row.default_transaction_fee != null;
  v.transaction_fee = toStr(row.default_transaction_fee);
  v.byo_gateway_enabled = ((row as any).byo_gateway_monthly_fee ?? 0) > 0;
  v.byo_gateway_fee = toStr((row as any).byo_gateway_monthly_fee ?? null);
  v.white_label_enabled = (row.white_label_monthly_fee ?? 0) > 0 || (row.white_label_setup_fee ?? 0) > 0;
  v.white_label_monthly_fee = toStr(row.white_label_monthly_fee);
  v.white_label_setup_fee = toStr(row.white_label_setup_fee ?? null);
  v.white_label_billing_mode = (row.white_label_billing_mode as "monthly" | "annual") || "monthly";
  v.branding_addon_enabled = !!(row as any).branding_addon_allowed;
  v.branding_addon_monthly_fee = toStr((row as any).branding_addon_monthly_fee ?? null);
  v.branding_addon_setup_fee = toStr((row as any).branding_addon_setup_fee ?? null);
  v.branding_addon_billing_mode = ((row as any).branding_addon_billing_mode as "monthly" | "annual") || "monthly";
  v.pricelabs_enabled = (row.pricelabs_monthly_fee ?? 0) > 0 || ((row as any).pricelabs_setup_fee ?? 0) > 0;
  v.pricelabs_monthly_fee = toStr(row.pricelabs_monthly_fee ?? null);
  v.pricelabs_setup_fee = toStr((row as any).pricelabs_setup_fee ?? null);
  return v;
}

function builderToPatch(v: BillingConfigValue): Partial<BillingDefault> {
  return {
    default_commission_rate: v.commission_enabled ? toNum(v.commission_rate) : null,
    listing_commission_rate: v.commission_enabled ? toNum(v.commission_rate) : null,
    pms_commission_rate: v.commission_enabled ? toNum(v.pms_commission_rate) : null,

    widget_flat_commission_rate: v.widget_flat_enabled ? toNum(v.widget_flat_rate) : null,
    default_subscription_fee: v.pms_enabled ? toNum(v.subscription_fee) : null,
    channel_manager_per_unit_fee: v.pms_enabled ? toNum(v.channel_per_unit) : null,
    enterprise_custom_fee: v.pms_enabled ? toNum(v.enterprise_custom_fee) : null,
    tier_pricing_json: v.volume_tiers_enabled ? (v.tier_pricing_json as any) : null,
    default_transaction_fee: v.facilitator_surcharge_enabled ? (toNum(v.transaction_fee) ?? 0) : null,
    byo_gateway_monthly_fee: v.byo_gateway_enabled ? toNum(v.byo_gateway_fee) : null,
    white_label_monthly_fee: v.white_label_enabled ? toNum(v.white_label_monthly_fee) : null,
    white_label_setup_fee: v.white_label_enabled ? toNum(v.white_label_setup_fee) : null,
    white_label_billing_mode: v.white_label_enabled ? v.white_label_billing_mode : null,
    branding_addon_allowed: v.branding_addon_enabled,
    branding_addon_monthly_fee: v.branding_addon_enabled ? toNum(v.branding_addon_monthly_fee) : null,
    branding_addon_setup_fee: v.branding_addon_enabled ? toNum(v.branding_addon_setup_fee) : null,
    branding_addon_billing_mode: v.branding_addon_enabled ? v.branding_addon_billing_mode : null,
    pricelabs_monthly_fee: v.pricelabs_enabled ? toNum(v.pricelabs_monthly_fee) : null,
    pricelabs_setup_fee: v.pricelabs_enabled ? toNum(v.pricelabs_setup_fee) : null,
  } as any;
}

// ─── Preset library panel (list + builder) ─────────────────────────────────
function PresetsPanel({ defaults }: { defaults: BillingDefault[] }) {
  const { update, create, remove } = useBillingDefaults();
  const [selectedId, setSelectedId] = useState<string | null>(defaults[0]?.id ?? null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [builder, setBuilder] = useState<BillingConfigValue>(emptyBuilderValue());
  const [notes, setNotes] = useState("");
  const [newPresetOpen, setNewPresetOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const selected = useMemo(() => defaults.find((d) => d.id === selectedId) ?? null, [defaults, selectedId]);

  useEffect(() => {
    if (!selectedId && defaults[0]) setSelectedId(defaults[0].id);
  }, [defaults, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setName(presetLabel(selected));
    setDescription(selected.preset_description ?? "");
    setBuilder(presetToBuilder(selected));
    setNotes(selected.notes ?? "");
  }, [selected]);

  const handleSave = () => {
    if (!selected) return;
    update.mutate({
      id: selected.id,
      preset_name: name.trim() || selected.strategy,
      preset_description: description.trim() || null,
      notes: notes || null,
      ...builderToPatch(builder),
    } as any);
  };

  const handleCreate = () => {
    if (!newPresetName.trim()) return;
    create.mutate(
      {
        preset_name: newPresetName.trim(),
        preset_description: null,
        ...builderToPatch(emptyBuilderValue()),
      },
      {
        onSuccess: (row: any) => {
          setNewPresetOpen(false);
          setNewPresetName("");
          setSelectedId(row.id);
        },
      }
    );
  };

  const handleDuplicate = () => {
    if (!selected) return;
    create.mutate(
      {
        preset_name: `${presetLabel(selected)} (copy)`,
        preset_description: selected.preset_description,
        notes: selected.notes,
        ...builderToPatch(builder),
      },
      { onSuccess: (row: any) => setSelectedId(row.id) }
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    remove.mutate(deleteId, {
      onSuccess: () => {
        setDeleteId(null);
        if (deleteId === selectedId) {
          const remaining = defaults.filter((d) => d.id !== deleteId);
          setSelectedId(remaining[0]?.id ?? null);
        }
      },
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
      {/* Preset library */}
      <Card className="h-fit">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Presets</CardTitle>
            <CardDescription className="text-[11px]">Saved billing configurations.</CardDescription>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setNewPresetOpen(true)}>
            <Plus className="h-3 w-3" /> New
          </Button>
        </CardHeader>
        <CardContent className="p-2 space-y-1">
          {defaults.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">No presets yet — create one.</p>
          )}
          {defaults.map((d) => {
            const active = d.id === selectedId;
            return (
              <button
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className={`w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors ${
                  active ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50 border border-transparent"
                }`}
              >
                <div className="font-medium">{presetLabel(d)}</div>
                <div className="text-[10px] text-muted-foreground truncate">{d.preset_description || d.strategy}</div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Builder */}
      <div className="space-y-3">
        {selected ? (
          <>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Preset name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm font-medium" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Short description</Label>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Shown next to the preset in the property Billing tab."
                        className="h-8 text-xs"
                      />
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono">{selected.strategy}</Badge>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="gap-1 h-7" onClick={handleDuplicate}>
                      <Copy className="h-3 w-3" /> Duplicate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 h-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(selected.id)}
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <BillingConfigBuilder value={builder} onChange={setBuilder} scope="preset" />

                <div className="rounded-md bg-muted/30 border border-dashed p-2 text-[11px] text-muted-foreground">
                  <strong className="text-foreground">Summary:</strong> {summarizeBuilderValue(builder)}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Internal notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="text-xs"
                    placeholder="Notes about when to use this preset…"
                  />
                </div>

                <Button onClick={handleSave} disabled={update.isPending} className="w-full">
                  {update.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save preset
                </Button>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-xs text-muted-foreground">
              Select a preset on the left, or create a new one.
            </CardContent>
          </Card>
        )}
      </div>

      {/* New preset dialog */}
      <AlertDialog open={newPresetOpen} onOpenChange={setNewPresetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New billing preset</AlertDialogTitle>
            <AlertDialogDescription>
              Give the preset a name. You can configure its components on the next screen and save when ready.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Preset name</Label>
            <Input
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="e.g. Boutique WBE, Enterprise licence"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNewPresetName("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreate} disabled={!newPresetName.trim() || create.isPending}>
              {create.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Create preset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this preset?</AlertDialogTitle>
            <AlertDialogDescription>
              Properties currently referencing this preset by slug will keep their fields, but the dropdown entry will disappear.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={remove.isPending}>
              {remove.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Delete preset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Add-ons tab (unchanged behaviour, minus the enterprise strategy) ──────
function AddOnsPanel({ row, onSave, saving }: { row: BillingDefault | undefined; onSave: (d: Partial<BillingDefault> & { id: string }) => void; saving: boolean }) {
  if (!row) {
    return <p className="text-xs text-muted-foreground">Add-on defaults live on the primary preset — please save one first.</p>;
  }

  const [branding, setBranding] = useState<MonthlyAnnualSetupValue>({
    enabled: !!row.branding_addon_allowed,
    recurring: toStr(row.branding_addon_monthly_fee ?? null),
    billingMode: (row.branding_addon_billing_mode as "monthly" | "annual") || "monthly",
    setup: toStr(row.branding_addon_setup_fee ?? null),
  });

  const [pricelabsMonthly, setPricelabsMonthly] = useState(toStr(row.pricelabs_monthly_fee ?? null));
  const [pricelabsSetup, setPricelabsSetup] = useState(toStr(row.pricelabs_setup_fee ?? null));
  const [channelPerUnit, setChannelPerUnit] = useState(toStr(row.channel_manager_per_unit_fee ?? null));

  const [aggMode, setAggMode] = useState<"none" | "monthly" | "once_off">(
    ((row as any).portfolio_aggregator_billing_mode as "none" | "monthly" | "once_off") || "none"
  );
  const [aggMonthly, setAggMonthly] = useState(toStr((row as any).portfolio_aggregator_monthly_default ?? null));
  const [aggSetup, setAggSetup] = useState(toStr((row as any).portfolio_aggregator_setup_default ?? null));

  const [freeDays, setFreeDays] = useState(toStr((row as any).free_period_days_default ?? null));
  const [marginMap, setMarginMap] = useState<Record<string, FeeMargin>>({
    ...DEFAULT_FEE_MARGIN_MAP,
    ...(((row as any).fee_margin_map_json as Record<string, FeeMargin> | null) || {}),
  });

  const handleSave = () => {
    onSave({
      id: row.id,
      branding_addon_allowed: branding.enabled,
      branding_addon_monthly_fee: branding.enabled ? toNum(branding.recurring) : null,
      branding_addon_setup_fee: branding.enabled ? toNum(branding.setup) : null,
      branding_addon_billing_mode: branding.enabled ? branding.billingMode : null,
      pricelabs_monthly_fee: toNum(pricelabsMonthly),
      pricelabs_setup_fee: toNum(pricelabsSetup),
      channel_manager_per_unit_fee: toNum(channelPerUnit),
      portfolio_aggregator_billing_mode: aggMode,
      portfolio_aggregator_monthly_default: aggMode === "monthly" ? toNum(aggMonthly) : null,
      portfolio_aggregator_setup_default: aggMode === "once_off" ? toNum(aggSetup) : null,
      free_period_days_default: freeDays === "" ? DEFAULT_FREE_PERIOD_DAYS : toNum(freeDays),
      fee_margin_map_json: marginMap,
    } as any);
  };


  return (
    <div className="space-y-4">
      <MonthlyAnnualSetup
        title="Branding Pack (non-white-label)"
        description="Colour, logo and font overrides on the standard Rooms Online domain — a cheaper alternative to full white-label."
        value={branding}
        onChange={setBranding}
        suggestedRecurring={150}
        suggestedSetup={500}
      />
      <div className="rounded-md border p-3 space-y-2">
        <div>
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            PriceLabs revenue management (platform default)
          </Label>
          <p className="text-[11px] text-muted-foreground">Charged per activated property — no volume scaling. Presets can override this default.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Monthly (ZAR/property)</Label>
            <Input type="number" min="0" step="50" value={pricelabsMonthly} onChange={(e) => setPricelabsMonthly(e.target.value)} placeholder="250" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">One-off setup (ZAR)</Label>
            <Input type="number" min="0" step="50" value={pricelabsSetup} onChange={(e) => setPricelabsSetup(e.target.value)} placeholder="0" className="h-8 text-sm" />
          </div>
        </div>
      </div>
      <div className="rounded-md border p-3 space-y-2">
        <div>
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Boxes className="h-3.5 w-3.5 text-primary" />
            ROL'OS Channel Manager (per unit)
          </Label>
          <p className="text-[11px] text-muted-foreground">Platform default; presets that enable the PMS component may override.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Fee per unit (ZAR/mo)</Label>
            <Input type="number" min="0" step="10" value={channelPerUnit} onChange={(e) => setChannelPerUnit(e.target.value)} placeholder="60" className="h-8 text-sm" />
          </div>
        </div>
      </div>
      <div className="rounded-md border p-3 space-y-2">
        <div>
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Portfolio Aggregator (listing multiple owners together)
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Charged at the <strong>portfolio</strong> level. Member properties keep their own primary preset. Actual mode &amp; fees are set on each portfolio in{" "}
            <Badge variant="outline" className="text-[10px]">/admin/portfolios</Badge>; the values below are the platform-wide defaults.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Default mode</Label>
            <select
              value={aggMode}
              onChange={(e) => setAggMode(e.target.value as any)}
              className="h-8 w-full text-sm rounded-md border border-input bg-background px-2"
            >
              <option value="none">Disabled (no aggregator fee)</option>
              <option value="monthly">Monthly fee</option>
              <option value="once_off">Once-off listing fee</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Monthly default (ZAR/mo)</Label>
            <Input type="number" min="0" step="50" value={aggMonthly} onChange={(e) => setAggMonthly(e.target.value)} placeholder="0" disabled={aggMode !== "monthly"} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Once-off default (ZAR)</Label>
            <Input type="number" min="0" step="50" value={aggSetup} onChange={(e) => setAggSetup(e.target.value)} placeholder="0" disabled={aggMode !== "once_off"} className="h-8 text-sm" />
          </div>
        </div>
      </div>
      <div className="rounded-md border p-3 space-y-3">
        <div>
          <Label className="text-sm font-medium">Subscription lifecycle &amp; fee treatment</Label>
          <p className="text-[11px] text-muted-foreground">
            Monthly billing starts at a property&apos;s engagement date plus the free period below.
            Setup fees are invoiced upfront on contract signature, never bundled into a monthly invoice.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Free period (days)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={freeDays}
              onChange={(e) => setFreeDays(e.target.value)}
              placeholder={String(DEFAULT_FREE_PERIOD_DAYS)}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Fee classification — pass-through fees never earn rep commission
          </Label>
          <div className="grid gap-1 sm:grid-cols-2">
            {Object.keys({ ...DEFAULT_FEE_MARGIN_MAP, ...marginMap }).sort().map((kind) => (
              <div key={kind} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                <span className="text-[11px] font-mono">{kind}</span>
                <select
                  value={marginMap[kind] || "margin"}
                  onChange={(e) => setMarginMap({ ...marginMap, [kind]: e.target.value as FeeMargin })}
                  className="h-7 text-[11px] rounded-md border border-input bg-background px-1"
                >
                  <option value="margin">{FEE_MARGIN_LABELS.margin}</option>
                  <option value="passthrough">{FEE_MARGIN_LABELS.passthrough}</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Save Add-on Defaults
      </Button>
    </div>
  );
}

// ─── Sales reps tab (unchanged) ────────────────────────────────────────────
function SalesRepsPanel({ row, onSave, saving }: { row: BillingDefault | undefined; onSave: (d: Partial<BillingDefault> & { id: string }) => void; saving: boolean }) {
  if (!row) return <p className="text-xs text-muted-foreground">Sales rep defaults live on the primary preset.</p>;

  const [firstYear, setFirstYear] = useState(toStr(row.referral_first_year_rate));
  const [residual, setResidual] = useState(toStr(row.referral_residual_rate));
  const [months, setMonths] = useState(toStr(row.referral_residual_months));
  const [clawback, setClawback] = useState(toStr(row.referral_clawback_days));
  const [criteria, setCriteria] = useState<RepTierCriteria>(() => {
    const existing = row.sales_rep_tier_criteria_json as RepTierCriteria | null | undefined;
    if (existing?.base && existing?.accelerated && existing?.elite) return existing;
    return DEFAULT_TIER_CRITERIA;
  });

  const handleSave = () => {
    onSave({
      id: row.id,
      referral_first_year_rate: toNum(firstYear),
      referral_residual_rate: toNum(residual),
      referral_residual_months: toNum(months),
      referral_clawback_days: toNum(clawback),
      sales_rep_tier_criteria_json: criteria as any,
    } as any);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Baseline Referral Rates</CardTitle>
          <CardDescription className="text-xs">Applied when a rep sits in the Base tier (unless overridden by the tier itself).</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">First-year %</Label>
            <Input type="number" step="0.5" min="0" max="100" value={firstYear} onChange={(e) => setFirstYear(e.target.value)} placeholder="20" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Residual %</Label>
            <Input type="number" step="0.5" min="0" max="100" value={residual} onChange={(e) => setResidual(e.target.value)} placeholder="5" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Residual months</Label>
            <Input type="number" step="1" min="0" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="12" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Clawback days</Label>
            <Input type="number" step="1" min="0" value={clawback} onChange={(e) => setClawback(e.target.value)} placeholder="90" className="h-8 text-sm" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Base / Accelerated / Elite Criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <TierCriteriaEditor value={criteria} onChange={setCriteria} />
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Save Sales Rep Defaults
      </Button>
    </div>
  );
}

// ─── Summary tab ───────────────────────────────────────────────────────────
function SummaryPanel({ defaults, gotoTab }: { defaults: BillingDefault[]; gotoTab: (t: string) => void }) {
  const defaultRow = defaults.find((d) => d.strategy === "default") ?? defaults[0];
  const criteria = (defaultRow?.sales_rep_tier_criteria_json as RepTierCriteria | undefined) ?? DEFAULT_TIER_CRITERIA;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /> Billing presets</CardTitle>
            <CardDescription className="text-xs">One line per saved preset — pick the closest match on a property, then customize.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => gotoTab("presets")}>Manage</Button>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {defaults.length === 0 && <p className="text-xs text-muted-foreground">No presets yet.</p>}
          {defaults.map((d) => (
            <p key={d.id} className="text-xs leading-relaxed">
              <span className="text-muted-foreground">•</span> <strong>{presetLabel(d)}</strong>:{" "}
              {summarizeBuilderValue(presetToBuilder(d))}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Platform add-on defaults</CardTitle>
            <CardDescription className="text-xs">Suggested prices. Toggled per property from the property Admin tab.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => gotoTab("addons")}>Edit</Button>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs">
          <p>• <strong>Branding Pack:</strong> {defaultRow?.branding_addon_allowed ? `R${defaultRow.branding_addon_monthly_fee ?? "—"} / ${defaultRow.branding_addon_billing_mode ?? "monthly"}${defaultRow?.branding_addon_setup_fee ? ` + R${defaultRow.branding_addon_setup_fee} setup` : ""}` : "disabled"}.</p>
          <p>• <strong>PriceLabs:</strong> R{defaultRow?.pricelabs_monthly_fee ?? "—"}/property/mo{defaultRow?.pricelabs_setup_fee ? ` + R${defaultRow.pricelabs_setup_fee} setup` : ""}.</p>
          <p>• <strong>Channel Manager:</strong> R{defaultRow?.channel_manager_per_unit_fee ?? 60}/unit/mo.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Sales rep economics</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => gotoTab("sales-reps")}>Edit</Button>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs">
          <p>• Base tier: {criteria.base.first_year_rate}% year 1, {criteria.base.residual_rate}% residual for {defaultRow?.referral_residual_months ?? "—"} months.</p>
          <p>• Accelerated (≥ {criteria.accelerated.min_props} props / R{criteria.accelerated.min_mrr.toLocaleString()} MRR): {criteria.accelerated.first_year_rate}% / {criteria.accelerated.residual_rate}%.</p>
          <p>• Elite (≥ {criteria.elite.min_props} props / R{criteria.elite.min_mrr.toLocaleString()} MRR): {criteria.elite.first_year_rate}% / {criteria.elite.residual_rate}%.</p>
          <p>• Clawback window: {defaultRow?.referral_clawback_days ?? "—"} days.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function AdminBillingDefaults() {
  const navigate = useNavigate();
  const { isDev, isFearlessLeader, loading: authLoading } = useAuth();
  const { defaults, isLoading, update } = useBillingDefaults();
  const [tab, setTab] = useState("summary");

  const defaultRow = useMemo(() => defaults.find((d) => d.strategy === "default") ?? defaults[0], [defaults]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isDev && !isFearlessLeader) {
    navigate("/admin/dashboard");
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Billing Defaults</h1>
          <p className="text-sm text-muted-foreground">
            Configure named billing <strong>presets</strong> from a single toggle-based builder. Presets appear in the dropdown on every property's Billing tab and seed its fields — each toggle can then be tuned per property.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
        <BillingEstimator defaults={defaults} />

        <Tabs value={tab} onValueChange={setTab} className="w-full">

          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="summary"><Info className="h-3.5 w-3.5 mr-1.5" /> Summary</TabsTrigger>
            <TabsTrigger value="presets"><DollarSign className="h-3.5 w-3.5 mr-1.5" /> Presets</TabsTrigger>
            <TabsTrigger value="addons"><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Add-ons</TabsTrigger>
            <TabsTrigger value="sales-reps"><Users className="h-3.5 w-3.5 mr-1.5" /> Sales Reps</TabsTrigger>
            <TabsTrigger value="gateway"><CreditCard className="h-3.5 w-3.5 mr-1.5" /> Gateway Schedules</TabsTrigger>
          </TabsList>


          <TabsContent value="summary" className="mt-4">
            <SummaryPanel defaults={defaults} gotoTab={setTab} />
          </TabsContent>

          <TabsContent value="presets" className="mt-4">
            <PresetsPanel defaults={defaults} />
          </TabsContent>

          <TabsContent value="addons" className="mt-4 max-w-3xl">
            <AddOnsPanel row={defaultRow} onSave={(d) => update.mutate(d)} saving={update.isPending} />
            <Separator className="my-6" />
            <p className="text-[11px] text-muted-foreground">
              These are the platform's suggested prices. Every add-on is toggled on/off per property from
              <Badge variant="outline" className="mx-1 text-[10px]">/admin/edit property → Admin → Billing</Badge>.
            </p>
          </TabsContent>

          <TabsContent value="sales-reps" className="mt-4 max-w-3xl">
            <SalesRepsPanel row={defaultRow} onSave={(d) => update.mutate(d)} saving={update.isPending} />
          </TabsContent>

          <TabsContent value="gateway" className="mt-4">
            <GatewaySchedulesPanel />
          </TabsContent>
        </Tabs>
        </>


      )}
    </div>
  );
}
