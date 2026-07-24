import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Save, ChevronDown, ExternalLink, Lock, ShieldCheck, Layers, Building2 } from "lucide-react";
import { useBillingConfig, BillingConfig } from "@/hooks/useBillingConfig";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { useBillingDefaults, BillingDefault, presetLabel } from "@/hooks/useBillingDefaults";
import { CommissionTab } from "./CommissionTab";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { normalizeTiers, PricingTier } from "@/lib/billingTierResolver";
import {
  BillingConfigBuilder,
  BillingConfigValue,
  emptyBuilderValue,
  summarizeBuilderValue,
} from "@/components/admin/billing/BillingConfigBuilder";
import { PriceLabsAdminPushCard } from "./PriceLabsAdminPushCard";

interface BillingConfigTabProps {
  propertyId: string;
  onSwitchTab?: (tab: string) => void;
}

// ─── Bridge preset row → builder value ─────────────────────────────────────
function presetToBuilder(row: BillingDefault): BillingConfigValue {
  const tiers = normalizeTiers((row as any).tier_pricing_json);
  const v = emptyBuilderValue();
  v.commission_enabled = row.default_commission_rate != null && row.default_commission_rate > 0 && row.strategy !== "widget";
  v.commission_rate = row.default_commission_rate != null ? String(row.default_commission_rate) : "";
  v.widget_tiers_enabled = row.strategy === "widget" && (row as any).widget_flat_commission_rate == null;
  v.widget_flat_enabled = (row as any).widget_flat_commission_rate != null;
  v.widget_flat_rate = (row as any).widget_flat_commission_rate != null ? String((row as any).widget_flat_commission_rate) : "";
  v.pms_enabled = (row.default_subscription_fee ?? 0) > 0 || (row.channel_manager_per_unit_fee ?? 0) > 0;
  v.subscription_fee = row.default_subscription_fee != null ? String(row.default_subscription_fee) : "";
  v.channel_per_unit = row.channel_manager_per_unit_fee != null ? String(row.channel_manager_per_unit_fee) : "";
  v.enterprise_custom_fee = (row as any).enterprise_custom_fee != null ? String((row as any).enterprise_custom_fee) : "";
  v.volume_tiers_enabled = tiers.length > 0 && row.strategy !== "widget";
  v.tier_pricing_json = tiers.length ? tiers : null;
  v.facilitator_surcharge_enabled = (row.default_transaction_fee ?? 0) > 0;
  v.transaction_fee = row.default_transaction_fee != null ? String(row.default_transaction_fee) : "";
  v.byo_gateway_enabled = ((row as any).byo_gateway_monthly_fee ?? 0) > 0;
  v.byo_gateway_fee = (row as any).byo_gateway_monthly_fee != null ? String((row as any).byo_gateway_monthly_fee) : "";
  v.white_label_enabled = (row.white_label_monthly_fee ?? 0) > 0 || (row.white_label_setup_fee ?? 0) > 0;
  v.white_label_monthly_fee = row.white_label_monthly_fee != null ? String(row.white_label_monthly_fee) : "";
  v.white_label_setup_fee = row.white_label_setup_fee != null ? String(row.white_label_setup_fee) : "";
  v.white_label_billing_mode = (row.white_label_billing_mode as "monthly" | "annual") || "monthly";
  v.pricelabs_enabled = (row.pricelabs_monthly_fee ?? 0) > 0;
  v.pricelabs_monthly_fee = row.pricelabs_monthly_fee != null ? String(row.pricelabs_monthly_fee) : "";
  return v;
}

