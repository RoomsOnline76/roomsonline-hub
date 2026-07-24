import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useBillingConfig } from "@/hooks/useBillingConfig";
import { usePropertyReferrals } from "@/hooks/useRepCommissions";
import {
  Loader2,
  Receipt,
  Wallet,
  Globe,
  CreditCard,
  Flag,
  UserCheck,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Pencil,
  Calculator,
} from "lucide-react";

interface AdminOverviewTabProps {
  propertyId: string;
  onNavigate?: (tab: "billing" | "payment-providers") => void;
}

const STRATEGY_LABELS: Record<string, string> = {
  default: "Default (Commission)",
  widget: "Widget — Tiered Commission",
  rolos_pms: "ROL'OS PMS — Subscription",
  volume_tiered: "Volume Tiered (Per Unit)",
  payment_facilitator: "Payment Facilitator Only",
  portfolio_aggregator: "Default (Commission)", // legacy alias
};

const DOMAIN_STATUS_META: Record<
  string,
  { label: string; tone: "default" | "secondary" | "outline" | "destructive"; Icon: typeof ShieldCheck }
> = {
  active: { label: "Active", tone: "default", Icon: ShieldCheck },
  pending: { label: "Pending DNS", tone: "outline", Icon: Loader2 },
  failed: { label: "Failed", tone: "destructive", Icon: ShieldAlert },
  unconfigured: { label: "Not configured", tone: "secondary", Icon: ShieldQuestion },
};

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <div className="text-xs text-right shrink-0 max-w-[55%]">{value}</div>
    </div>
  );
}

function Empty() {
  return <span className="text-muted-foreground">—</span>;
}

