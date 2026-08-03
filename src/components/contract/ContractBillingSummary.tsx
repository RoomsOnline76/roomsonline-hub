import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveBillingContractVariables,
  type BillingContractVariables,
} from "@/lib/contractBillingVariables";
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
}

interface PropertySummary {
  propertyId: string;
  name: string;
  strategyLabel: string;
  scope: "portfolio" | "property" | "global";
  portfolioName: string;
  onceOff: LineItem[];
  monthly: LineItem[];
  commissions: LineItem[];
}

const money = (v: number) =>
  `R${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isNA = (clause: string | undefined) => !clause || clause.trim().startsWith("<!--");

const numOf = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Turn resolved contract variables into a plain fees breakdown. */
function toSummary(
  propertyId: string,
  name: string,
  vars: BillingContractVariables,
): PropertySummary {
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
      label: "ROL'OS PMS subscription (tiered)",
      amount: tierFee,
      note: vars.tier_room_count ? `${vars.tier_room_count} rooms` : undefined,
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
    monthly.push({ label: "PriceLabs revenue management", amount: plMonthly });
  }
  const cmFee = numOf(vars.channel_manager_per_unit_fee);
  if (!isNA(vars.channel_manager_clause) && cmFee) {
    monthly.push({ label: "Channel management", amount: cmFee, note: "per bookable unit" });
  }
  const byoFee = numOf(vars.byo_gateway_fee);
  if (!isNA(vars.byo_gateway_clause) && byoFee) {
    monthly.push({ label: "BYO gateway integration", amount: byoFee });
  }
  const entFee = numOf(vars.enterprise_fee);
  if (entFee) {
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
  if (!isNA(vars.payment_facilitator_clause)) {
    commissions.push({
      label: "Payment facilitation fee",
      amount: null,
      note: `${vars.payment_facilitator_fee}% of amount processed`,
    });
  }

  return {
    propertyId,
    name,
    strategyLabel: vars.billing_strategy_label,
    scope: vars.scope,
    portfolioName: vars.portfolio_name,
    onceOff,
    monthly,
    commissions,
  };
}

/**
 * Pre-send review panel: shows the saved, property-specific billing figures that
 * will be embedded into the contract for every covered property.
 */
export function ContractBillingSummary({ propertyIds, propertyNames }: Props) {
  const [loading, setLoading] = useState(false);
  const [summaries, setSummaries] = useState<PropertySummary[]>([]);
  const idKey = useMemo(() => propertyIds.filter(Boolean).join(","), [propertyIds]);

  useEffect(() => {
    const ids = idKey ? idKey.split(",") : [];
    if (!ids.length) {
      setSummaries([]);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        let names: Record<string, string> = { ...(propertyNames || {}) };
        const missing = ids.filter((id) => !names[id]);
        if (missing.length) {
          const { data } = await supabase
            .from("properties")
            .select("id, name")
            .in("id", missing);
          for (const row of data || []) names[row.id] = row.name as string;
        }

        const resolved = await Promise.all(
          ids.map(async (id) => {
            const vars = await resolveBillingContractVariables([id]);
            return toSummary(id, names[id] || "Unnamed property", vars);
          }),
        );
        if (!cancelled) setSummaries(resolved);
      } catch (e) {
        console.error("[ContractBillingSummary] resolution failed", e);
        if (!cancelled) setSummaries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [idKey, propertyNames]);

  const totals = useMemo(() => {
    const onceOff = summaries.reduce(
      (sum, s) => sum + s.onceOff.reduce((a, l) => a + (l.amount || 0), 0),
      0,
    );
    const monthly = summaries.reduce(
      (sum, s) =>
        sum +
        s.monthly
          .filter((l) => !l.note?.includes("per bookable unit"))
          .reduce((a, l) => a + (l.amount || 0), 0),
      0,
    );
    return { onceOff, monthly };
  }, [summaries]);

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

      {!loading && summaries.length === 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> No billing configuration resolved yet.
        </p>
      )}

      {summaries.length > 1 && (
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

      <div className="space-y-3 max-h-[280px] overflow-y-auto">
        {summaries.map((s) => {
          const onceOffTotal = s.onceOff.reduce((a, l) => a + (l.amount || 0), 0);
          const monthlyTotal = s.monthly
            .filter((l) => !l.note?.includes("per bookable unit"))
            .reduce((a, l) => a + (l.amount || 0), 0);

          return (
            <div
              key={s.propertyId}
              className="rounded-md border border-border bg-background p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.strategyLabel}</p>
                </div>
                <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                  {s.scope === "portfolio"
                    ? `Portfolio${s.portfolioName ? `: ${s.portfolioName}` : ""}`
                    : s.scope === "property"
                      ? "Property config"
                      : "Global defaults"}
                </Badge>
              </div>

              <Section
                icon={<Receipt className="h-3 w-3" />}
                title="Once-off fees"
                items={s.onceOff}
                total={onceOffTotal ? money(onceOffTotal) : undefined}
                emptyLabel="None"
              />
              <Section
                icon={<CalendarClock className="h-3 w-3" />}
                title="Monthly recurring"
                items={s.monthly}
                total={monthlyTotal ? `${money(monthlyTotal)}/mo` : undefined}
                emptyLabel="None"
              />
              <Section
                icon={<Percent className="h-3 w-3" />}
                title="Commissions & transaction fees"
                items={s.commissions}
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
