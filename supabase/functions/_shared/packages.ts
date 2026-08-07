/**
 * Package expansion for edge functions (mirror of src/lib/packages.ts).
 * Produces folio-ready lines already tagged with a revenue stream.
 */
import { normalizeRevenueStream, type RevenueStream } from "./revenueStreams.ts";

export type PackageQuantityBasis =
  | "per_stay"
  | "per_night"
  | "per_person"
  | "per_person_per_night"
  | "per_room_per_night";

export interface PackageComponentRow {
  name: string;
  component_type: string;
  value_type: string;
  amount: number | string;
  revenue_stream: string;
  quantity_basis: string;
  quantity: number | string;
  is_included_in_rate: boolean;
  display_order: number;
}

export interface PackageContext {
  subtotal: number;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
}

export interface PackageLine {
  name: string;
  stream: RevenueStream;
  amount: number;
  includedInRate: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function basisMultiplier(basis: string, ctx: PackageContext): number {
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

export function expandPackage(components: PackageComponentRow[], ctx: PackageContext): PackageLine[] {
  return [...(components || [])]
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
    .map((c) => {
      const qty = Math.max(1, Number(c.quantity) || 1);
      const multiplier = basisMultiplier(c.quantity_basis, ctx) * qty;
      const amount = c.value_type === "percentage"
        ? round2(ctx.subtotal * (Number(c.amount) / 100))
        : round2(Number(c.amount) * multiplier);
      return {
        name: c.name,
        stream: normalizeRevenueStream(c.revenue_stream),
        amount,
        includedInRate: !!c.is_included_in_rate,
      };
    })
    .filter((l) => l.amount > 0);
}

/** Load a package's components and expand them in one call. */
// deno-lint-ignore no-explicit-any
export async function expandPackageById(
  supabase: any,
  packageId: string,
  ctx: PackageContext,
): Promise<{ name: string; lines: PackageLine[] }> {
  const { data: pkg } = await supabase
    .from("rolos_packages")
    .select("name")
    .eq("id", packageId)
    .maybeSingle();
  const { data: components } = await supabase
    .from("rolos_package_components")
    .select("name, component_type, value_type, amount, revenue_stream, quantity_basis, quantity, is_included_in_rate, display_order")
    .eq("package_id", packageId);
  return { name: pkg?.name || "Package", lines: expandPackage(components || [], ctx) };
}

export function packageAddOnTotal(lines: PackageLine[]): number {
  return round2(lines.filter((l) => !l.includedInRate).reduce((s, l) => s + l.amount, 0));
}
