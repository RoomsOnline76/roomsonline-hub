/**
 * ROL'OS Packages — bundled offers (accommodation + extras).
 *
 * A package expands into folio-ready lines that are already tagged with a
 * revenue stream, so the F&B / accommodation split stays accurate whether the
 * extra is included in the rate or added on top.
 */
import type { RevenueStream } from "@/components/charges/ChargeCalculator";

export type PackageComponentType =
  | "accommodation"
  | "breakfast"
  | "lunch"
  | "dinner"
  | "activity"
  | "transfer"
  | "spa"
  | "other";

export type PackageValueType = "amount" | "percentage";

export type PackageQuantityBasis =
  | "per_stay"
  | "per_night"
  | "per_person"
  | "per_person_per_night"
  | "per_room_per_night";

export interface RolosPackage {
  id: string;
  property_id: string;
  name: string;
  code: string | null;
  description: string | null;
  base_rate_plan_id: string | null;
  image_url: string | null;
  is_active: boolean;
  sell_standalone: boolean;
  min_nights: number;
  max_nights: number;
  display_order: number;
}

export interface RolosPackageComponent {
  id: string;
  package_id: string;
  name: string;
  component_type: PackageComponentType;
  value_type: PackageValueType;
  amount: number;
  revenue_stream: RevenueStream;
  quantity_basis: PackageQuantityBasis;
  quantity: number;
  is_included_in_rate: boolean;
  description: string | null;
  display_order: number;
}

export interface PackageContext {
  /** Accommodation subtotal the percentage components apply to */
  subtotal: number;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
}

export interface PackageLine {
  name: string;
  componentType: PackageComponentType;
  stream: RevenueStream;
  amount: number;
  /** Already contained in the rate — reporting split only, never added on top */
  includedInRate: boolean;
  breakdown: string;
}

export const COMPONENT_TYPE_LABELS: Record<PackageComponentType, string> = {
  accommodation: "Accommodation",
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  activity: "Activity",
  transfer: "Transfer",
  spa: "Spa",
  other: "Other",
};

export const QUANTITY_BASIS_LABELS: Record<PackageQuantityBasis, string> = {
  per_stay: "Per stay",
  per_night: "Per night",
  per_person: "Per person",
  per_person_per_night: "Per person per night",
  per_room_per_night: "Per room per night",
};

/** Sensible revenue stream for a component type (the user can still override) */
export function defaultStreamForType(type: PackageComponentType): RevenueStream {
  if (type === "accommodation") return "accommodation";
  if (type === "breakfast" || type === "lunch" || type === "dinner") return "fnb";
  return "other";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function basisMultiplier(basis: PackageQuantityBasis, ctx: PackageContext): number {
  const nights = Math.max(1, ctx.nights);
  const rooms = Math.max(1, ctx.rooms);
  const guests = Math.max(1, ctx.adults + ctx.children);
  switch (basis) {
    case "per_night": return nights;
    case "per_person": return guests;
    case "per_person_per_night": return guests * nights;
    case "per_room_per_night": return rooms * nights;
    default: return 1;
  }
}

/** Expand package components into folio-ready lines */
export function expandPackage(
  components: RolosPackageComponent[],
  ctx: PackageContext,
): PackageLine[] {
  return [...components]
    .sort((a, b) => a.display_order - b.display_order)
    .map((c) => {
      const multiplier = basisMultiplier(c.quantity_basis, ctx) * Math.max(1, Number(c.quantity) || 1);
      const amount = c.value_type === "percentage"
        ? round2(ctx.subtotal * (Number(c.amount) / 100))
        : round2(Number(c.amount) * multiplier);
      const breakdown = c.value_type === "percentage"
        ? `${c.amount}% of ${round2(ctx.subtotal)}`
        : `${c.amount} × ${multiplier} (${QUANTITY_BASIS_LABELS[c.quantity_basis].toLowerCase()})`;
      return {
        name: c.name,
        componentType: c.component_type,
        stream: c.revenue_stream,
        amount,
        includedInRate: c.is_included_in_rate,
        breakdown,
      };
    });
}

/** Amount added on top of the accommodation rate */
export function packageAddOnTotal(lines: PackageLine[]): number {
  return round2(lines.filter((l) => !l.includedInRate).reduce((s, l) => s + l.amount, 0));
}

/** Totals per revenue stream, across included and add-on lines */
export function packageStreamTotals(lines: PackageLine[]): Record<RevenueStream, number> {
  const totals: Record<RevenueStream, number> = { accommodation: 0, fnb: 0, other: 0 };
  for (const l of lines) totals[l.stream] += l.amount;
  totals.accommodation = round2(totals.accommodation);
  totals.fnb = round2(totals.fnb);
  totals.other = round2(totals.other);
  return totals;
}

export function isPackageApplicable(pkg: RolosPackage, nights: number): boolean {
  if (!pkg.is_active) return false;
  if (pkg.min_nights > 0 && nights < pkg.min_nights) return false;
  if (pkg.max_nights > 0 && nights > pkg.max_nights) return false;
  return true;
}
