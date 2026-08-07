import { memo, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Coins, Layers, Loader2, PackagePlus, ShieldCheck, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CancellationRule } from "@/lib/policyFormatter";

interface ChargeRow {
  id: string;
  name: string;
  calculation_method: string | null;
  amount: number | null;
  is_included_in_rate: boolean | null;
  applies_to_all_rooms: boolean | null;
  room_type_ids: string[] | null;
  room_charge_overrides: Record<string, number> | null;
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
  applicable_room_ids: string[] | null;
}

interface AddonRow {
  id?: string;
  name?: string;
  price?: number | string;
  amount?: number | string;
  basis?: string;
}

export interface ExtrasUnit {
  id: string;
  name: string;
}

const money = (n: number) => `R${Math.round(n).toLocaleString()}`;

/** Short "how much" label for a charge row, honouring any per-unit override. */
const chargeAmount = (c: ChargeRow, unitId?: string) => {
  const override = unitId ? Number(c.room_charge_overrides?.[unitId] ?? NaN) : NaN;
  const amount = Number.isFinite(override) ? override : Number(c.amount ?? 0);
  if (c.is_included_in_rate) return "incl.";
  if (!amount) return "—";
  return c.calculation_method?.includes("percent") ? `${amount}%` : money(amount);
};

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

/** Compact policy *name* (never the full terms text). */
const policyName = (rule: CancellationRule | null): string => {
  if (!rule) return "";
  if (rule.non_refundable) return "Non-refundable";
  const tiers = [...(rule.tiers ?? [])].sort((a, b) => b.days_before - a.days_before);
  const free = tiers.find((t) => t.forfeit_percent === 0);
  if (free) return `Flexible · free to ${free.days_before}d`;
  if (tiers.length > 0) return `Tiered · from ${tiers[tiers.length - 1].forfeit_percent}% forfeit`;
  if (rule.mode === "dynamic") return "Dynamic policy";
  return "Custom policy";
};

/** Does this scoped list target the unit? Empty / all-rooms means every unit. */
const targetsUnit = (ids: string[] | null | undefined, allRooms: boolean | null | undefined, unitId: string) => {
  if (allRooms) return true;
  if (!ids || ids.length === 0) return true;
  return ids.includes(unitId);
};

const Chip = ({
  label,
  value,
  muted,
}: {
  label: string;
  value?: string;
  muted?: boolean;
}) => (
  <span
    className={`inline-flex max-w-full items-baseline gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-none ${
      muted ? "border-dashed text-muted-foreground" : "bg-muted/40"
    }`}
  >
    <span className="truncate" title={label}>{label}</span>
    {value && <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{value}</span>}
  </span>
);

const ColHead = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
    {icon}
    <span className="truncate">{label}</span>
  </div>
);

/**
 * Per-unit commercial summary shown above the rate plan cards: for each unit, the
 * charges, specials, add-ons and cancellation policy name that shape its final bill.
 * Charges/specials scoped to specific units only appear on those units.
 * Read-only — each item is authored on its own tab.
 */
export const RatePlanExtrasSummary = memo(function RatePlanExtrasSummary({
  propertyId,
  units,
}: {
  propertyId: string;
  units: ExtrasUnit[];
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
          .select("id, name, calculation_method, amount, is_included_in_rate, applies_to_all_rooms, room_type_ids, room_charge_overrides")
          .eq("property_id", propertyId)
          .eq("is_active", true)
          .order("display_order"),
        supabase
          .from("property_specials")
          .select("id, name, special_type, discount_percent, fixed_amount, fixed_price, valid_from, valid_to, applicable_room_ids")
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

  const liveSpecials = useMemo(() => specials.filter((s) => inWindow(s.valid_from, s.valid_to)), [specials]);
  const policyLabel = useMemo(() => policyName(cancellation), [cancellation]);

  /** Deduplicated unit list (same collapse rule as the rate matrix). */
  const visibleUnits = useMemo(() => {
    const seen = new Set<string>();
    return units.filter((u) => {
      const key = (u.name || u.id).trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [units]);

  const rows = useMemo(
    () =>
      visibleUnits.map((u) => ({
        unit: u,
        charges: charges.filter((c) => targetsUnit(c.room_type_ids, c.applies_to_all_rooms, u.id)),
        specials: liveSpecials.filter((s) => targetsUnit(s.applicable_room_ids, false, u.id)),
      })),
    [visibleUnits, charges, liveSpecials],
  );

  if (loading) {
    return (
      <div className="flex h-14 items-center justify-center rounded-md border bg-muted/20">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-[minmax(90px,1fr)_2fr_1.5fr_1.5fr_1.2fr] gap-2 border-b bg-muted/30 px-2 py-1.5">
        <ColHead icon={<Layers className="h-3 w-3" />} label="Unit" />
        <ColHead icon={<Coins className="h-3 w-3" />} label="Charges" />
        <ColHead icon={<Tag className="h-3 w-3" />} label="Specials" />
        <ColHead icon={<PackagePlus className="h-3 w-3" />} label="Add-ons" />
        <ColHead icon={<ShieldCheck className="h-3 w-3" />} label="Cancellation" />
      </div>
      {rows.map(({ unit, charges: unitCharges, specials: unitSpecials }) => (
        <div
          key={unit.id}
          className="grid grid-cols-[minmax(90px,1fr)_2fr_1.5fr_1.5fr_1.2fr] items-start gap-2 border-b px-2 py-1.5 last:border-b-0 hover:bg-muted/20"
        >
          <div className="min-w-0 truncate pt-0.5 text-[11px] font-semibold uppercase tracking-wide" title={unit.name}>
            {unit.name}
          </div>

          <div className="flex min-w-0 flex-wrap gap-1">
            {unitCharges.length === 0 ? (
              <Chip label="No charges" muted />
            ) : (
              <>
                {unitCharges.slice(0, 4).map((c) => (
                  <Chip key={c.id} label={c.name} value={chargeAmount(c, unit.id)} />
                ))}
                {unitCharges.length > 4 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="h-[18px] px-1 text-[10px] font-normal">
                        +{unitCharges.length - 4}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[240px] text-xs">
                      {unitCharges.slice(4).map((c) => `${c.name} ${chargeAmount(c, unit.id)}`).join(" · ")}
                    </TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </div>

          <div className="flex min-w-0 flex-wrap gap-1">
            {unitSpecials.length === 0 ? (
              <Chip label="None live" muted />
            ) : (
              unitSpecials.slice(0, 3).map((s) => <Chip key={s.id} label={s.name} value={specialValue(s)} />)
            )}
            {unitSpecials.length > 3 && (
              <Badge variant="outline" className="h-[18px] px-1 text-[10px] font-normal">
                +{unitSpecials.length - 3}
              </Badge>
            )}
          </div>

          <div className="flex min-w-0 flex-wrap gap-1">
            {addons.length === 0 ? (
              <Chip label="No add-ons" muted />
            ) : (
              addons.slice(0, 3).map((a, i) => {
                const price = Number(a.price ?? a.amount ?? 0);
                return (
                  <Chip
                    key={a.id ?? `${a.name}-${i}`}
                    label={a.name || "Add-on"}
                    value={price > 0 ? money(price) : undefined}
                  />
                );
              })
            )}
            {addons.length > 3 && (
              <Badge variant="outline" className="h-[18px] px-1 text-[10px] font-normal">
                +{addons.length - 3}
              </Badge>
            )}
          </div>

          <div className="min-w-0">
            {policyLabel ? <Chip label={policyLabel} /> : <Chip label="Not configured" muted />}
          </div>
        </div>
      ))}
    </div>
  );
});
