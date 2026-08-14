import { useQuery } from "@tanstack/react-query";
import {
  detectSubscriptionDrift,
  driftMessage,
  type DriftInvoiceLike,
} from "@/lib/subscriptionDrift";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useBillingConfig } from "@/hooks/useBillingConfig";
import { usePropertyReferrals } from "@/hooks/useRepCommissions";
import { resolvePropertyTier, isTierStrategy } from "@/lib/billingTierResolver";
import { invoiceCountsTowardSetup, resolveSetupSettlement, setupKeyFromLabel, setupResetAt } from "@/lib/setupSettlement";
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
  AlertTriangle,
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

  // White-label / add-on fields live on whichever billing row is authoritative
  // (portfolio row for portfolio members, property row otherwise) — `config`
  // already resolves that scope, so read them from there.
  const wlDomain = config as any;

  // A verified domain may live on the parent portfolio (shared by every member
  // property). Fall back to it so the card reflects the domain actually serving
  // this property's booking pages.
  const { data: inheritedWl } = useQuery({
    queryKey: ["admin-overview-inherited-wl", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_portfolio_members")
        .select("portfolio_id, property_portfolios:portfolio_id(name, white_label_domain, white_label_domain_status)")
        .eq("property_id", propertyId);
      const row = (data as any[] | null)
        ?.map((m) => m.property_portfolios)
        .find((p) => p?.white_label_domain);
      return row
        ? {
            domain: String(row.white_label_domain),
            status: (row.white_label_domain_status || "unconfigured") as string,
            portfolioName: row.name as string | null,
          }
        : null;
    },
    enabled: !!propertyId,
  });

  const { data: paymentModeRow } = useQuery({
    queryKey: ["admin-overview-payment-mode", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("payment_mode")
        .eq("id", propertyId)
        .maybeSingle();
      return data as { payment_mode?: string | null } | null;
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

  const { data: resolvedTier } = useQuery({
    queryKey: ["admin-overview-resolved-tier", propertyId],
    queryFn: () => resolvePropertyTier(propertyId),
    enabled: !!propertyId,
  });

  // Once-off (setup) fees are settled through once-off subscription invoices on
  // whichever entity owns the billing config — portfolio for members, property
  // otherwise. Used to mark the setup lines below as paid / still due.
  const { data: onceOffInvoices } = useQuery({
    queryKey: ["admin-overview-once-off-invoices", propertyId, scope.source, scope.portfolioId],
    queryFn: async () => {
      const q = supabase
        .from("subscription_invoices")
        .select("status, amount, paid_at, line_items, invoice_number, created_at")
        .eq("invoice_kind", "once_off");
      const { data } = scope.source === "portfolio" && scope.portfolioId
        ? await q.eq("portfolio_id", scope.portfolioId)
        : await q.eq("property_id", propertyId);
      return (data || []) as {
        status: string | null;
        amount: number | null;
        paid_at: string | null;
        line_items: unknown;
        created_at?: string | null;
      }[];
    },
    enabled: !!propertyId,
  });


  // Paid subscription invoices tell us what the payment gateway is actually
  // collecting each month, so a changed billing config can be flagged as drift.
  const { data: paidSubInvoices } = useQuery({
    queryKey: ["admin-overview-sub-invoices", propertyId, scope.source, scope.portfolioId],
    queryFn: async () => {
      const q = supabase
        .from("subscription_invoices")
        .select("status, amount, paid_at, created_at, invoice_kind")
        .eq("status", "paid")
        .neq("invoice_kind", "once_off");
      const { data } = scope.source === "portfolio" && scope.portfolioId
        ? await q.eq("portfolio_id", scope.portfolioId)
        : await q.eq("property_id", propertyId);
      return (data || []) as DriftInvoiceLike[];
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
  const byoEnabled =
    !!property?.allow_custom_payment_provider || Number((config as any)?.byo_gateway_monthly_fee ?? 0) > 0;
  // Reservation-only = neither the ROL facilitator nor a BYO gateway is enabled.
  const reservationOnly =
    paymentModeRow?.payment_mode === "reservation_only" ||
    (config != null && config.payment_facilitator_enabled === false && !byoEnabled);
  const facilitator = reservationOnly ? false : config?.payment_facilitator_enabled ?? !byoEnabled;
  const customProvider = !reservationOnly && byoEnabled;
  const wlAllowed = !!config?.white_label_allowed;
  const ownDomain = (wlDomain?.white_label_domain || "").trim?.() || null;
  const effectiveDomain = ownDomain || inheritedWl?.domain || null;
  const domainInherited = !ownDomain && !!inheritedWl?.domain;
  const wlStatus = ((domainInherited
    ? inheritedWl?.status
    : wlDomain?.white_label_domain_status) || "unconfigured") as keyof typeof DOMAIN_STATUS_META;
  const wlMeta = DOMAIN_STATUS_META[wlStatus] || DOMAIN_STATUS_META.unconfigured;
  const WlIcon = wlMeta.Icon;
  const activeReferral = referrals?.[0];


  // ── Estimated cost calculation (excludes commission / transaction fees) ──
  // Use `config` (property_billing_configs) as single source of truth; `wlDomain`
  // is the same row scoped to WL/domain fields.
  const c: any = config || {};
  const units = unitCount ?? 0;
  const costLines: { label: string; amount: number; once?: boolean; variable?: string }[] = [];
  const push = (label: string, amount: number | null | undefined, once = false) => {
    const n = Number(amount ?? 0);
    if (n > 0) costLines.push({ label, amount: n, once });
  };

  // PMS subscription — for tier-based strategies, resolve fee from room-count tiers;
  // otherwise fall back to any explicit subscription_fee_monthly on the config.
  if (isTierStrategy(strategy)) {
    const tierFee = resolvedTier?.effectiveMonthlyFee ?? null;
    const rooms = resolvedTier?.rooms ?? 0;
    const tierLabel = resolvedTier?.tier?.label ? ` — ${resolvedTier.tier.label.toUpperCase()}` : "";
    if (tierFee != null && tierFee > 0) {
      push(`PMS Subscription${tierLabel} (${rooms} room${rooms === 1 ? "" : "s"})`, tierFee);
    } else if (resolvedTier?.requiresCustomFee) {
      costLines.push({
        label: `PMS Subscription${tierLabel} — Enterprise (custom fee pending)`,
        amount: 0,
      });
    }
  } else {
    push(`Subscription (${STRATEGY_LABELS[strategy] ?? strategy})`, c.subscription_fee_monthly);
  }


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
  // Setup fees are once-off — always include when configured, regardless of activation state
  push("White-Label setup", c.white_label_setup_fee, true);

  // Branding add-on — free when bundled with White-label, otherwise billed
  if (!wlAllowed && c.branding_addon_enabled) {
    push("Branding add-on", c.branding_addon_monthly_fee);
  }
  push("Branding add-on setup", c.branding_addon_setup_fee, true);
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
  }
  push("PriceLabs setup", c.pricelabs_setup_fee, true);

  // BYO payment gateway monthly add-on (only when owner uses their own provider)
  if (customProvider) push("BYO payment gateway add-on", c.byo_gateway_monthly_fee);

  // ROL payment facilitator surcharge — per-booking, variable. Always surfaced
  // as a line item when ROL processes payments so the client cost picture is
  // complete (it never adds to the fixed monthly / setup totals).
  if (facilitator) {
    const surcharge = Number(c.transaction_fee_percentage ?? 0);
    costLines.push({
      label: "ROL payment facilitator surcharge",
      amount: 0,
      variable: surcharge > 0 ? `${surcharge}% / booking` : "rate not set",
    });
  }


  const monthlyTotal = costLines.filter((l) => !l.once).reduce((s, l) => s + l.amount, 0);
  const setupTotal = costLines.filter((l) => l.once).reduce((s, l) => s + l.amount, 0);
  const fmt = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  // Reconcile the contracted once-off fees against what has actually been paid.
  const settlement = resolveSetupSettlement(
    costLines.filter((l) => l.once).map((l) => ({ key: setupKeyFromLabel(l.label), amount: l.amount })),
    (onceOffInvoices || []).filter((inv) => invoiceCountsTowardSetup(inv, setupResetAt(config))),
  );
  const drift = detectSubscriptionDrift({
    contractedMonthlyFee: monthlyTotal,
    invoices: paidSubInvoices,
    pendingMonthlyFee: (config as any)?.pending_monthly_fee ?? null,
  });

  const paidOn = settlement.lastPaidAt
    ? new Date(settlement.lastPaidAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
    : null;

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
              <div className="flex items-center justify-end gap-2">
                <div className="text-lg font-semibold">
                  {fmt(settlement.reopened ? settlement.outstanding : setupTotal)}
                </div>
                {settlement.fullySettled && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Paid</Badge>
                )}
                {settlement.reopened && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Balance due</Badge>
                )}
              </div>
              {settlement.fullySettled && paidOn && (
                <div className="text-[11px] text-muted-foreground">Paid {paidOn}</div>
              )}
              {settlement.reopened && (
                <div className="text-[11px] text-muted-foreground">
                  {fmt(settlement.paidTotal)} of {fmt(settlement.contractedTotal)} already paid
                </div>
              )}
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
                    {l.once && (() => {
                      const st = settlement.byKey[setupKeyFromLabel(l.label)]?.state;
                      if (st === "paid") {
                        return <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">paid</Badge>;
                      }
                      if (st === "partial") {
                        return <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">part paid</Badge>;
                      }
                      return settlement.paidTotal > 0 ? (
                        <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">due</Badge>
                      ) : null;
                    })()}
                  </span>
                  <span className={l.variable ? "font-mono text-muted-foreground" : "font-mono"}>
                    {l.variable ?? fmt(l.amount)}
                  </span>
                </div>

              ))}
            </div>
          )}
          {settlement.reopened && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Setup fees changed after payment — a balance of {fmt(settlement.outstanding)} is invoiced separately.
            </p>
          )}
          {drift.drifting && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Subscription drift.</strong> {driftMessage(drift, fmt)}{" "}
                {drift.scheduled
                  ? "A plan change is already scheduled for the new amount."
                  : "Cancel the current subscription and schedule the new plan from the ROL Account page so the correct amount is collected."}
              </span>
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">
            Strategy: <span className="font-medium">{strategyLabel}</span>
            {strategy === "widget" && c.widget_flat_commission_rate != null
              ? ` · widget flat commission ${c.widget_flat_commission_rate}% (variable, not included)`
              : strategy === "widget"
              ? " · commission tiered by monthly volume (variable, not included)"
              : c.commission_rate != null && ` · commission ${(c as any).listing_commission_rate ?? c.commission_rate}% marketplace / ${(c as any).pms_commission_rate ?? 2}% direct (variable, not included)`}
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
            <>
              <Row
                label="Commission — marketplace"
                value={
                  (config as any)?.listing_commission_rate ?? config?.commission_rate != null
                    ? `${(config as any)?.listing_commission_rate ?? config?.commission_rate}%`
                    : <Empty />
                }
                hint="Applied to bookings that come through ROL's own OTA, journeys and itineraries."
              />
              <Row
                label="Commission — PMS / direct / white-label"
                value={
                  (config as any)?.pms_commission_rate != null
                    ? `${(config as any).pms_commission_rate}%`
                    : <span className="text-xs text-muted-foreground">2% (default)</span>
                }
                hint="Applied to bookings on the property's own surfaces (white-label site, embed, WordPress, API). Channel-sourced reservations carry no ROL commission."
              />
            </>
          )}

          <Row
            label="Subscription (monthly)"
            value={
              config?.subscription_fee_monthly != null ? (
                `R ${config.subscription_fee_monthly}`
              ) : isTierStrategy(strategy) && resolvedTier?.effectiveMonthlyFee != null ? (
                <span>
                  R {resolvedTier.effectiveMonthlyFee}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · tier {resolvedTier.tier?.label?.toUpperCase() ?? "—"} · {resolvedTier.rooms} room
                    {resolvedTier.rooms === 1 ? "" : "s"}
                  </span>
                </span>
              ) : isTierStrategy(strategy) && resolvedTier?.requiresCustomFee ? (
                <span className="text-xs text-muted-foreground">Enterprise — custom fee pending</span>
              ) : (
                <Empty />
              )
            }
            hint={isTierStrategy(strategy) ? "Resolved from the room-count tier table." : undefined}
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
              reservationOnly ? (
                <Badge variant="outline">None — reservation only</Badge>
              ) : customProvider ? (
                <Badge variant="default">Own provider</Badge>
              ) : facilitator ? (
                <Badge variant="secondary">Rooms Online PayFast</Badge>
              ) : (
                <Badge variant="outline">Not configured</Badge>
              )
            }
            hint={
              reservationOnly
                ? "No online payment is offered at checkout. The guest reserves and pays the property by bank transfer; the property marks it paid in ROL'OS."
                : customProvider
                ? "Owner configures credentials in ROL'OS → Integrations."
                : facilitator
                ? "Payment Facilitator fee applied on each transaction."
                : "Enable ROL facilitator surcharge or BYO gateway add-on in Billing."
            }
          />
          <Row
            label="Facilitator fee"
            value={
              reservationOnly ? (
                <Badge variant="outline">N/A — reservation only</Badge>
              ) : facilitator ? (
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
              effectiveDomain ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono">{effectiveDomain}</span>
                  {domainInherited && <Badge variant="outline">Portfolio</Badge>}
                </span>
              ) : (
                <Empty />
              )
            }
            hint={
              domainInherited
                ? `Inherited from ${inheritedWl?.portfolioName || "the parent portfolio"}.`
                : undefined
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
