import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, DollarSign, ArrowLeft, Plus, Trash2, Layers } from "lucide-react";
import { useBillingDefaults, BillingDefault } from "@/hooks/useBillingDefaults";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_TIERS, PricingTier, normalizeTiers, isTierStrategy } from "@/lib/billingTierResolver";

const STRATEGY_LABELS: Record<string, { label: string; description: string }> = {
  default: { label: "Default (Commission)", description: "Standard listing/PMS commission model" },
  widget: { label: "Widget (Tiered)", description: "Volume-based commission tiers for embeds" },
  rolos_pms: { label: "ROL'OS PMS", description: "Monthly subscription + per-booking fee" },
  portfolio_aggregator: { label: "Portfolio Aggregator", description: "Reduced rate for multi-property owners" },
  enterprise_white_label: { label: "Enterprise White-Label", description: "Flat monthly fee, zero commission" },
  volume_tiered: { label: "Volume Tiered", description: "Sliding scale based on unit count" },
  payment_facilitator: { label: "Payment Facilitator", description: "Transaction fee only" },
};

function StrategyCard({ item, onSave, saving }: { item: BillingDefault; onSave: (d: Partial<BillingDefault> & { id: string }) => void; saving: boolean }) {
  const meta = STRATEGY_LABELS[item.strategy] || { label: item.strategy, description: "" };
  const tieredStrategy = isTierStrategy(item.strategy);
  const [commission, setCommission] = useState(item.default_commission_rate?.toString() ?? "");
  const [subscription, setSubscription] = useState(item.default_subscription_fee?.toString() ?? "");
  const [transaction, setTransaction] = useState(item.default_transaction_fee?.toString() ?? "");
  const [whiteLabel, setWhiteLabel] = useState(item.white_label_monthly_fee?.toString() ?? "");
  const [payFac, setPayFac] = useState(item.payment_facilitator_fee?.toString() ?? "");
  const [refFirstYear, setRefFirstYear] = useState(item.referral_first_year_rate?.toString() ?? "");
  const [refResidual, setRefResidual] = useState(item.referral_residual_rate?.toString() ?? "");
  const [refMonths, setRefMonths] = useState(item.referral_residual_months?.toString() ?? "");
  const [refClawback, setRefClawback] = useState(item.referral_clawback_days?.toString() ?? "");
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
      default_commission_rate: commission ? parseFloat(commission) : null,
      default_subscription_fee: subscription ? parseFloat(subscription) : null,
      default_transaction_fee: transaction ? parseFloat(transaction) : null,
      white_label_monthly_fee: whiteLabel ? parseFloat(whiteLabel) : null,
      payment_facilitator_fee: payFac ? parseFloat(payFac) : null,
      referral_first_year_rate: refFirstYear ? parseFloat(refFirstYear) : null,
      referral_residual_rate: refResidual ? parseFloat(refResidual) : null,
      referral_residual_months: refMonths ? parseInt(refMonths) : null,
      referral_clawback_days: refClawback ? parseInt(refClawback) : null,
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
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Commission Rate (%)</Label>
            <Input type="number" step="0.5" min="0" max="100" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="—" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subscription Fee (ZAR/mo)</Label>
            <Input type="number" step="100" min="0" value={subscription} onChange={(e) => setSubscription(e.target.value)} placeholder="—" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Transaction Fee (%)</Label>
            <Input type="number" step="0.1" min="0" max="100" value={transaction} onChange={(e) => setTransaction(e.target.value)} placeholder="—" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">White-Label Fee (ZAR/mo)</Label>
            <Input type="number" step="50" min="0" value={whiteLabel} onChange={(e) => setWhiteLabel(e.target.value)} placeholder="0" className="h-8 text-sm" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Payment Facilitator Fee (%)</Label>
            <Input type="number" step="0.1" min="0" max="100" value={payFac} onChange={(e) => setPayFac(e.target.value)} placeholder="2.5" className="h-8 text-sm" />
          </div>
        </div>
        {tieredStrategy && (
          <div className="border-t pt-3 mt-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                Room-Count Pricing Tiers
              </p>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={addTier}>
                <Plus className="h-3 w-3 mr-1" /> Add tier
              </Button>
            </div>
            <div className="space-y-1.5">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 text-[10px] font-medium text-muted-foreground px-1">
                <span>Min rooms</span>
                <span>Max rooms</span>
                <span>ZAR / mo</span>
                <span />
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
        {/* Referral Commission Defaults */}
        <div className="border-t pt-3 mt-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Referral Commission Defaults</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">First-Year Rate (%)</Label>
              <Input type="number" step="0.5" min="0" max="100" value={refFirstYear} onChange={(e) => setRefFirstYear(e.target.value)} placeholder="20" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Residual Rate (%)</Label>
              <Input type="number" step="0.5" min="0" max="100" value={refResidual} onChange={(e) => setRefResidual(e.target.value)} placeholder="5" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Residual Duration (months)</Label>
              <Input type="number" step="1" min="0" value={refMonths} onChange={(e) => setRefMonths(e.target.value)} placeholder="12" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Clawback Period (days)</Label>
              <Input type="number" step="1" min="0" value={refClawback} onChange={(e) => setRefClawback(e.target.value)} placeholder="90" className="h-8 text-sm" />
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-xs" placeholder="Internal notes about this strategy's defaults..." />
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full">
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Save Defaults
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminBillingDefaults() {
  const navigate = useNavigate();
  const { isDev, isFearlessLeader, loading: authLoading } = useAuth();
  const { defaults, isLoading, update } = useBillingDefaults();

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
            Platform-wide default rates per billing strategy. Per-property overrides take priority.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {defaults.map((item) => (
            <StrategyCard
              key={item.id}
              item={item}
              onSave={(d) => update.mutate(d)}
              saving={update.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
