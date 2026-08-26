import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Save, ChevronDown, ExternalLink, Lock, ShieldCheck, Layers, Building2 } from "lucide-react";
import { useBillingConfig, BillingConfig } from "@/hooks/useBillingConfig";
import { resolvePaymentModel, type PaymentMode } from "@/lib/paymentMode";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { useBillingDefaults, BillingDefault, presetLabel } from "@/hooks/useBillingDefaults";
import { CommissionTab } from "./CommissionTab";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { normalizeTiers, PricingTier } from "@/lib/billingTierResolver";
import { resolveBillingSchedule, DEFAULT_FREE_PERIOD_DAYS } from "@/lib/billingSchedule";

import {
  BillingConfigBuilder,
  BillingConfigValue,
  emptyBuilderValue,
  summarizeBuilderValue,
} from "@/components/admin/billing/BillingConfigBuilder";
import { PriceLabsAdminPushCard } from "./PriceLabsAdminPushCard";
import { SubscriptionStatusPanel } from "./SubscriptionStatusPanel";
import { SubscriptionInvoiceDownloadCenter } from "./SubscriptionInvoiceDownloadCenter";
import { ByoSetupChecklist } from "@/components/integrations/ByoSetupChecklist";
import { GatewayScheduleCard } from "./GatewayScheduleCard";
import { toast } from "sonner";
import { regradeChannelStepsAfterSave } from "@/lib/channelStepLedger";
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
  v.pms_commission_rate = (row as any).pms_commission_rate != null ? String((row as any).pms_commission_rate) : "";

  v.widget_tiers_enabled = row.strategy === "widget" && (row as any).widget_flat_commission_rate == null;
  v.widget_flat_enabled = (row as any).widget_flat_commission_rate != null;
  v.widget_flat_rate = (row as any).widget_flat_commission_rate != null ? String((row as any).widget_flat_commission_rate) : "";
  v.pms_enabled = (row.default_subscription_fee ?? 0) > 0;
  v.subscription_fee = row.default_subscription_fee != null ? String(row.default_subscription_fee) : "";
  v.channel_manager_enabled = (row.channel_manager_per_unit_fee ?? 0) > 0;
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
  v.branding_addon_enabled = !!(row as any).branding_addon_allowed;
  v.branding_addon_monthly_fee = (row as any).branding_addon_monthly_fee != null ? String((row as any).branding_addon_monthly_fee) : "";
  v.branding_addon_setup_fee = (row as any).branding_addon_setup_fee != null ? String((row as any).branding_addon_setup_fee) : "";
  v.branding_addon_billing_mode = ((row as any).branding_addon_billing_mode as "monthly" | "annual") || "monthly";
  v.pricelabs_enabled = (row.pricelabs_monthly_fee ?? 0) > 0;
  v.pricelabs_monthly_fee = row.pricelabs_monthly_fee != null ? String(row.pricelabs_monthly_fee) : "";
  v.pricelabs_setup_fee = (row as any).pricelabs_setup_fee != null ? String((row as any).pricelabs_setup_fee) : "";
  return v;
}

