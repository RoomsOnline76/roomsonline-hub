import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, DollarSign, ArrowLeft, Plus, Trash2, Layers, Sparkles, Users, Info, Boxes } from "lucide-react";
import { useBillingDefaults, BillingDefault } from "@/hooks/useBillingDefaults";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_TIERS, PricingTier, normalizeTiers, isTierStrategy } from "@/lib/billingTierResolver";
import { FieldToggleRow } from "@/components/admin/billing/FieldToggleRow";
import { MonthlyAnnualSetup, MonthlyAnnualSetupValue } from "@/components/admin/billing/MonthlyAnnualSetup";
import { TierCriteriaEditor, RepTierCriteria, DEFAULT_TIER_CRITERIA } from "@/components/admin/billing/TierCriteriaEditor";
import { WidgetTierEditor } from "@/components/admin/billing/WidgetTierEditor";
import { summarizeStrategy } from "@/components/admin/billing/StrategySummaryLine";

const STRATEGY_LABELS: Record<string, { label: string; description: string }> = {
  default: { label: "Default (Commission)", description: "Property is listed on ROL and paid via ROL's payment facilitator. ROL earns a % commission per booking; owner pays no monthly fee." },
  widget: { label: "Widget — Tiered Commission", description: "Bookings taken through the ROL booking widget. Commission % steps down as monthly booking volume grows. No subscription." },
  rolos_pms: { label: "ROL'OS PMS — Subscription", description: "Full PMS + channel manager. Monthly base fee + R60 per active unit. Reduced 2% booking commission. Optional PriceLabs & white-label add-ons." },
  enterprise_white_label: { label: "Enterprise White-Label", description: "Fully branded, own-domain deployment. Flat monthly licence + once-off setup. Zero booking commission — owner keeps 100% of revenue." },
  volume_tiered: { label: "Volume Tiered (Per Unit)", description: "Pure per-unit monthly fee that slides with total active units. No booking commission, no transaction %." },
  payment_facilitator: { label: "Payment Facilitator Only", description: "No listing or PMS fees. Owner uses ROL only as a payment facilitator; ROL earns the per-booking surcharge %." },
};
const HIDDEN_STRATEGIES = new Set(["portfolio_aggregator"]);


