import { memo, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Coins, Loader2, PackagePlus, ShieldCheck, Tag } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CancellationRule } from "@/lib/policyFormatter";

interface ChargeRow {
  id: string;
  name: string;
  calculation_method: string | null;
  amount: number | null;
  is_included_in_rate: boolean | null;
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
}

interface AddonRow {
  id?: string;
  name?: string;
  price?: number | string;
  amount?: number | string;
  basis?: string;
}

const money = (n: number) => `R${Math.round(n).toLocaleString()}`;

const chargeAmount = (c: ChargeRow) => {
  const amount = Number(c.amount ?? 0);
  if (c.is_included_in_rate) return "incl.";
  if (!amount) return "";
  return c.calculation_method?.includes("percent") ? `${amount}%` : money(amount);
};

const specialValue = (s: SpecialRow) => {
  if (s.discount_percent) return `${s.discount_percent}% off`;
  if (s.fixed_amount) return `${money(Number(s.fixed_amount))} off`;
  if (s.fixed_price) return money(Number(s.fixed_price));
  return s.special_type ?? "Special";
};

const addonValue = (a: AddonRow) => {
  const amount = Number(a.price ?? a.amount ?? 0);
  return amount ? money(amount) : "";
};

const inWindow = (from: string | null, to: string | null) => {
  const today = new Date().toISOString().slice(0, 10);
  if (from && from > today) return false;
  if (to && to < today) return false;
  return true;
};

/** Authored policy name when present, otherwise a short derived label. */
const policyName = (rule: (CancellationRule & { name?: string; policy_name?: string }) | null): string => {
  if (!rule) return "None";
  if (rule.name) return rule.name;
  if (rule.policy_name) return rule.policy_name;
  if (rule.non_refundable) return "Non-refundable";
  const tiers = [...(rule.tiers ?? [])].sort((a, b) => b.days_before - a.days_before);
  const free = tiers.find((t) => t.forfeit_percent === 0);
  if (free) return `Flexible · free to ${free.days_before}d`;
  if (tiers.length > 0) return "Tiered policy";
  if (rule.mode === "dynamic") return "Dynamic policy";
  return "Custom policy";
};

/** One label + full list of values, wrapped so everything is visible at a glance. */
const Line = ({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
}) => (
  <div className="flex min-w-0 items-baseline gap-1.5 text-[11px] leading-tight">
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
      {icon}
      <span className="font-medium">{label}:</span>
    </span>
    <span className="min-w-0 text-foreground">
      {items.length === 0 ? <span className="text-muted-foreground">None</span> : items.join(" · ")}
    </span>
  </div>
);

};

/**
 * Property-level commercial summary shown inside each rate plan card header:
 * the charges, live specials, add-ons and cancellation policy name that apply
 * on top of the nightly rates. These are authored at property level (the
 * property is the driver — individual units carry no separate specifics),
 * so this is deliberately not a per-unit table.
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
          .select("id, name, calculation_method, amount, is_included_in_rate")
          .eq("property_id", propertyId)
          .eq("is_active", true)
          .order("display_order"),
        supabase
          .from("property_specials")
          .select("id, name, special_type, discount_percent, fixed_amount, fixed_price, valid_from, valid_to")
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
      setCharges((chargesRes.data ?? []) as unknown as ChargeRow[]);
      setSpecials((specialsRes.data ?? []) as unknown as SpecialRow[]);
      const amenities = (propRes.data?.amenities ?? {}) as { addons?: AddonRow[] };
      setAddons(Array.isArray(amenities.addons) ? amenities.addons : []);
      setCancellation((policyRes.data?.rule ?? null) as CancellationRule | null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const chargeLabels = useMemo(
    () => charges.map((c) => [c.name, chargeAmount(c)].filter(Boolean).join(" ")),
    [charges],
  );
  const specialLabels = useMemo(
    () => specials.filter((s) => inWindow(s.valid_from, s.valid_to)).map((s) => `${s.name} ${specialValue(s)}`.trim()),
    [specials],
  );
  const addonLabels = useMemo(
    () => addons.map((a) => [a.name || "Add-on", addonValue(a)].filter(Boolean).join(" ")),
    [addons],
  );
  const policyLabel = useMemo(() => policyName(cancellation), [cancellation]);

  if (loading) {
    return (
      <div className="flex h-10 items-center justify-center">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-0.5">
      <Line icon={<Coins className="h-3 w-3" />} label="Charges" items={chargeLabels} />
      <Line icon={<Tag className="h-3 w-3" />} label="Specials" items={specialLabels} />
      <Line icon={<PackagePlus className="h-3 w-3" />} label="Add-ons" items={addonLabels} />
      <Line icon={<ShieldCheck className="h-3 w-3" />} label="Cancellation" items={policyLabel ? [policyLabel] : []} max={1} />
    </div>
  );
});