function configToBuilder(config: BillingConfig | null): BillingConfigValue {
  if (!config) return emptyBuilderValue();
  const tiers = normalizeTiers((config as any).tier_pricing_json);
  const isWidget = config.billing_strategy === "widget";
  const v = emptyBuilderValue();
  v.commission_enabled = config.commission_rate != null && !isWidget;
  v.commission_rate = config.commission_rate != null ? String(config.commission_rate) : "";
  v.pms_commission_rate = (config as any).pms_commission_rate != null ? String((config as any).pms_commission_rate) : "";

  v.widget_tiers_enabled = isWidget && (config as any).widget_flat_commission_rate == null;
  v.widget_flat_enabled = (config as any).widget_flat_commission_rate != null;
  v.widget_flat_rate = (config as any).widget_flat_commission_rate != null ? String((config as any).widget_flat_commission_rate) : "";
  v.pms_enabled = (config.subscription_fee_monthly ?? 0) > 0 || (config as any).pms_enabled === true;
  v.subscription_fee = config.subscription_fee_monthly != null ? String(config.subscription_fee_monthly) : "";
  v.channel_manager_enabled = !!config.channel_manager_enabled;
  v.channel_per_unit = config.channel_manager_per_unit_fee != null ? String(config.channel_manager_per_unit_fee) : "";

  v.enterprise_custom_fee = (config as any).enterprise_custom_fee != null ? String((config as any).enterprise_custom_fee) : "";
  v.volume_tiers_enabled = tiers.length > 0 && !isWidget;
  v.tier_pricing_json = tiers.length ? tiers : null;
  const model = resolvePaymentModel({ config: config as any });
  v.facilitator_surcharge_enabled = model === "rol";
  v.transaction_fee = config.transaction_fee_percentage != null ? String(config.transaction_fee_percentage) : "";
  v.byo_gateway_enabled = model === "byo";
  v.byo_gateway_fee = (config as any).byo_gateway_monthly_fee != null ? String((config as any).byo_gateway_monthly_fee) : "";
  v.white_label_enabled = !!config.white_label_allowed;
  v.white_label_monthly_fee = config.white_label_monthly_fee != null ? String(config.white_label_monthly_fee) : "";
  v.white_label_setup_fee = config.white_label_setup_fee != null ? String(config.white_label_setup_fee) : "";
  v.white_label_billing_mode = (config.white_label_billing_mode as "monthly" | "annual") || "monthly";
  v.branding_addon_enabled = !!(config as any).branding_addon_enabled && !config.white_label_allowed;
  v.branding_addon_monthly_fee = (config as any).branding_addon_monthly_fee != null ? String((config as any).branding_addon_monthly_fee) : "";
  v.branding_addon_setup_fee = (config as any).branding_addon_setup_fee != null ? String((config as any).branding_addon_setup_fee) : "";
  v.branding_addon_billing_mode = ((config as any).branding_addon_billing_mode as "monthly" | "annual") || "monthly";
  v.pricelabs_enabled = !!config.pricelabs_allowed;
  v.pricelabs_monthly_fee = config.pricelabs_monthly_fee != null ? String(config.pricelabs_monthly_fee) : "";
  v.pricelabs_setup_fee = (config as any).pricelabs_setup_fee != null ? String((config as any).pricelabs_setup_fee) : "";
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
  // Role comes from user_roles via useAuth — never from the editable profiles row.
  const { isAdmin } = useAuth();

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

  // Provider the owner settles with — drives the BYO setup checklist below.
  const { data: byoProviderHint } = useQuery({
    queryKey: ["property-byo-provider-hint", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("payment_provider, payment_providers")
        .eq("id", propertyId)
        .maybeSingle();
      const row = data as { payment_provider?: string | null; payment_providers?: string[] | null } | null;
      return row?.payment_providers?.[0] || row?.payment_provider || "payfast";
    },
    enabled: !!propertyId,
    staleTime: 60 * 1000,
  });


  // Sibling property names when this property is a portfolio member.
  const { data: siblingProps } = useQuery({
    queryKey: ["billing-config-siblings", scope.portfolioId, scope.siblingPropertyIds.join(",")],
    queryFn: async () => {
      if (!isPortfolioScope || scope.siblingPropertyIds.length === 0) return [];
      const { data } = await supabase
        .from("properties")
        .select("id, name, slug")
        .in("id", scope.siblingPropertyIds);
      return (data || []) as Array<{ id: string; name: string; slug: string | null }>;
    },
    enabled: isPortfolioScope,
  });

  const [strategy, setStrategy] = useState<string>("default");
  const [builder, setBuilder] = useState<BillingConfigValue>(emptyBuilderValue());
  const [billingStartDate, setBillingStartDate] = useState("");
  const [engagementDate, setEngagementDate] = useState("");
  const [freePeriodDays, setFreePeriodDays] = useState("");
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [presetJustApplied, setPresetJustApplied] = useState<string | null>(null);

  // A refused save must not be erased by a background refetch — the operator's
  // pending choices stay on screen until a save is proven to have landed.
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (config && !saveFailed) {
      setStrategy(config.billing_strategy || "default");
      setBuilder(configToBuilder(config));
      setBillingStartDate(config.billing_start_date || "");
      const c = config as unknown as { engagement_date?: string | null; free_period_days?: number | null };
      setEngagementDate(c.engagement_date || "");
      setFreePeriodDays(c.free_period_days != null ? String(c.free_period_days) : "");
      setBillingEnabled(!!(config as unknown as { billing_enabled?: boolean }).billing_enabled);
    }
  }, [config]);

  const schedulePreview = useMemo(
    () =>
      resolveBillingSchedule({
        engagement_date: engagementDate || null,
        billing_start_date: billingStartDate || null,
        free_period_days: freePeriodDays === "" ? null : Number(freePeriodDays),
      }),
    [engagementDate, billingStartDate, freePeriodDays],
  );


  const selectedPreset = useMemo(() => getDefaultsForStrategy(strategy), [strategy, defaults]);
  const placeholders = useMemo(() => {
    if (!selectedPreset) return {};
    return {
      commission_rate: selectedPreset.default_commission_rate ?? undefined,
      pms_commission_rate: (selectedPreset as any).pms_commission_rate ?? undefined,

      subscription_fee: selectedPreset.default_subscription_fee ?? undefined,
      channel_per_unit: selectedPreset.channel_manager_per_unit_fee ?? undefined,
      transaction_fee: selectedPreset.default_transaction_fee ?? undefined,
      byo_gateway_fee: (selectedPreset as any).byo_gateway_monthly_fee ?? undefined,
      white_label_monthly_fee: selectedPreset.white_label_monthly_fee ?? undefined,
      white_label_setup_fee: selectedPreset.white_label_setup_fee ?? undefined,
      branding_addon_monthly_fee: (selectedPreset as any).branding_addon_monthly_fee ?? undefined,
      branding_addon_setup_fee: (selectedPreset as any).branding_addon_setup_fee ?? undefined,
      pricelabs_monthly_fee: selectedPreset.pricelabs_monthly_fee ?? undefined,
      pricelabs_setup_fee: (selectedPreset as any).pricelabs_setup_fee ?? undefined,
    } as any;
  }, [selectedPreset]);

  const persistBuilder = async (
    nextStrategy: string,
    v: BillingConfigValue,
    startDate: string,
    enabled: boolean,
  ): Promise<boolean> => {
    // Sync payment toggles → property flags so ROLOS/Integrations unlocks or locks
    // the gateway configurator accordingly. When BOTH the ROL facilitator and the
    // BYO gateway are off the property is reservation-only: no online payment.
    const nextAllowCustom = v.byo_gateway_enabled;
    const nextPaymentMode: PaymentMode = v.byo_gateway_enabled
      ? "byo"
      : v.facilitator_surcharge_enabled
      ? "rol"
      : "reservation_only";
    const targetIds =
      isPortfolioScope && scope.siblingPropertyIds.length ? scope.siblingPropertyIds : [propertyId];
    supabase
      .from("properties")
      .update({ allow_custom_payment_provider: nextAllowCustom, payment_mode: nextPaymentMode } as any)
      .in("id", targetIds)
      .then(() => { /* silent — surfaced via query invalidation below */ });
    const payload = {
      property_id: propertyId,
      billing_strategy: nextStrategy as BillingConfig["billing_strategy"],
      commission_rate: v.commission_enabled ? toNum(v.commission_rate) : null,
      listing_commission_rate: v.commission_enabled ? toNum(v.commission_rate) : null,
      pms_commission_rate: v.commission_enabled ? toNum(v.pms_commission_rate) : null,

      widget_flat_commission_rate: v.widget_flat_enabled ? toNum(v.widget_flat_rate) : null,
      subscription_fee_monthly: v.pms_enabled ? toNum(v.subscription_fee) : null,
      channel_manager_enabled: v.channel_manager_enabled,
      channel_manager_per_unit_fee: v.channel_manager_enabled ? toNum(v.channel_per_unit) : null,

      enterprise_custom_fee: v.pms_enabled ? toNum(v.enterprise_custom_fee) : null,
      transaction_fee_percentage: v.facilitator_surcharge_enabled ? toNum(v.transaction_fee) : null,
      // Both off = reservation only (no online payment processing at all).
      // `payment_model` is the explicit commercial record contracts + invoices read.
      payment_model: nextPaymentMode,
      payment_facilitator_enabled: v.facilitator_surcharge_enabled,
      byo_gateway_monthly_fee: v.byo_gateway_enabled ? toNum(v.byo_gateway_fee) : null,

      white_label_allowed: v.white_label_enabled,
      white_label_monthly_fee: v.white_label_enabled ? toNum(v.white_label_monthly_fee) : null,
      white_label_setup_fee: v.white_label_enabled ? toNum(v.white_label_setup_fee) : null,
      white_label_billing_mode: v.white_label_enabled ? v.white_label_billing_mode : null,
      // When WL is on, branding is bundled free; otherwise persist the standalone branding pack.
      ...(v.white_label_enabled
        ? { branding_addon_enabled: true, branding_addon_monthly_fee: 0, branding_addon_setup_fee: 0 }
        : {
            branding_addon_enabled: v.branding_addon_enabled,
            branding_addon_monthly_fee: v.branding_addon_enabled ? toNum(v.branding_addon_monthly_fee) : null,
            branding_addon_setup_fee: v.branding_addon_enabled ? toNum(v.branding_addon_setup_fee) : null,
            branding_addon_billing_mode: v.branding_addon_enabled ? v.branding_addon_billing_mode : null,
          }),
      pricelabs_allowed: isRolosPms ? v.pricelabs_enabled : false,
      pricelabs_monthly_fee: isRolosPms && v.pricelabs_enabled ? toNum(v.pricelabs_monthly_fee) : null,
      pricelabs_setup_fee: isRolosPms && v.pricelabs_enabled ? toNum(v.pricelabs_setup_fee) : null,
      tier_pricing_json: v.volume_tiers_enabled ? (v.tier_pricing_json as any) : null,
      billing_start_date: startDate || null,
      engagement_date: engagementDate || null,
      free_period_days: freePeriodDays === "" ? null : Number(freePeriodDays),
      billing_anchor_day: engagementDate ? Number(schedulePreview.paidStart?.slice(8, 10)) || null : null,

      billing_enabled: enabled,
    } as any;
    try {
      await upsert.mutateAsync(payload);
      setSaveFailed(false);
      return true;
    } catch {
      // The hook already surfaced the reason; keep the operator's choices on screen.
      setSaveFailed(true);
      return false;
    }
  };

  const applyPreset = (slug: string) => {
    setStrategy(slug);
    const preset = defaults.find((d) => d.strategy === slug);
    if (preset) {
      // Presets seed fees, but the payment model (ROL / BYO / none) stays the
      // property's explicit choice — a reservation-only property must not be
      // silently switched back onto a gateway model by a preset.
      const next = {
        ...presetToBuilder(preset),
        facilitator_surcharge_enabled: builder.facilitator_surcharge_enabled,
        byo_gateway_enabled: builder.byo_gateway_enabled,
      };
      setBuilder(next);
      setPresetJustApplied(presetLabel(preset));
      // Immediately persist preset values to this property.
      persistBuilder(slug, next, billingStartDate, billingEnabled);
    }
  };


  // ── Channel Manager entitlement fan-out ───────────────────────────────
  const savedChannelManager = !!config?.channel_manager_enabled;
  const [cmDialogOpen, setCmDialogOpen] = useState(false);
  const [cmSyncing, setCmSyncing] = useState(false);

  const runEntitlementFanOut = async (enabled: boolean) => {
    setCmSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("channel-manager-entitlement", {
        body: {
          scope: isPortfolioScope ? "portfolio" : "property",
          entity_id: isPortfolioScope ? scope.portfolioId : propertyId,
          enabled,
        },
      });
      if (error) throw error;
      const res = data as { affected?: number; failed?: number } | null;
      const failed = res?.failed ?? 0;
      if (failed > 0) {
        toast.error(
          `${failed} of ${res?.affected ?? 0} propert${(res?.affected ?? 0) === 1 ? "y" : "ies"} could not be ${enabled ? "re-activated" : "archived"} at the Channel Manager.`
        );
      } else {
        toast.success(
          enabled
            ? `Channel Manager enabled — ${res?.affected ?? 0} listing(s) re-activated at the Channel Manager.`
            : `Channel Manager disabled — ${res?.affected ?? 0} listing(s) archived at the Channel Manager.`
        );
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Channel Manager status update failed — retry from the admin integrations console."
      );
    } finally {
      setCmSyncing(false);
    }
  };

  const commitSave = async () => {
    persistBuilder(strategy, builder, billingStartDate, billingEnabled);
    if (builder.channel_manager_enabled !== savedChannelManager) {
      await runEntitlementFanOut(builder.channel_manager_enabled);
      // Entitlement flipped — the channel ledger's entitlement grade is no longer trustworthy.
      const ledgerTargets = [...new Set([propertyId, ...(isPortfolioScope ? scope.siblingPropertyIds : [])])];
      await Promise.all(ledgerTargets.map((id) => regradeChannelStepsAfterSave(id, ["entitlement", "connect"])));
    }
  };

  const handleSave = () => {
    if (builder.channel_manager_enabled !== savedChannelManager) {
      setCmDialogOpen(true);
      return;
    }
    void commitSave();
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
      {isPortfolioScope && (
        <Alert className="mb-4 border-primary/40 bg-primary/5">
          <Layers className="h-4 w-4" />
          <AlertTitle className="text-sm">
            Portfolio-level billing — {scope.portfolioName || "portfolio"}
          </AlertTitle>
          <AlertDescription className="text-[11px] space-y-2">
            <p>
              This property is part of a portfolio. Billing is configured <strong>once for the whole portfolio</strong>
              {" "}and applies to every member property below. Any change you save here updates all{" "}
              {scope.siblingPropertyIds.length} member propert{scope.siblingPropertyIds.length === 1 ? "y" : "ies"}.
            </p>
            {siblingProps && siblingProps.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {siblingProps.map((s) => (
                  <Badge key={s.id} variant="secondary" className="gap-1 text-[10px] font-normal">
                    <Building2 className="h-3 w-3" />
                    {s.name}
                  </Badge>
                ))}
              </div>
            )}
            <div className="pt-1">
              <Link
                to="/admin/portfolios"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open portfolio manager
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <SubscriptionStatusPanel
        scope={isPortfolioScope ? "portfolio" : "property"}
        entityId={isPortfolioScope ? (scope.portfolioId as string) : propertyId}
      />
      <SubscriptionInvoiceDownloadCenter
        scope={isPortfolioScope ? "portfolio" : "property"}
        entityId={isPortfolioScope ? (scope.portfolioId as string) : propertyId}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {isPortfolioScope ? "Portfolio Billing Configuration" : "Billing Configuration"}
          </CardTitle>
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
              <p className="text-[11px] text-success dark:text-emerald-400">
                Loaded defaults from <strong>{presetJustApplied}</strong>. Customize any component below before saving.
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Presets seed the toggles below — every component can still be turned on/off or tuned per property.
            </p>
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
            pricelabsExtras={
              builder.pricelabs_enabled && isRolosPms ? (
                <PriceLabsAdminPushCard
                  propertyId={propertyId}
                  pricelabsAllowed={!!builder.pricelabs_enabled}
                  pricelabsSaved={!!config?.pricelabs_allowed}
                  isRolosPms={isRolosPms}
                />
              ) : null
            }
          />

          {/* ── Owner setup checklist for the BYO gateway ─────────────── */}
          {builder.byo_gateway_enabled && (
            <ByoSetupChecklist
              propertyId={propertyId}
              provider={byoProviderHint}
              readOnly
            />
          )}

          {/* ── Processing schedule (only when ROL processes payments) ── */}
          {builder.facilitator_surcharge_enabled && <GatewayScheduleCard propertyId={propertyId} />}




          {/* Live summary */}
          <div className="rounded-md bg-muted/30 border border-dashed p-2 text-[11px] text-muted-foreground">
            <strong className="text-foreground">
              {isPortfolioScope
                ? `Portfolio (${scope.siblingPropertyIds.length} propert${scope.siblingPropertyIds.length === 1 ? "y" : "ies"}) will be billed:`
                : "This property will be billed:"}
            </strong>{" "}
            {summarizeBuilderValue(builder)}
          </div>

          {/* Engagement date + free period → drives the monthly subscription clock */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Engagement date</Label>
              <Input
                type="date"
                value={engagementDate}
                onChange={(e) => setEngagementDate(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Free period (days)</Label>
              <Input
                type="number"
                min={0}
                value={freePeriodDays}
                placeholder={String(DEFAULT_FREE_PERIOD_DAYS)}
                onChange={(e) => setFreePeriodDays(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Billing start date</Label>
              <Input
                type="date"
                value={billingStartDate}
                onChange={(e) => setBillingStartDate(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {schedulePreview.paidStart
              ? `Monthly subscription billing starts ${schedulePreview.paidStart}${
                  schedulePreview.inFreePeriod
                    ? ` — ${schedulePreview.freeDaysRemaining} free day(s) remaining`
                    : ""
                }. Setup fees are invoiced upfront on contract signature and are never bundled into a monthly invoice.`
              : "Capture an engagement date — the free period runs from it and monthly billing starts the day it ends. Setup fees are invoiced upfront on contract signature."}
          </p>


          {/* Billing activation switch (admin only) */}
          {isAdmin && (
            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Billing active</Label>
                <p className="text-[11px] text-muted-foreground">
                  While this is off, no subscription invoices are generated and no payment reminder
                  emails are sent — safe for testing and onboarding.
                </p>
              </div>
              <Switch checked={billingEnabled} onCheckedChange={setBillingEnabled} />
            </div>
          )}


          <Button onClick={handleSave} disabled={upsert.isPending || cmSyncing} className="w-full">
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {isPortfolioScope ? "Save Portfolio Billing Config" : "Save Billing Config"}
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

      {/* Channel Manager entitlement confirmation */}
      <AlertDialog open={cmDialogOpen} onOpenChange={setCmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {builder.channel_manager_enabled
                ? "Re-enable Channel Manager billing?"
                : "Disable Channel Manager billing?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-xs">
              {builder.channel_manager_enabled ? (
                <>
                  <p>
                    All {isPortfolioScope ? `${scope.siblingPropertyIds.length} portfolio ` : ""}
                    propert{isPortfolioScope && scope.siblingPropertyIds.length !== 1 ? "ies" : "y"} will be{" "}
                    <strong>re-activated at the Channel Manager</strong> and the ROL'OS Channel Manager screen unlocks.
                  </p>
                  <p>Per-unit channel billing resumes for every synced unit.</p>
                </>
              ) : (
                <>
                  <p>
                    All {isPortfolioScope ? `${scope.siblingPropertyIds.length} portfolio ` : ""}
                    propert{isPortfolioScope && scope.siblingPropertyIds.length !== 1 ? "ies" : "y"} will be{" "}
                    <strong>archived at the Channel Manager</strong>, ARI pushes stop, and the ROL'OS Channel Manager
                    screen is locked for the owner.
                  </p>
                  <p>Per-unit channel billing stops from the next invoice run.</p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCmDialogOpen(false);
                void commitSave();
              }}
            >
              {builder.channel_manager_enabled ? "Enable & re-activate" : "Disable & archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>

  );
}