function configToBuilder(config: BillingConfig | null): BillingConfigValue {
  if (!config) return emptyBuilderValue();
  const tiers = normalizeTiers((config as any).tier_pricing_json);
  const isWidget = config.billing_strategy === "widget";
  const v = emptyBuilderValue();
  v.commission_enabled = config.commission_rate != null && !isWidget;
  v.commission_rate = config.commission_rate != null ? String(config.commission_rate) : "";
  v.widget_tiers_enabled = isWidget && (config as any).widget_flat_commission_rate == null;
  v.widget_flat_enabled = (config as any).widget_flat_commission_rate != null;
  v.widget_flat_rate = (config as any).widget_flat_commission_rate != null ? String((config as any).widget_flat_commission_rate) : "";
  v.pms_enabled = (config.subscription_fee_monthly ?? 0) > 0 || (config.channel_manager_per_unit_fee ?? 0) > 0 || !!config.channel_manager_enabled;
  v.subscription_fee = config.subscription_fee_monthly != null ? String(config.subscription_fee_monthly) : "";
  v.channel_per_unit = config.channel_manager_per_unit_fee != null ? String(config.channel_manager_per_unit_fee) : "";
  v.enterprise_custom_fee = (config as any).enterprise_custom_fee != null ? String((config as any).enterprise_custom_fee) : "";
  v.volume_tiers_enabled = tiers.length > 0 && !isWidget;
  v.tier_pricing_json = tiers.length ? tiers : null;
  v.facilitator_surcharge_enabled = (config.transaction_fee_percentage ?? 0) > 0 && !!config.payment_facilitator_enabled;
  v.transaction_fee = config.transaction_fee_percentage != null ? String(config.transaction_fee_percentage) : "";
  v.byo_gateway_enabled = ((config as any).byo_gateway_monthly_fee ?? 0) > 0;
  v.byo_gateway_fee = (config as any).byo_gateway_monthly_fee != null ? String((config as any).byo_gateway_monthly_fee) : "";
  v.white_label_enabled = !!config.white_label_allowed;
  v.white_label_monthly_fee = config.white_label_monthly_fee != null ? String(config.white_label_monthly_fee) : "";
  v.white_label_setup_fee = config.white_label_setup_fee != null ? String(config.white_label_setup_fee) : "";
  v.white_label_billing_mode = (config.white_label_billing_mode as "monthly" | "annual") || "monthly";
  v.pricelabs_enabled = !!config.pricelabs_allowed;
  v.pricelabs_monthly_fee = config.pricelabs_monthly_fee != null ? String(config.pricelabs_monthly_fee) : "";
  return v;
}