export function AdminOverviewTab({ propertyId, onNavigate }: AdminOverviewTabProps) {
  const { config, isLoading: billingLoading, scope } = useBillingConfig(propertyId);
  const { data: referrals } = usePropertyReferrals(propertyId);

  const { data: property, isLoading: propLoading } = useQuery({
    queryKey: ["admin-overview-property", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select(
          "id,name,is_rol_property,is_test_property,allow_custom_payment_provider,brand_override_enabled,show_on_website,pricelabs_config"
        )
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!propertyId,
  });

  const { data: wlDomain } = useQuery({
    queryKey: ["admin-overview-wl-domain", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_billing_configs")
        .select("white_label_domain,white_label_domain_status,white_label_monthly_fee,white_label_setup_fee,white_label_billing_mode,branding_addon_enabled,branding_addon_monthly_fee,branding_addon_setup_fee,pricelabs_allowed,pricelabs_monthly_fee,pricelabs_setup_fee,channel_manager_enabled,channel_manager_per_unit_fee")
        .eq("property_id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!propertyId,
  });

  const { data: unitCount } = useQuery({
    queryKey: ["admin-overview-unit-count", propertyId, scope.source, ...scope.siblingPropertyIds],
    queryFn: async () => {
      const ids = scope.source === "portfolio" && scope.siblingPropertyIds.length > 0
        ? scope.siblingPropertyIds
        : [propertyId];
      const countFor = async (pid: string) => {
        const [rolosRooms, hostfully] = await Promise.all([
          supabase.from("rolos_rooms").select("id", { count: "exact", head: true }).eq("property_id", pid),
          supabase.from("hostfully_room_types").select("id", { count: "exact", head: true }).eq("property_id", pid),
        ]);
        // Prefer ROLOS physical rooms; fall back to Hostfully unit-types if none.
        return (rolosRooms.count ?? 0) > 0 ? (rolosRooms.count ?? 0) : (hostfully.count ?? 0);
      };
      const counts = await Promise.all(ids.map(countFor));
      return counts.reduce((a, b) => a + b, 0);
    },
    enabled: !!propertyId,
  });

  if (billingLoading || propLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const strategy = config?.billing_strategy || "default";
  const strategyLabel = STRATEGY_LABELS[strategy] || strategy;
  const facilitator = config?.payment_facilitator_enabled ?? false;
  const customProvider = !!property?.allow_custom_payment_provider;
  const wlAllowed = !!config?.white_label_allowed;
  const wlStatus = (wlDomain?.white_label_domain_status || "unconfigured") as keyof typeof DOMAIN_STATUS_META;
  const wlMeta = DOMAIN_STATUS_META[wlStatus] || DOMAIN_STATUS_META.unconfigured;
  const WlIcon = wlMeta.Icon;
  const activeReferral = referrals?.[0];

  // ── Estimated cost calculation (excludes commission / transaction fees) ──
  // Use `config` (property_billing_configs) as single source of truth; `wlDomain`
  // is the same row scoped to WL/domain fields.
  const c: any = config || {};
  const units = unitCount ?? 0;
  const costLines: { label: string; amount: number; once?: boolean }[] = [];
  const push = (label: string, amount: number | null | undefined, once = false) => {
    const n = Number(amount ?? 0);
    if (n > 0) costLines.push({ label, amount: n, once });
  };

  // PMS subscription
  push(`Subscription (${STRATEGY_LABELS[strategy] ?? strategy})`, c.subscription_fee_monthly);

  // (Legacy enterprise custom PMS fee removed — subscription is now driven purely by room count.)


  // Volume-tiered per-property monthly fee (only when explicitly enabled)
  if (c.volume_tiers_enabled && Array.isArray(c.tier_pricing_json) && c.tier_pricing_json.length > 0) {
    const roomCount = c.room_count_override ?? units;
    const tier = c.tier_pricing_json.find((t: any) => {
      const min = Number(t.min_rooms ?? 0);
      const max = t.max_rooms == null ? Infinity : Number(t.max_rooms);
      return roomCount >= min && roomCount <= max;
    });
    if (tier && Number(tier.monthly_fee ?? 0) > 0) {
      push(`Volume tier${tier.label ? ` — ${tier.label}` : ""} (${roomCount} rooms)`, tier.monthly_fee);
    }
  }

  // Channel Manager per-unit fee — bill whenever explicitly enabled and units exist
  if (c.channel_manager_enabled && units > 0 && Number(c.channel_manager_per_unit_fee ?? 0) > 0) {
    const cmFee = Number(c.channel_manager_per_unit_fee);
    push(`Channel Manager (${units} unit${units === 1 ? "" : "s"} × R${cmFee})`, cmFee * units);
  }

  // White-Label licence
  if (wlAllowed && Number(c.white_label_monthly_fee ?? 0) > 0) {
    const annual = c.white_label_billing_mode === "annual";
    const monthly = annual ? Number(c.white_label_monthly_fee) / 12 : Number(c.white_label_monthly_fee);
    push(`White-Label licence${annual ? " (annual/12)" : ""}`, monthly);
  }
  if (wlAllowed) push("White-Label setup", c.white_label_setup_fee, true);

  // Branding add-on — free when bundled with White-label, otherwise billed
  if (!wlAllowed && c.branding_addon_enabled) {
    push("Branding add-on", c.branding_addon_monthly_fee);
    push("Branding add-on setup", c.branding_addon_setup_fee, true);
  }
  if (wlAllowed) {
    costLines.push({ label: "Basic Branding add-on (included with White-label)", amount: 0 });
  }

  // PriceLabs Revenue add-on — billed when admin has toggled the add-on for this property
  if (c.pricelabs_allowed) {
    const activated = !!property?.pricelabs_config?.enabled;
    const monthly = Number(c.pricelabs_monthly_fee ?? 0);
    if (monthly > 0) {
      costLines.push({
        label: `PriceLabs add-on${activated ? "" : " (enabled — awaiting activation)"}`,
        amount: monthly,
      });
    }
    push("PriceLabs setup", c.pricelabs_setup_fee, true);
  }

  // BYO payment gateway monthly add-on (only when owner uses their own provider)
  if (customProvider) push("BYO payment gateway add-on", c.byo_gateway_monthly_fee);


  const monthlyTotal = costLines.filter((l) => !l.once).reduce((s, l) => s + l.amount, 0);
  const setupTotal = costLines.filter((l) => l.once).reduce((s, l) => s + l.amount, 0);
  const fmt = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-3">
      {/* Estimated client cost */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Estimated Client Cost</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate?.("billing")}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          </div>
          <CardDescription className="text-xs">
            {scope.source === "portfolio"
              ? `Portfolio-level total — shared across ${scope.siblingPropertyIds.length} propert${scope.siblingPropertyIds.length === 1 ? "y" : "ies"} in ${scope.portfolioName || "this portfolio"}.`
              : "Fixed recurring and once-off charges. Excludes commission and per-transaction payment fees."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-baseline justify-between border-b pb-2 mb-2">
            <div>
              <div className="text-xs text-muted-foreground">Monthly recurring</div>
              <div className="text-lg font-semibold">{fmt(monthlyTotal)}<span className="text-xs font-normal text-muted-foreground"> / mo</span></div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Once-off setup</div>
              <div className="text-lg font-semibold">{fmt(setupTotal)}</div>
            </div>
          </div>
          {costLines.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No fixed fees on the current strategy — client is charged commission / transaction fees only.
            </p>
          ) : (
            <div className="space-y-0.5">
              {costLines.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {l.label}
                    {l.once && <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">once</Badge>}
                  </span>
                  <span className="font-mono">{fmt(l.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">
            Strategy: <span className="font-medium">{strategyLabel}</span>
            {strategy === "widget" && c.widget_flat_commission_rate != null
              ? ` · widget flat commission ${c.widget_flat_commission_rate}% (variable, not included)`
              : strategy === "widget"
              ? " · commission tiered by monthly volume (variable, not included)"
              : c.commission_rate != null && ` · commission ${c.commission_rate}% (variable, not included)`}
            {Number(c.transaction_fee_percentage ?? 0) > 0 &&
              ` · facilitator surcharge ${c.transaction_fee_percentage}% per booking (variable, not included)`}
          </p>
        </CardContent>
      </Card>

      {/* Property flags */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Property Flags</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Internal flags that determine where this property appears.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Row
            label="ROL'OS property"
            value={
              property?.is_rol_property ? (
                <Badge variant="default">Yes</Badge>
              ) : (
                <Badge variant="secondary">No</Badge>
              )
            }
            hint="Enables ROL'OS hub (Rate manager, Rooms, Templates…)"
          />
          <Row
            label="Test property"
            value={
              property?.is_test_property ? (
                <Badge variant="destructive">Test</Badge>
              ) : (
                <Badge variant="outline">Live</Badge>
              )
            }
          />
          <Row
            label="Public visibility"
            value={
              property?.show_on_website ? (
                <Badge variant="default">Visible</Badge>
              ) : (
                <Badge variant="secondary">Hidden</Badge>
              )
            }
          />
          <Row label="Status" value={property?.status ? <Badge variant="outline">{property.status}</Badge> : <Empty />} />
        </CardContent>
      </Card>

      {/* Billing */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Billing Model</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate?.("billing")}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Row label="Strategy" value={<Badge variant="outline">{strategyLabel}</Badge>} />
          {strategy === "widget" ? (
            <Row
              label="Commission (booking %)"
              value={<span className="text-xs text-muted-foreground">Tiered by monthly volume</span>}
              hint="Configured in Admin → Billing Defaults → Widget tiers."
            />
          ) : ["default", "rolos_pms", "volume_tiered"].includes(strategy) && (
            <Row
              label="Commission (booking %)"
              value={config?.commission_rate != null ? `${config.commission_rate}%` : <Empty />}
              hint="ROL's share of the booking value."
            />
          )}
          <Row
            label="Subscription (monthly)"
            value={config?.subscription_fee_monthly != null ? `R ${config.subscription_fee_monthly}` : <Empty />}
          />
          {facilitator && (
            <Row
              label="Booking surcharge % (ROL facilitator)"
              value={
                config?.transaction_fee_percentage != null ? `${config.transaction_fee_percentage}%` : <Empty />
              }
              hint="Applied per booking on the booking total only; stacks on commission. Sales reps do not earn on this fee."
            />
          )}
          {customProvider && (
            <Row
              label="BYO gateway add-on (ZAR/mo)"
              value={
                (config as any)?.byo_gateway_monthly_fee != null
                  ? `R ${(config as any).byo_gateway_monthly_fee}`
                  : <Empty />
              }
              hint="Flat monthly fee — owner uses their own payment gateway."
            />
          )}
          <Row label="Billing start" value={config?.billing_start_date || <Empty />} />
          {config?.tier_scope && (
            <Row label="Tier scope" value={<Badge variant="outline">{config.tier_scope}</Badge>} />
          )}
          {config?.room_count_override != null && (
            <Row label="Room count override" value={String(config.room_count_override)} />
          )}
        </CardContent>
      </Card>

      {/* Payment */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Payment Processing</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onNavigate?.("payment-providers")}
            >
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Row
            label="Gateway"
            value={
              customProvider ? (
                <Badge variant="default">Own provider</Badge>
              ) : facilitator ? (
                <Badge variant="secondary">Rooms Online PayFast</Badge>
              ) : (
                <Badge variant="outline">Not configured</Badge>
              )
            }
            hint={
              customProvider
                ? "Owner configures credentials in ROL'OS → Integrations."
                : facilitator
                ? "Payment Facilitator fee applied on each transaction."
                : "Enable ROL facilitator surcharge or BYO gateway add-on in Billing."
            }
          />
          <Row
            label="Facilitator fee"
            value={
              facilitator ? (
                <Badge variant="outline">Active</Badge>
              ) : (
                <Badge variant="secondary">Disabled</Badge>
              )
            }
          />
        </CardContent>
      </Card>

      {/* White label */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">White-Label</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate?.("billing")}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Row
            label="Allowed"
            value={
              wlAllowed ? (
                <Badge variant="default">Enabled</Badge>
              ) : (
                <Badge variant="secondary">Not enabled</Badge>
              )
            }
            hint="Unlocks the branding override and custom booking domain."
          />
          <Row
            label="Brand override"
            value={
              property?.brand_override_enabled ? (
                <Badge variant="default">On</Badge>
              ) : (
                <Badge variant="secondary">Off</Badge>
              )
            }
          />
          <Row
            label="Monthly fee"
            value={wlDomain?.white_label_monthly_fee != null ? `R ${wlDomain.white_label_monthly_fee}` : <Empty />}
          />
          <Row
            label="Custom domain"
            value={
              wlDomain?.white_label_domain ? (
                <span className="font-mono">{wlDomain.white_label_domain}</span>
              ) : (
                <Empty />
              )
            }
          />
          <Row
            label="DNS status"
            value={
              <Badge variant={wlMeta.tone} className="gap-1">
                <WlIcon className="h-3 w-3" />
                {wlMeta.label}
              </Badge>
            }
          />
        </CardContent>
      </Card>

      {/* Revenue Add-ons */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Revenue Add-ons</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate?.("billing")}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Row
            label="PriceLabs"
            value={
              wlDomain?.pricelabs_allowed ? (
                <Badge variant="default">Enabled</Badge>
              ) : (
                <Badge variant="secondary">Not enabled</Badge>
              )
            }
            hint="Dynamic pricing suggestions (surface in ROL'OS → Revenue)."
          />
          <Row
            label="PriceLabs monthly fee"
            value={wlDomain?.pricelabs_monthly_fee != null ? `R ${wlDomain.pricelabs_monthly_fee}` : <Empty />}
          />
        </CardContent>
      </Card>




      {/* Referral / Sales rep */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Referral / Sales</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {activeReferral ? (
            <>
              <Row
                label="Type"
                value={<Badge variant="outline">{(activeReferral as any).referral_type || "referral"}</Badge>}
              />
              <Row
                label="Since"
                value={(activeReferral as any).referral_date || <Empty />}
              />
              {(activeReferral as any).commission_percentage != null && (
                <Row
                  label="Commission"
                  value={`${(activeReferral as any).commission_percentage}%`}
                />
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No referral or sales rep linked.</p>
          )}
        </CardContent>
      </Card>

      <Separator />
      <p className="text-[11px] text-muted-foreground px-1">
        This overview is admin-only. Owners see the ROL'OS hub tuned to what has been enabled above.
      </p>
    </div>
  );
}
