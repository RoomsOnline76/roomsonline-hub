import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Save, ChevronDown, AlertTriangle, ExternalLink, Lock, ShieldCheck, Layers, Plus, Trash2 } from "lucide-react";
import { useBillingConfig, BillingConfig } from "@/hooks/useBillingConfig";
import { useBillingDefaults } from "@/hooks/useBillingDefaults";
import { CommissionTab } from "./CommissionTab";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { isTierStrategy, normalizeTiers, PricingTier, resolvePropertyTier, DEFAULT_TIERS } from "@/lib/billingTierResolver";

const STRATEGY_OPTIONS = [
  { value: "default", label: "Default (Commission-based)", description: "10% listing / 2% PMS" },
  { value: "widget", label: "Widget (Tiered)", description: "Volume-based commission tiers" },
  { value: "rolos_pms", label: "ROL'OS PMS", description: "Monthly subscription + per-booking fee" },
  { value: "portfolio_aggregator", label: "Portfolio Aggregator", description: "Reduced rate for multi-property" },
  { value: "enterprise_white_label", label: "Enterprise White-Label", description: "Flat fee, zero commission" },
  { value: "volume_tiered", label: "Volume Tiered", description: "Rate based on unit count" },
  { value: "payment_facilitator", label: "Payment Facilitator", description: "Transaction fee only" },
];

interface BillingConfigTabProps {
  propertyId: string;
  onSwitchTab?: (tab: string) => void;
}

function GlobalHint({ value, label }: { value: number | null | undefined; label: string }) {
  if (value == null) return null;
  return (
    <p className="text-[10px] text-muted-foreground">
      Global default: {value}{label}
    </p>
  );
}

