import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveBillingContractVariables,
  type BillingContractVariables,
} from "@/lib/contractBillingVariables";
import { getPropertyRoomCount } from "@/lib/billingTierResolver";
import { Badge } from "@/components/ui/badge";
import { Loader2, Receipt, CalendarClock, Percent, AlertCircle } from "lucide-react";

interface Props {
  /** Properties the contract will cover. */
  propertyIds: string[];
  /** Optional pre-known names (avoids a lookup). */
  propertyNames?: Record<string, string>;
}

interface LineItem {
  label: string;
  amount: number | null;
  note?: string;
  /** Excluded from monthly totals (informational only). */
  informational?: boolean;
}

interface BillingBlock {
  key: string;
  /** Heading — portfolio name, or the property name in per-property mode. */
  title: string;
  subtitle: string;
  strategyLabel: string;
  /** Agreed payment model label, shown as its own row. */
  paymentModelLabel: string;
  scope: "portfolio" | "property" | "global";
  onceOff: LineItem[];
  monthly: LineItem[];
  commissions: LineItem[];
  coveredProperties: { id: string; name: string; units: number }[];
}

const money = (v: number) =>
  `R${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isNA = (clause: string | undefined) => !clause || clause.trim().startsWith("<!--");

const numOf = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const sumMonthly = (items: LineItem[]) =>
  items.filter((l) => !l.informational).reduce((a, l) => a + (l.amount || 0), 0);

/**
 * Build a fees breakdown from resolved contract variables.
 * `units` = total bookable units in scope, `propertyCount` = properties in scope.
 */
function buildBlock(
  key: string,
  title: string,
  subtitle: string,
  vars: BillingContractVariables,
  covered: { id: string; name: string; units: number }[],
): BillingBlock {
  const units = covered.reduce((a, p) => a + p.units, 0);
  const propertyCount = Math.max(covered.length, 1);
  const onceOff: LineItem[] = [];
  const monthly: LineItem[] = [];
  const commissions: LineItem[] = [];

  // ── Once-off ───────────────────────────────────────────────────────────
  const wlSetup = numOf(vars.white_label_setup_fee);
  if (!isNA(vars.white_label_clause) && wlSetup) {
    onceOff.push({ label: "White-label setup", amount: wlSetup });
  }
  const brandSetup = numOf(vars.branding_addon_setup_fee);
  if (!isNA(vars.branding_addon_clause) && brandSetup) {
    onceOff.push({ label: "Branding add-on setup", amount: brandSetup });
  }
  const plSetup = numOf(vars.pricelabs_setup_fee);
  if (!isNA(vars.pricelabs_clause) && plSetup) {
    onceOff.push({ label: "PriceLabs onboarding", amount: plSetup });
  }

  // ── Monthly recurring ──────────────────────────────────────────────────
  const tierFee = numOf(vars.tier_monthly_fee);
  if (tierFee) {
    monthly.push({
      label: "ROL'OS PMS subscription",
      amount: tierFee,
      note: `${vars.tier_room_count || units} rooms/units`,
    });
  }
  const subFee = numOf(vars.subscription_fee_monthly);
  if (subFee && !tierFee) {
    monthly.push({ label: "Platform subscription", amount: subFee });
  }
  const wlMonthly = numOf(vars.white_label_monthly_fee);
  if (!isNA(vars.white_label_clause) && wlMonthly) {
    monthly.push({
      label: "White-label licence",
      amount: wlMonthly,
      note: vars.white_label_billing_mode === "annual" ? "billed annually" : undefined,
    });
  }
  const brandMonthly = numOf(vars.branding_addon_monthly_fee);
  if (!isNA(vars.branding_addon_clause) && brandMonthly) {
    monthly.push({ label: "Branding add-on", amount: brandMonthly });
  }
  const plMonthly = numOf(vars.pricelabs_monthly_fee);
  if (!isNA(vars.pricelabs_clause) && plMonthly) {
    monthly.push({
      label: "PriceLabs revenue management",
      amount: plMonthly * propertyCount,
      note:
        propertyCount > 1
          ? `${propertyCount} properties × ${money(plMonthly)}`
          : "per property",
    });
  }
  const cmFee = numOf(vars.channel_manager_per_unit_fee);
  if (!isNA(vars.channel_manager_clause) && cmFee) {
    monthly.push({
      label: "Channel management",
      amount: units > 0 ? cmFee * units : null,
      note:
        units > 0
          ? `${units} units × ${money(cmFee)}`
          : `${money(cmFee)} per unit — unit count unavailable`,
      informational: units === 0,
    });
  }
  const byoFee = numOf(vars.byo_gateway_fee);
  if (!isNA(vars.byo_gateway_clause) && byoFee) {
    monthly.push({ label: "BYO gateway integration", amount: byoFee });
  }
  // Enterprise licence only applies under an enterprise strategy — a stale
  // custom fee on any other strategy is ignored.
  const entFee = numOf(vars.enterprise_fee);
  if (entFee && /enterprise/i.test(vars.billing_strategy_label)) {
    monthly.push({ label: "Enterprise licence", amount: entFee });
  }

  // ── Commissions ────────────────────────────────────────────────────────
  if (!isNA(vars.listing_commission_clause)) {
    commissions.push({
      label: "ROL marketplace & journey bookings",
      amount: null,
      note: vars.listing_commission_rate,
    });
  }
  if (!isNA(vars.pms_commission_clause)) {
    commissions.push({
      label: "Own surfaces (direct, white-label, widget, API)",
      amount: null,
      note: vars.pms_commission_rate,
    });
  }
  if (!isNA(vars.widget_flat_commission_clause)) {
    commissions.push({
      label: "Web Booking Engine (flat)",
      amount: null,
      note: vars.widget_flat_commission_rate,
    });
  }
  if (!isNA(vars.reservation_only_clause)) {
    commissions.push({
      label: "Reservation only — no online payment",
      amount: null,
      note: "Guest pays the property directly; commission invoiced monthly",
    });
  }
  if (!isNA(vars.payment_facilitator_clause)) {
    // When a versioned gateway schedule applies, quote it verbatim — that is
    // what the contract and the invoice run will both use.
    const schedulePct = numOf(vars.billing_percentage);
    const scheduleFee = numOf(vars.billing_fixed_fee);
    const scheduled = !isNA(vars.billing_model) && schedulePct != null;
    commissions.push({
      label: "Payment processing fee",
      amount: null,
      note: scheduled
        ? `${vars.billing_model}${vars.billing_config_version ? ` v${vars.billing_config_version}` : ""} — ${schedulePct}% of amount processed${
            scheduleFee ? ` + ${money(scheduleFee)} per transaction` : ""
          }`
        : `${vars.payment_facilitator_fee}% of amount processed`,
    });
    if (scheduled && !isNA(vars.billing_volume_tiers_summary)) {
      commissions.push({
        label: "Volume bands",
        amount: null,
        note: vars.billing_volume_tiers_summary,
      });
    }
  }
  const platformFee = numOf(vars.billing_monthly_fee);
  if (!isNA(vars.billing_model) && platformFee) {
    monthly.push({ label: "Gateway platform fee", amount: platformFee });
  }


  return {
    key,
    title,
    subtitle,
    strategyLabel: vars.billing_strategy_label,
    paymentModelLabel: vars.payment_model_label,
    scope: vars.scope,
    onceOff,
    monthly,
    commissions,
    coveredProperties: covered,
  };
}

/**
 * Pre-send review panel: shows the saved billing figures that will be embedded
 * into the contract. Portfolio-billed properties are summarised once, combined
 * across the portfolio (per-unit fees multiplied by total units).
 */
export function ContractBillingSummary({ propertyIds, propertyNames }: Props) {
  const [loading, setLoading] = useState(false);
  const [blocks, setBlocks] = useState<BillingBlock[]>([]);
  const idKey = useMemo(() => propertyIds.filter(Boolean).join(","), [propertyIds]);

  useEffect(() => {
    const ids = idKey ? idKey.split(",") : [];
    if (!ids.length) {
      setBlocks([]);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const names: Record<string, string> = { ...(propertyNames || {}) };
        const missing = ids.filter((id) => !names[id]);
        if (missing.length) {
          const { data } = await supabase.from("properties").select("id, name").in("id", missing);
          for (const row of data || []) names[row.id] = row.name as string;
        }

        const unitCounts = await Promise.all(
          ids.map(async (id) => ({
            id,
            name: names[id] || "Unnamed property",
            units: await getPropertyRoomCount(id).catch(() => 0),
          })),
        );
        const unitFor = (id: string) => unitCounts.find((u) => u.id === id)!;

        // Resolve once for the whole set to learn the billing scope.
        const combined = await resolveBillingContractVariables(ids);

        let next: BillingBlock[];
        if (combined.scope === "portfolio") {
          next = [
            buildBlock(
              "portfolio",
              combined.portfolio_name || "Portfolio",
              `Combined portfolio billing · ${ids.length} ${ids.length === 1 ? "property" : "properties"}`,
              combined,
              unitCounts,
            ),
          ];
        } else {
          const perProperty = await Promise.all(
            ids.map(async (id) => {
              const vars = await resolveBillingContractVariables([id]);
              return buildBlock(id, unitFor(id).name, "Property billing", vars, [unitFor(id)]);
            }),
          );
          next = perProperty;
        }

        if (!cancelled) setBlocks(next);
      } catch (e) {
        console.error("[ContractBillingSummary] resolution failed", e);
        if (!cancelled) setBlocks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [idKey, propertyNames]);

  const totals = useMemo(() => {
    const onceOff = blocks.reduce(
      (sum, b) => sum + b.onceOff.reduce((a, l) => a + (l.amount || 0), 0),
      0,
    );
    const monthly = blocks.reduce((sum, b) => sum + sumMonthly(b.monthly), 0);
    return { onceOff, monthly };
  }, [blocks]);

  if (!idKey) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          Billing embedded in this contract
        </p>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {!loading && blocks.length === 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> No billing configuration resolved yet.
        </p>
      )}

      {blocks.length > 1 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-border bg-background p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total once-off
            </p>
            <p className="text-sm font-semibold">{money(totals.onceOff)}</p>
          </div>
          <div className="rounded-md border border-border bg-background p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total monthly
            </p>
            <p className="text-sm font-semibold">{money(totals.monthly)}</p>
          </div>
        </div>
      )}

      <div className="space-y-3 max-h-[320px] overflow-y-auto">
        {blocks.map((b) => {
          const onceOffTotal = b.onceOff.reduce((a, l) => a + (l.amount || 0), 0);
          const monthlyTotal = sumMonthly(b.monthly);
          const totalUnits = b.coveredProperties.reduce((a, p) => a + p.units, 0);

          return (
            <div key={b.key} className="rounded-md border border-border bg-background p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{b.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.strategyLabel} · {b.subtitle} · {totalUnits} units
                  </p>
                  {b.paymentModelLabel && (
                    <p className="text-xs text-muted-foreground">
                      Payment model: <span className="font-medium">{b.paymentModelLabel}</span>
                    </p>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                  {b.scope === "portfolio"
                    ? "Portfolio billing"
                    : b.scope === "property"
                      ? "Property config"
                      : "Global defaults"}
                </Badge>
              </div>

              {b.scope === "portfolio" && b.coveredProperties.length > 0 && (
                <ul className="text-[11px] text-muted-foreground space-y-0.5">
                  {b.coveredProperties.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span className="truncate">• {p.name}</span>
                      <span className="flex-shrink-0">
                        {p.units} {p.units === 1 ? "unit" : "units"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <Section
                icon={<Receipt className="h-3 w-3" />}
                title="Once-off fees"
                items={b.onceOff}
                total={onceOffTotal ? money(onceOffTotal) : undefined}
                emptyLabel="None"
              />
              <Section
                icon={<CalendarClock className="h-3 w-3" />}
                title="Monthly recurring"
                items={b.monthly}
                total={monthlyTotal ? `${money(monthlyTotal)}/mo` : undefined}
                emptyLabel="None"
              />
              <Section
                icon={<Percent className="h-3 w-3" />}
                title="Commissions & transaction fees"
                items={b.commissions}
                emptyLabel="No commission levied"
              />
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        These are the saved figures that will be written into the contract when it is sent.
        Adjust them in Edit Property → Billing before sending if anything is wrong.
      </p>
    </div>
  );
}

function Section({
  icon,
  title,
  items,
  total,
  emptyLabel,
}: {
  icon: React.ReactNode;
  title: string;
  items: LineItem[];
  total?: string;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          {icon} {title}
        </p>
        {total && <span className="text-xs font-semibold">{total}</span>}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground min-w-0 truncate">
                {l.label}
                {l.amount !== null && l.note ? ` (${l.note})` : ""}
              </span>
              <span className="font-medium flex-shrink-0">
                {l.amount !== null ? money(l.amount) : l.note}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ContractBillingSummary;
