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
  default: "Default — Listing Commission",
  widget: "Widget — Tiered Commission",
  rolos_pms: "ROL'OS PMS — Subscription",
  portfolio_aggregator: "Portfolio Aggregator",
  enterprise_white_label: "Enterprise White-Label",
  volume_tiered: "Volume Tiered (Per Unit)",
  payment_facilitator: "Payment Facilitator Only",
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
  const { config, isLoading: billingLoading } = useBillingConfig(propertyId);
  const { data: referrals } = usePropertyReferrals(propertyId);

  const { data: property, isLoading: propLoading } = useQuery({
    queryKey: ["admin-overview-property", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select(
          "id,name,is_rol_property,is_test_property,allow_custom_payment_provider,brand_override_enabled,show_on_website,status"
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
        .select("white_label_domain,white_label_domain_status,white_label_monthly_fee,pricelabs_allowed,pricelabs_monthly_fee")
        .eq("property_id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
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
  const facilitator = config?.payment_facilitator_enabled ?? true;
  const customProvider = !!property?.allow_custom_payment_provider;
  const wlAllowed = !!config?.white_label_allowed;
  const wlStatus = (wlDomain?.white_label_domain_status || "unconfigured") as keyof typeof DOMAIN_STATUS_META;
  const wlMeta = DOMAIN_STATUS_META[wlStatus] || DOMAIN_STATUS_META.unconfigured;
  const WlIcon = wlMeta.Icon;
  const activeReferral = referrals?.[0];

  return (
    <div className="space-y-3">
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
          <Row
            label="Commission"
            value={config?.commission_rate != null ? `${config.commission_rate}%` : <Empty />}
          />
          <Row
            label="Subscription (monthly)"
            value={config?.subscription_fee_monthly != null ? `R ${config.subscription_fee_monthly}` : <Empty />}
          />
          <Row
            label="Transaction fee"
            value={
              config?.transaction_fee_percentage != null ? `${config.transaction_fee_percentage}%` : <Empty />
            }
          />
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
              ) : (
                <Badge variant="secondary">Rooms Online PayFast</Badge>
              )
            }
            hint={
              customProvider
                ? "Owner configures credentials in ROL'OS → Integrations."
                : "Payment Facilitator fee applied on each transaction."
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