function toStr(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}
function toNum(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// ─── Strategy card ──────────────────────────────────────────────────────────
function StrategyCard({ item, onSave, saving }: { item: BillingDefault; onSave: (d: Partial<BillingDefault> & { id: string }) => void; saving: boolean }) {
  const meta = STRATEGY_LABELS[item.strategy] || { label: item.strategy, description: "" };
  const tieredStrategy = isTierStrategy(item.strategy);
  const isRolos = item.strategy === "rolos_pms";

  const [commission, setCommission] = useState(toStr(item.default_commission_rate));
  const [subscription, setSubscription] = useState(toStr(item.default_subscription_fee));
  const [transaction, setTransaction] = useState(toStr(item.default_transaction_fee));
  const [payFac, setPayFac] = useState(toStr(item.payment_facilitator_fee));
  const [byoGateway, setByoGateway] = useState(toStr((item as any).byo_gateway_monthly_fee ?? null));
  const [channelPerUnit, setChannelPerUnit] = useState(toStr(item.channel_manager_per_unit_fee ?? null));
  const [notes, setNotes] = useState(item.notes ?? "");
  const [tiers, setTiers] = useState<PricingTier[]>(() => {
    const existing = normalizeTiers((item as any).tier_pricing_json);
    return existing.length ? existing : tieredStrategy ? DEFAULT_TIERS : [];
  });

  const updateTier = (idx: number, patch: Partial<PricingTier>) => {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };
  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const nextMin = last ? (last.max_rooms ?? last.min_rooms) + 1 : 0;
    setTiers((prev) => [...prev, { min_rooms: nextMin, max_rooms: null, monthly_fee: 0 }]);
  };
  const removeTier = (idx: number) => setTiers((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = () => {
    onSave({
      id: item.id,
      default_commission_rate: toNum(commission),
      default_subscription_fee: toNum(subscription),
      default_transaction_fee: toNum(transaction),
      payment_facilitator_fee: toNum(payFac),
      channel_manager_per_unit_fee: isRolos ? toNum(channelPerUnit) : item.channel_manager_per_unit_fee ?? null,
      notes: notes || null,
      ...(tieredStrategy ? { tier_pricing_json: tiers as any } : {}),
    } as any);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          {meta.label}
        </CardTitle>
        <CardDescription className="text-xs">{meta.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <FieldToggleRow
          label="Commission rate (% of booking)" unit="%" step="0.5" max="100"
          value={commission} onChange={setCommission}
          suggested={item.strategy === "default" ? 10 : 5}
        />
        <FieldToggleRow
          label="Monthly subscription" unit="ZAR/mo" step="100"
          value={subscription} onChange={setSubscription}
          suggested={item.strategy === "rolos_pms" ? 450 : null}
        />
        <FieldToggleRow
          label="Default transaction fee (facilitator fallback %)" unit="%" step="0.1" max="100"
          value={transaction} onChange={setTransaction}
          suggested={2.5}
        />
        <FieldToggleRow
          label="Payment facilitator fee (contract display %)" unit="%" step="0.1" max="100"
          value={payFac} onChange={setPayFac}
          suggested={2.5}
        />
        {isRolos && (
          <FieldToggleRow
            label="Channel manager per unit"
            unit="ZAR/unit/mo"
            step="10"
            value={channelPerUnit}
            onChange={setChannelPerUnit}
            suggested={60}
            hint="Billed monthly per active room/unit when a ROL'OS PMS property has channel manager enabled."
          />
        )}
        {item.strategy === "widget" && <WidgetTierEditor />}
        {tieredStrategy && (
          <div className="border-t pt-3 mt-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                Room-count pricing tiers
              </p>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={addTier}>
                <Plus className="h-3 w-3 mr-1" /> Add tier
              </Button>
            </div>
            <div className="space-y-1.5">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 text-[10px] font-medium text-muted-foreground px-1">
                <span>Min rooms</span><span>Max rooms</span><span>ZAR / mo</span><span />
              </div>
              {tiers.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-center">
                  <Input type="number" min="0" value={t.min_rooms} onChange={(e) => updateTier(i, { min_rooms: parseInt(e.target.value) || 0 })} className="h-7 text-xs" />
                  <Input type="number" min="0" value={t.max_rooms ?? ""} placeholder="∞" onChange={(e) => updateTier(i, { max_rooms: e.target.value === "" ? null : parseInt(e.target.value) })} className="h-7 text-xs" />
                  <Input type="number" min="0" step="50" value={t.monthly_fee} onChange={(e) => updateTier(i, { monthly_fee: parseFloat(e.target.value) || 0 })} className="h-7 text-xs" />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeTier(i)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {tiers.length === 0 && (
                <p className="text-[10px] text-muted-foreground italic px-1">No tiers configured — falls back to flat subscription fee.</p>
              )}
            </div>
          </div>
        )}
        <div className="space-y-1 pt-2">
          <Label className="text-xs">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-xs" placeholder="Internal notes about this strategy's defaults…" />
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full mt-2">
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Save defaults
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Add-ons tab ────────────────────────────────────────────────────────────
function AddOnsPanel({ row, onSave, saving }: { row: BillingDefault | undefined; onSave: (d: Partial<BillingDefault> & { id: string }) => void; saving: boolean }) {
  if (!row) {
    return <p className="text-xs text-muted-foreground">Add-on defaults live on the <strong>default</strong> strategy row — please save it once first.</p>;
  }

  const [whiteLabel, setWhiteLabel] = useState<MonthlyAnnualSetupValue>({
    enabled: (row.white_label_monthly_fee ?? 0) > 0 || (row.white_label_setup_fee ?? 0) > 0,
    recurring: toStr(row.white_label_monthly_fee),
    billingMode: (row.white_label_billing_mode as "monthly" | "annual") || "monthly",
    setup: toStr(row.white_label_setup_fee ?? null),
  });

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

  const handleSave = () => {
    onSave({
      id: row.id,
      white_label_monthly_fee: whiteLabel.enabled ? toNum(whiteLabel.recurring) : null,
      white_label_setup_fee: whiteLabel.enabled ? toNum(whiteLabel.setup) : null,
      white_label_billing_mode: whiteLabel.enabled ? whiteLabel.billingMode : null,
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
    } as any);
  };

  return (
    <div className="space-y-4">
      <MonthlyAnnualSetup
        title="White-Label Domain & Branding"
        description="Custom booking subdomain, full brand override on booking, embeds & emails."
        value={whiteLabel}
        onChange={setWhiteLabel}
        suggestedRecurring={450}
        suggestedSetup={1500}
      />
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
            PriceLabs revenue management
          </Label>
          <p className="text-[11px] text-muted-foreground">Dynamic pricing suggestions surfaced in ROL'OS.</p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 italic mt-1">
            Charged per activated property regardless of how many properties an owner or portfolio has — no volume scaling.
          </p>
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
          <p className="text-[11px] text-muted-foreground">
            Billed monthly per active room/unit for properties on the ROL'OS PMS strategy with the channel manager enabled.
          </p>
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
            Charged at the <strong>portfolio</strong> level (not per property). Member properties keep their own primary billing strategy.
            Actual mode &amp; fees are set on each portfolio in <Badge variant="outline" className="text-[10px]">/admin/portfolios</Badge>; the values below are the platform-wide defaults.
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
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Save Add-on Defaults
      </Button>
    </div>
  );
}

// ─── Sales reps tab ─────────────────────────────────────────────────────────
function SalesRepsPanel({ row, onSave, saving }: { row: BillingDefault | undefined; onSave: (d: Partial<BillingDefault> & { id: string }) => void; saving: boolean }) {
  if (!row) return <p className="text-xs text-muted-foreground">Sales rep defaults live on the <strong>default</strong> strategy row.</p>;

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

// ─── Summary tab ────────────────────────────────────────────────────────────
function SummaryPanel({ defaults, gotoTab }: { defaults: BillingDefault[]; gotoTab: (t: string) => void }) {
  const defaultRow = defaults.find((d) => d.strategy === "default");
  const rolos = defaults.find((d) => d.strategy === "rolos_pms");
  const criteria = (defaultRow?.sales_rep_tier_criteria_json as RepTierCriteria | undefined) ?? DEFAULT_TIER_CRITERIA;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /> How we make money</CardTitle>
            <CardDescription className="text-xs">One line per billing strategy.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => gotoTab("strategies")}>Edit</Button>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {defaults.map((d) => (
            <p key={d.id} className="text-xs leading-relaxed"><span className="text-muted-foreground">•</span> {summarizeStrategy(d)}</p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Platform add-ons</CardTitle>
            <CardDescription className="text-xs">Toggled per property from the property Admin tab.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => gotoTab("addons")}>Edit</Button>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs">
          <p>• <strong>White-Label:</strong> R{defaultRow?.white_label_monthly_fee ?? "—"} / {defaultRow?.white_label_billing_mode ?? "monthly"}{defaultRow?.white_label_setup_fee ? ` + R${defaultRow.white_label_setup_fee} setup` : ""}.</p>
          <p>• <strong>Branding Pack:</strong> {defaultRow?.branding_addon_allowed ? `R${defaultRow.branding_addon_monthly_fee ?? "—"} / ${defaultRow.branding_addon_billing_mode ?? "monthly"}${defaultRow?.branding_addon_setup_fee ? ` + R${defaultRow.branding_addon_setup_fee} setup` : ""}` : "disabled"}.</p>
          <p>• <strong>PriceLabs:</strong> R{defaultRow?.pricelabs_monthly_fee ?? "—"}/property/mo{defaultRow?.pricelabs_setup_fee ? ` + R${defaultRow.pricelabs_setup_fee} setup` : ""} — flat, per activated property.</p>
          <p>• <strong>Channel Manager:</strong> R{rolos?.channel_manager_per_unit_fee ?? defaultRow?.channel_manager_per_unit_fee ?? 60}/unit/mo (ROL'OS PMS).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2"><Boxes className="h-4 w-4 text-primary" /> ROL'OS PMS</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => gotoTab("strategies")}>Edit</Button>
        </CardHeader>
        <CardContent className="text-xs space-y-1">
          <p>• Subscription: R{rolos?.default_subscription_fee ?? "—"} / month.</p>
          <p>• Channel manager: R{rolos?.channel_manager_per_unit_fee ?? 60} per active unit / month.</p>
          {rolos?.default_commission_rate != null && <p>• Booking commission: {rolos.default_commission_rate}%.</p>}
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

// ─── Page ───────────────────────────────────────────────────────────────────
export default function AdminBillingDefaults() {
  const navigate = useNavigate();
  const { isDev, isFearlessLeader, loading: authLoading } = useAuth();
  const { defaults, isLoading, update } = useBillingDefaults();
  const [tab, setTab] = useState("summary");

  const defaultRow = useMemo(() => defaults.find((d) => d.strategy === "default"), [defaults]);

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
            Platform-wide fee defaults. Zero-value fields collapse into a toggle — enable one to set a default. Per-property overrides always win.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="summary"><Info className="h-3.5 w-3.5 mr-1.5" /> Summary</TabsTrigger>
            <TabsTrigger value="strategies"><DollarSign className="h-3.5 w-3.5 mr-1.5" /> Strategies</TabsTrigger>
            <TabsTrigger value="addons"><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Add-ons</TabsTrigger>
            <TabsTrigger value="sales-reps"><Users className="h-3.5 w-3.5 mr-1.5" /> Sales Reps</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-4">
            <SummaryPanel defaults={defaults} gotoTab={setTab} />
          </TabsContent>

          <TabsContent value="strategies" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {defaults.filter((d) => !HIDDEN_STRATEGIES.has(d.strategy)).map((item) => (
                <StrategyCard key={item.id} item={item} onSave={(d) => update.mutate(d)} saving={update.isPending} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="addons" className="mt-4 max-w-3xl">
            <AddOnsPanel row={defaultRow} onSave={(d) => update.mutate(d)} saving={update.isPending} />
            <Separator className="my-6" />
            <p className="text-[11px] text-muted-foreground">
              These are the platform's suggested prices. Every add-on is toggled on/off per property from
              <Badge variant="outline" className="mx-1 text-[10px]">/admin/edit property → Admin → Billing</Badge>
              which mirrors this configuration into the property's ROL'OS view.
            </p>
          </TabsContent>

          <TabsContent value="sales-reps" className="mt-4 max-w-3xl">
            <SalesRepsPanel row={defaultRow} onSave={(d) => update.mutate(d)} saving={update.isPending} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
