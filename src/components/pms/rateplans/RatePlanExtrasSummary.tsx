import { memo, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Coins, Loader2, PackagePlus, ShieldCheck, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toHumanSummary } from "@/lib/cancellationPolicy";
import type { CancellationRule } from "@/lib/policyFormatter";

interface ChargeRow {
  id: string;
  name: string;
  category: string | null;
  calculation_method: string | null;
  amount: number | null;
  is_included_in_rate: boolean | null;
  is_active: boolean | null;
}

interface SpecialRow {
  id: string;
  name: string;
  special_type: string | null;
  discount_percent: number | null;
  fixed_amount: number | null;
  fixed_price: number | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean | null;
}

interface AddonRow {
  id?: string;
  name?: string;
  price?: number | string;
  amount?: number | string;
  basis?: string;
}

const money = (n: number) => `R${Math.round(n).toLocaleString()}`;

/** Short "how much" label for a charge row. */
const chargeAmount = (c: ChargeRow) => {
  const amount = Number(c.amount ?? 0);
  if (!amount) return "—";
  return c.calculation_method?.includes("percent") ? `${amount}%` : money(amount);
};

/** Short "how much off" label for a special. */
const specialValue = (s: SpecialRow) => {
  if (s.discount_percent) return `${s.discount_percent}% off`;
  if (s.fixed_amount) return `${money(Number(s.fixed_amount))} off`;
  if (s.fixed_price) return money(Number(s.fixed_price));
  return s.special_type ?? "Special";
};

const inWindow = (from: string | null, to: string | null) => {
  const today = new Date().toISOString().slice(0, 10);
  if (from && from > today) return false;
  if (to && to < today) return false;
  return true;
};

const Tile = ({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) => (
  <div className="min-w-0 rounded-md border bg-muted/20 p-2">
    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {icon}
      <span className="truncate">{title}</span>
      {count !== undefined && (
        <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px] font-normal">
          {count}
        </Badge>
      )}
    </div>
    <div className="space-y-0.5 text-[11px] leading-tight">{children}</div>
  </div>
);

const Empty = ({ label }: { label: string }) => (
  <p className="italic text-muted-foreground/70">{label}</p>
);

/**
 * Property-level commercial summary shown above the rate plan cards: the charges,
 * specials, add-ons and cancellation terms that apply on top of the nightly rates.
 * Read-only — each item is authored on its own tab.
 */
export const RatePlanExtrasSummary = memo(function RatePlanExtrasSummary({
  propertyId,
}: {
  propertyId: string;
}) {
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [specials, setSpecials] = useState<SpecialRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [cancellation, setCancellation] = useState<CancellationRule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [chargesRes, specialsRes, propRes, policyRes] = await Promise.all([
        supabase
          .from("property_charges")
          .select("id, name, category, calculation_method, amount, is_included_in_rate, is_active")
          .eq("property_id", propertyId)
          .eq("is_active", true)
          .order("display_order"),
        supabase
          .from("property_specials")
          .select("id, name, special_type, discount_percent, fixed_amount, fixed_price, valid_from, valid_to, is_active")
          .eq("property_id", propertyId)
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("properties").select("amenities").eq("id", propertyId).maybeSingle(),
        supabase
          .from("rolos_policies")
          .select("rule")
          .eq("property_id", propertyId)
          .eq("policy_type", "cancellation")
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setCharges((chargesRes.data ?? []) as ChargeRow[]);
      setSpecials((specialsRes.data ?? []) as SpecialRow[]);
      const amenities = (propRes.data?.amenities ?? {}) as { addons?: AddonRow[] };
      setAddons(Array.isArray(amenities.addons) ? amenities.addons : []);
      setCancellation((policyRes.data?.rule ?? null) as CancellationRule | null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const liveSpecials = useMemo(() => specials.filter((s) => inWindow(s.valid_from, s.valid_to)), [specials]);
  const cancellationText = useMemo(
    () => (cancellation ? toHumanSummary(cancellation) : ""),
    [cancellation],
  );

  if (loading) {
    return (
      <div className="flex h-16 items-center justify-center rounded-md border bg-muted/20">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <Tile icon={<Coins className="h-3 w-3" />} title="Charges" count={charges.length}>
        {charges.length === 0 ? (
          <Empty label="No charges configured" />
        ) : (
          charges.slice(0, 4).map((c) => (
            <div key={c.id} className="flex items-baseline justify-between gap-2">
              <span className="truncate" title={c.name}>{c.name}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {c.is_included_in_rate ? "incl." : chargeAmount(c)}
              </span>
            </div>
          ))
        )}
        {charges.length > 4 && (
          <p className="text-muted-foreground/70">+{charges.length - 4} more</p>
        )}
      </Tile>

      <Tile icon={<Tag className="h-3 w-3" />} title="Specials" count={liveSpecials.length}>
        {liveSpecials.length === 0 ? (
          <Empty label={specials.length > 0 ? "None live right now" : "No specials configured"} />
        ) : (
          liveSpecials.slice(0, 4).map((s) => (
            <div key={s.id} className="flex items-baseline justify-between gap-2">
              <span className="truncate" title={s.name}>{s.name}</span>
              <span className="shrink-0 text-muted-foreground">{specialValue(s)}</span>
            </div>
          ))
        )}
        {liveSpecials.length > 4 && (
          <p className="text-muted-foreground/70">+{liveSpecials.length - 4} more</p>
        )}
      </Tile>

      <Tile icon={<PackagePlus className="h-3 w-3" />} title="Add-ons" count={addons.length}>
        {addons.length === 0 ? (
          <Empty label="No add-ons configured" />
        ) : (
          addons.slice(0, 4).map((a, i) => {
            const price = Number(a.price ?? a.amount ?? 0);
            return (
              <div key={a.id ?? `${a.name}-${i}`} className="flex items-baseline justify-between gap-2">
                <span className="truncate" title={a.name}>{a.name || "Add-on"}</span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {price > 0 ? money(price) : "—"}
                </span>
              </div>
            );
          })
        )}
        {addons.length > 4 && <p className="text-muted-foreground/70">+{addons.length - 4} more</p>}
      </Tile>

      <Tile icon={<ShieldCheck className="h-3 w-3" />} title="Cancellation policy">
        {cancellationText ? (
          <p className="line-clamp-3 text-muted-foreground" title={cancellationText}>
            {cancellationText}
          </p>
        ) : (
          <Empty label="No cancellation policy configured" />
        )}
      </Tile>
    </div>
  );
});