function toNum(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function BillingConfigTab({ propertyId, onSwitchTab }: BillingConfigTabProps) {
  const { config, isLoading, upsert, scope } = useBillingConfig(propertyId);
  const isPortfolioScope = scope.source === "portfolio";
  const { defaults, getDefaultsForStrategy } = useBillingDefaults();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "dev" || profile?.role === "fearless_leader";
  const [commissionOpen, setCommissionOpen] = useState(false);

  const { data: propertyFlag } = useQuery({
    queryKey: ["property-allow-custom-payment", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("allow_custom_payment_provider, is_rol_property")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data as { allow_custom_payment_provider?: boolean; is_rol_property?: boolean | null } | null;
    },
    enabled: !!propertyId,
  });
  const customProviderEnabled = !!propertyFlag?.allow_custom_payment_provider;
  const isRolosPms = !!propertyFlag?.is_rol_property;

  const [strategy, setStrategy] = useState<string>("default");
  const [builder, setBuilder] = useState<BillingConfigValue>(emptyBuilderValue());
  const [billingStartDate, setBillingStartDate] = useState("");
  const [presetJustApplied, setPresetJustApplied] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setStrategy(config.billing_strategy || "default");
      setBuilder(configToBuilder(config));
      setBillingStartDate(config.billing_start_date || "");
    }
  }, [config]);

  const selectedPreset = useMemo(() => getDefaultsForStrategy(strategy), [strategy, defaults]);
  const placeholders = useMemo(() => {
    if (!selectedPreset) return {};
    return {
      commission_rate: selectedPreset.default_commission_rate ?? undefined,
      subscription_fee: selectedPreset.default_subscription_fee ?? undefined,
      channel_per_unit: selectedPreset.channel_manager_per_unit_fee ?? undefined,
      transaction_fee: selectedPreset.default_transaction_fee ?? undefined,
      byo_gateway_fee: (selectedPreset as any).byo_gateway_monthly_fee ?? undefined,
      white_label_monthly_fee: selectedPreset.white_label_monthly_fee ?? undefined,
      white_label_setup_fee: selectedPreset.white_label_setup_fee ?? undefined,
      pricelabs_monthly_fee: selectedPreset.pricelabs_monthly_fee ?? undefined,
    } as any;
  }, [selectedPreset]);

  const persistBuilder = (nextStrategy: string, v: BillingConfigValue, startDate: string) => {
    upsert.mutate({
      property_id: propertyId,
      billing_strategy: nextStrategy as BillingConfig["billing_strategy"],
      commission_rate: v.commission_enabled ? toNum(v.commission_rate) : null,
      widget_flat_commission_rate: v.widget_flat_enabled ? toNum(v.widget_flat_rate) : null,
      subscription_fee_monthly: v.pms_enabled ? toNum(v.subscription_fee) : null,
      channel_manager_enabled: v.pms_enabled,
      channel_manager_per_unit_fee: v.pms_enabled ? toNum(v.channel_per_unit) : null,
      enterprise_custom_fee: v.pms_enabled ? toNum(v.enterprise_custom_fee) : null,
      transaction_fee_percentage: v.facilitator_surcharge_enabled ? toNum(v.transaction_fee) : null,
      payment_facilitator_enabled: !customProviderEnabled,
      byo_gateway_monthly_fee: v.byo_gateway_enabled ? toNum(v.byo_gateway_fee) : null,
      white_label_allowed: v.white_label_enabled,
      white_label_monthly_fee: v.white_label_enabled ? toNum(v.white_label_monthly_fee) : null,
      white_label_setup_fee: v.white_label_enabled ? toNum(v.white_label_setup_fee) : null,
      white_label_billing_mode: v.white_label_enabled ? v.white_label_billing_mode : null,
      ...(v.white_label_enabled
        ? { branding_addon_enabled: true, branding_addon_monthly_fee: 0, branding_addon_setup_fee: 0 }
        : {}),
      pricelabs_allowed: isRolosPms ? v.pricelabs_enabled : false,
      pricelabs_monthly_fee: isRolosPms && v.pricelabs_enabled ? toNum(v.pricelabs_monthly_fee) : null,
      tier_pricing_json: v.volume_tiers_enabled ? (v.tier_pricing_json as any) : null,
      billing_start_date: startDate || null,
    } as any);
  };

  const applyPreset = (slug: string) => {
    setStrategy(slug);
    const preset = defaults.find((d) => d.strategy === slug);
    if (preset) {
      const next = presetToBuilder(preset);
      setBuilder(next);
      setPresetJustApplied(presetLabel(preset));
      // Immediately persist preset values to this property.
      persistBuilder(slug, next, billingStartDate);
    }
  };

  const handleSave = () => {
    persistBuilder(strategy, builder, billingStartDate);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Billing Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* ── Preset selector ─────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>Preset (quick-load defaults)</Label>
            <Select value={strategy} onValueChange={applyPreset}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Choose a preset" />
              </SelectTrigger>
              <SelectContent>
                {defaults.map((d) => (
                  <SelectItem key={d.id} value={d.strategy}>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-medium">{presetLabel(d)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {d.preset_description || summarizeBuilderValue(presetToBuilder(d))}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {presetJustApplied && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Loaded defaults from <strong>{presetJustApplied}</strong>. Customize any component below before saving.
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Presets seed the toggles below — every component can still be turned on/off or tuned per property.
            </p>
          </div>

          {/* ── Payment facilitator status link ─────────────────────── */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Payment Facilitator</Label>
                  {!customProviderEnabled ? (
                    <Badge className="gap-1 h-5 text-[10px]"><ShieldCheck className="h-3 w-3" />ON (default)</Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 h-5 text-[10px]"><Lock className="h-3 w-3" />OFF — custom provider</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {!customProviderEnabled
                    ? "ROL processes guest payments via PayFast. Enable the facilitator surcharge toggle to charge per booking."
                    : "This property uses its own payment provider. Use the BYO add-on toggle for the flat monthly fee."}
                </p>
              </div>
              {onSwitchTab && (
                <Button
                  type="button" variant="outline" size="sm" className="gap-1.5 shrink-0"
                  onClick={() => onSwitchTab("payment-providers")}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Manage
                </Button>
              )}
            </div>
          </div>

          {/* ── Builder ─────────────────────────────────────────────── */}
          <BillingConfigBuilder
            value={builder}
            onChange={(next) => {
              setBuilder(next);
              setPresetJustApplied(null);
            }}
            scope="property"
            placeholders={placeholders}
            disabledAddons={{
              pricelabs: {
                disabled: !isRolosPms,
                reason: "Available only when this property's PMS is ROL'OS.",
              },
            }}
          />

          {/* Live summary */}
          <div className="rounded-md bg-muted/30 border border-dashed p-2 text-[11px] text-muted-foreground">
            <strong className="text-foreground">This property will be billed:</strong> {summarizeBuilderValue(builder)}
          </div>

          {/* Billing start date */}
          <div className="space-y-2">
            <Label>Billing start date</Label>
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

      {/* PriceLabs admin activation + push (ROLOS properties only) */}
      {builder.pricelabs_enabled && (
        <PriceLabsAdminPushCard
          propertyId={propertyId}
          pricelabsAllowed={!!config?.pricelabs_allowed}
          isRolosPms={isRolosPms}
        />
      )}

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