export function BillingConfigTab({ propertyId, onSwitchTab }: BillingConfigTabProps) {
  const { config, isLoading, upsert } = useBillingConfig(propertyId);
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "dev" || profile?.role === "fearless_leader";
  const [commissionOpen, setCommissionOpen] = useState(false);
  const { getDefaultsForStrategy } = useBillingDefaults();

  const { data: propertyFlag } = useQuery({
    queryKey: ["property-allow-custom-payment", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("allow_custom_payment_provider")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data as { allow_custom_payment_provider?: boolean } | null;
    },
    enabled: !!propertyId,
  });
  const customProviderEnabled = !!propertyFlag?.allow_custom_payment_provider;
  const facilitatorActive = !customProviderEnabled;

  const [strategy, setStrategy] = useState("default");
  const [commissionRate, setCommissionRate] = useState("");
  const [subscriptionFee, setSubscriptionFee] = useState("");
  const [transactionFee, setTransactionFee] = useState("");
  const [paymentFacilitator, setPaymentFacilitator] = useState(false);
  const [whiteLabel, setWhiteLabel] = useState(false);
  const [whiteLabelFee, setWhiteLabelFee] = useState("");
  const [volumeTiers, setVolumeTiers] = useState("");
  const [billingStartDate, setBillingStartDate] = useState("");
  const [tierScope, setTierScope] = useState<"portfolio" | "property">("portfolio");
  const [roomCountOverride, setRoomCountOverride] = useState("");
  const [tierPricing, setTierPricing] = useState<PricingTier[] | null>(null);

  useEffect(() => {
    if (config) {
      setStrategy(config.billing_strategy || "default");
      setCommissionRate(config.commission_rate?.toString() || "");
      setSubscriptionFee(config.subscription_fee_monthly?.toString() || "");
      setTransactionFee(config.transaction_fee_percentage?.toString() || "");
      setPaymentFacilitator(config.payment_facilitator_enabled || false);
      setWhiteLabel(config.white_label_allowed || false);
      setWhiteLabelFee((config as any).white_label_monthly_fee?.toString() || "");
      setVolumeTiers(config.volume_tier_json ? JSON.stringify(config.volume_tier_json, null, 2) : "");
      setBillingStartDate(config.billing_start_date || "");
      setTierScope(((config as any).tier_scope as "portfolio" | "property") || "portfolio");
      setRoomCountOverride((config as any).room_count_override?.toString() || "");
      const overrideTiers = normalizeTiers((config as any).tier_pricing_json);
      setTierPricing(overrideTiers.length ? overrideTiers : null);
    }
  }, [config]);

  const globalDefaults = getDefaultsForStrategy(strategy);
  const tieredStrategy = isTierStrategy(strategy);

  const { data: resolved, refetch: refetchResolved } = useQuery({
    queryKey: ["resolved-tier", propertyId, strategy, tierScope, roomCountOverride, tierPricing],
    queryFn: () => resolvePropertyTier(propertyId),
    enabled: !!propertyId && tieredStrategy,
  });

  const handleSave = () => {
    let volumeTierJson = null;
    if (volumeTiers.trim()) {
      try {
        volumeTierJson = JSON.parse(volumeTiers);
      } catch {
        return;
      }
    }

    upsert.mutate({
      property_id: propertyId,
      billing_strategy: strategy as BillingConfig["billing_strategy"],
      commission_rate: commissionRate ? parseFloat(commissionRate) : null,
      subscription_fee_monthly: subscriptionFee ? parseFloat(subscriptionFee) : null,
      transaction_fee_percentage: transactionFee ? parseFloat(transactionFee) : null,
      payment_facilitator_enabled: facilitatorActive,
      white_label_allowed: whiteLabel,
      white_label_monthly_fee: whiteLabelFee ? parseFloat(whiteLabelFee) : null,
      volume_tier_json: volumeTierJson,
      billing_start_date: billingStartDate || null,
    } as any);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showCommission = ["default", "widget", "rolos_pms", "portfolio_aggregator", "volume_tiered"].includes(strategy);
  const showSubscription = ["rolos_pms", "enterprise_white_label"].includes(strategy);
  const showTransactionFee = ["payment_facilitator"].includes(strategy);
  const showVolumeTiers = strategy === "volume_tiered";

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Billing Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Strategy Selection */}
        <div className="space-y-2">
          <Label>Billing Strategy</Label>
          <Select value={strategy} onValueChange={setStrategy}>
            <SelectTrigger className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRATEGY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div>
                    <span>{opt.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">— {opt.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Commission Rate */}
        {showCommission && (
          <div className="space-y-1">
            <Label>Commission Rate (%)</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              placeholder={globalDefaults?.default_commission_rate?.toString() ?? (strategy === "default" ? "10" : "5")}
              className="text-xs"
            />
            <GlobalHint value={globalDefaults?.default_commission_rate} label="%" />
          </div>
        )}

        {/* Subscription Fee */}
        {showSubscription && (
          <div className="space-y-1">
            <Label>Monthly Subscription Fee (ZAR)</Label>
            <Input
              type="number"
              step="100"
              min="0"
              value={subscriptionFee}
              onChange={(e) => setSubscriptionFee(e.target.value)}
              placeholder={globalDefaults?.default_subscription_fee?.toString() ?? "0"}
              className="text-xs"
            />
            <GlobalHint value={globalDefaults?.default_subscription_fee} label=" ZAR" />
          </div>
        )}

        {/* Transaction Fee */}
        {showTransactionFee && (
          <div className="space-y-1">
            <Label>Transaction Fee (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={transactionFee}
              onChange={(e) => setTransactionFee(e.target.value)}
              placeholder={globalDefaults?.default_transaction_fee?.toString() ?? "2.5"}
              className="text-xs"
            />
            <GlobalHint value={globalDefaults?.default_transaction_fee} label="%" />
          </div>
        )}

        {/* Volume Tiers */}
        {showVolumeTiers && (
          <div className="space-y-2">
            <Label>Volume Tiers (JSON)</Label>
            <Textarea
              value={volumeTiers}
              onChange={(e) => setVolumeTiers(e.target.value)}
              placeholder='{"0-50": 8, "51-200": 5, "201+": 2}'
              rows={4}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Keys are unit ranges, values are commission rates
            </p>
          </div>
        )}

        {/* Payment Facilitator status (linked to Payment Providers tab) */}
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Payment Facilitator</Label>
                {facilitatorActive ? (
                  <Badge className="gap-1 h-5 text-[10px]"><ShieldCheck className="h-3 w-3" />ON (default)</Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 h-5 text-[10px]"><Lock className="h-3 w-3" />OFF — custom provider</Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {facilitatorActive
                  ? "Rooms Online processes guest payments via PayFast and charges a transaction fee."
                  : "This property uses its own payment provider — no facilitator fee applies."}
              </p>
            </div>
            {onSwitchTab && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => onSwitchTab("payment-providers")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Manage in Payment Providers
              </Button>
            )}
          </div>
        </div>

        {/* White-label toggle */}
        <div className="flex items-center gap-2">
          <Switch checked={whiteLabel} onCheckedChange={setWhiteLabel} />
          <Label className="text-xs cursor-pointer">White-label Allowed</Label>
        </div>

        {/* White-label Fee + charge warning */}
        {whiteLabel && (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label>White-Label Monthly Fee (ZAR)</Label>
              <Input
                type="number"
                step="50"
                min="0"
                value={whiteLabelFee}
                onChange={(e) => setWhiteLabelFee(e.target.value)}
                placeholder={globalDefaults?.white_label_monthly_fee?.toString() ?? "0"}
                className="text-xs"
              />
              <GlobalHint value={globalDefaults?.white_label_monthly_fee} label=" ZAR" />
            </div>
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                This property will be charged <strong>R{whiteLabelFee || globalDefaults?.white_label_monthly_fee || 0}/month</strong> for white-label branding. Branding override will also be enabled.
              </p>
            </div>
          </div>
        )}

        {/* Payment Facilitator charge warning */}
        {facilitatorActive && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              This property will be charged <strong>{transactionFee || globalDefaults?.payment_facilitator_fee || globalDefaults?.default_transaction_fee || 2.5}%</strong> per transaction as payment facilitator fee.
            </p>
          </div>
        )}

        {/* Billing Start Date */}
        <div className="space-y-2">
          <Label>Billing Start Date</Label>
          <Input
            type="date"
            value={billingStartDate}
            onChange={(e) => setBillingStartDate(e.target.value)}
            className="text-xs"
          />
        </div>

        <Button onClick={handleSave} disabled={upsert.isPending} className="w-full">
          {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Billing Config
        </Button>
      </CardContent>
    </Card>

    {/* Commission Section (collapsed by default) */}
    <Collapsible open={commissionOpen} onOpenChange={setCommissionOpen} className="mt-4">
      <Card>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between cursor-pointer">
            <CardTitle className="text-sm font-medium">Commission Configuration</CardTitle>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${commissionOpen ? "rotate-180" : ""}`} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <CommissionTab propertyId={propertyId} isAdmin={isAdmin} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
    </>
  );
}
