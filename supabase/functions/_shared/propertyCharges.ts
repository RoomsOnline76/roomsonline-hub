/**
 * Server-side authority for property charge calculation.
 *
 * Ported from src/components/charges/ChargeCalculator.ts so the property editor,
 * the folio and every edge function agree on method names, caps, scoping and
 * revenue-stream classification. Never re-implement charge maths elsewhere.
 */

import { normalizeRevenueStream, type RevenueStream } from "./revenueStreams.ts";

export type ChargeCategory = "tax" | "fee" | "deposit" | "surcharge" | "custom";

export type ChargeCalculationMethod =
  | "flat_per_stay"
  | "per_night"
  | "per_room_per_night"
  | "per_person"
  | "per_person_per_night"
  | "percentage_of_accommodation";

/** Legacy / alias method names seen in older rows and PMS imports. */
const METHOD_ALIASES: Record<string, ChargeCalculationMethod> = {
  flat: "flat_per_stay",
  flat_per_stay: "flat_per_stay",
  per_stay: "flat_per_stay",
  once_off: "flat_per_stay",
  per_night: "per_night",
  per_room: "per_room_per_night",
  per_room_per_night: "per_room_per_night",
  per_person: "per_person",
  per_guest: "per_person",
  per_person_per_night: "per_person_per_night",
  per_guest_per_night: "per_person_per_night",
  percentage: "percentage_of_accommodation",
  percent: "percentage_of_accommodation",
  percentage_of_accommodation: "percentage_of_accommodation",
  percentage_of_total: "percentage_of_accommodation",
};

export function canonicalChargeMethod(value: unknown): ChargeCalculationMethod {
  const key = String(value ?? "").toLowerCase().trim();
  return METHOD_ALIASES[key] ?? "flat_per_stay";
}

// deno-lint-ignore no-explicit-any
export type PropertyChargeRow = Record<string, any>;

export interface ChargeContext {
  /** Accommodation total for the stay — the base for percentage charges. */
  accommodation: number;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  infants: number;
  /**
   * Guests already covered by the room rate across the whole stay (sum of the
   * booked units' base occupancy). Per-person charges only bill guests above it.
   */
  baseOccupancy?: number | null;
  /** Booking room type id plus any aliases (per-line ids, external PMS ids). */
  roomTypeIds?: string[];
  rateTypeId?: string | null;
  currency?: string;
}


export interface QuoteLine {
  chargeId: string;
  name: string;
  category: ChargeCategory;
  method: ChargeCalculationMethod;
  amount: number;
  breakdown: string;
  isRefundable: boolean;
  refundTiming: string | null;
  revenueStream: RevenueStream;
  includedInRate: boolean;
  /** True when the amount is added on top of accommodation in the guest total. */
  countsInGuestTotal: boolean;
  description: string | null;
}

export interface ChargeQuote {
  accommodation: number;
  /** Add-on charges that form part of the guest total (taxes, fees, surcharges). */
  extrasTotal: number;
  /** Refundable deposits — itemised separately, never inside the guest total. */
  depositTotal: number;
  /** Charges already inside the rate (split markers only). */
  includedTotal: number;
  guestTotal: number;
  lines: QuoteLine[];
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  infants: number;
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

function fmt(amount: number, currency = "ZAR"): string {
  const symbol = currency === "ZAR" ? "R" : `${currency} `;
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${symbol}${value}`;
}

function isApplicable(charge: PropertyChargeRow, ctx: ChargeContext): boolean {
  if (charge.is_active === false) return false;

  if (!charge.applies_to_all_rooms && (charge.room_type_ids?.length ?? 0) > 0) {
    const ids = new Set((ctx.roomTypeIds || []).filter(Boolean));
    if (ids.size > 0) {
      const matches = (charge.room_type_ids as string[]).some((id) => ids.has(id));
      if (!matches) return false;
    }
  }

  if ((charge.rate_type_ids?.length ?? 0) > 0 && ctx.rateTypeId) {
    if (!(charge.rate_type_ids as string[]).includes(ctx.rateTypeId)) return false;
  }

  const minNights = Number(charge.min_nights) || 0;
  const maxNights = Number(charge.max_nights) || 0;
  if (minNights > 0 && ctx.nights < minNights) return false;
  if (maxNights > 0 && ctx.nights > maxNights) return false;

  return true;
}

function computeAmount(
  charge: PropertyChargeRow,
  ctx: ChargeContext,
): { amount: number; breakdown: string; method: ChargeCalculationMethod } {
  const method = canonicalChargeMethod(charge.calculation_method);
  const currency = charge.currency || ctx.currency || "ZAR";

  const overrides = (charge.room_charge_overrides || {}) as Record<string, number>;
  const overrideKey = (ctx.roomTypeIds || []).find((id) => id && overrides[id] != null);
  const base = overrideKey != null ? Number(overrides[overrideKey]) : Number(charge.amount) || 0;

  let persons = 0;
  if (charge.applies_to_adults !== false) persons += ctx.adults;
  if (charge.applies_to_children) persons += ctx.children;
  if (charge.applies_to_infants) persons += ctx.infants;

  let amount = 0;
  let breakdown = "";

  switch (method) {
    case "flat_per_stay":
      amount = base;
      breakdown = `${fmt(base, currency)} flat per stay`;
      break;
    case "per_night":
      amount = base * ctx.nights;
      breakdown = `${fmt(base, currency)} × ${ctx.nights} nights`;
      break;
    case "per_room_per_night":
      amount = base * ctx.rooms * ctx.nights;
      breakdown = `${fmt(base, currency)} × ${ctx.rooms} rooms × ${ctx.nights} nights`;
      break;
    case "per_person":
      amount = base * persons;
      breakdown = `${fmt(base, currency)} × ${persons} guests`;
      break;
    case "per_person_per_night":
      amount = base * persons * ctx.nights;
      breakdown = `${fmt(base, currency)} × ${persons} guests × ${ctx.nights} nights`;
      break;
    case "percentage_of_accommodation": {
      amount = ctx.accommodation * (base / 100);
      const minCap = charge.min_cap != null ? Number(charge.min_cap) : null;
      const maxCap = charge.max_cap != null ? Number(charge.max_cap) : null;
      if (minCap != null && amount < minCap) {
        amount = minCap;
        breakdown = `${base}% (min ${fmt(minCap, currency)})`;
      } else if (maxCap != null && maxCap > 0 && amount > maxCap) {
        amount = maxCap;
        breakdown = `${base}% (max ${fmt(maxCap, currency)})`;
      } else {
        breakdown = `${base}% of ${fmt(round2(ctx.accommodation), currency)}`;
      }
      break;
    }
  }

  return { amount: round2(amount), breakdown, method };
}

/** Category ordering + duplicate-name dedup identical to the frontend calculator. */
function orderAndDedup(charges: PropertyChargeRow[]): PropertyChargeRow[] {
  const order: Record<string, number> = { tax: 1, fee: 2, deposit: 3, surcharge: 4, custom: 5 };
  const sorted = [...charges].sort((a, b) => {
    const diff = (order[a.category] ?? 9) - (order[b.category] ?? 9);
    if (diff !== 0) return diff;
    return (Number(a.display_order) || 0) - (Number(b.display_order) || 0);
  });

  const out: PropertyChargeRow[] = [];
  const seen = new Map<string, PropertyChargeRow>();
  for (const charge of sorted) {
    const key = String(charge.name || "").toLowerCase().trim();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, charge);
      out.push(charge);
      continue;
    }
    if (existing.applies_to_all_rooms && !charge.applies_to_all_rooms) {
      const idx = out.indexOf(existing);
      if (idx !== -1) out[idx] = charge;
      seen.set(key, charge);
    }
  }
  return out;
}

/** Pure calculation over already-loaded property charges. */
export function quoteCharges(charges: PropertyChargeRow[], ctx: ChargeContext): ChargeQuote {
  const lines: QuoteLine[] = [];

  for (const charge of orderAndDedup(charges.filter((c) => isApplicable(c, ctx)))) {
    const { amount, breakdown, method } = computeAmount(charge, ctx);
    if (amount <= 0) continue;

    const includedInRate = charge.is_included_in_rate === true;
    const isRefundable = charge.is_refundable === true || charge.category === "deposit";

    lines.push({
      chargeId: charge.id,
      name: charge.name,
      category: (charge.category || "custom") as ChargeCategory,
      method,
      amount,
      breakdown: includedInRate ? `${breakdown} (included in rate)` : breakdown,
      isRefundable,
      refundTiming: charge.refund_timing || null,
      revenueStream: normalizeRevenueStream(charge.revenue_stream),
      includedInRate,
      countsInGuestTotal: !includedInRate && !isRefundable,
      description: charge.description || null,
    });
  }

  const extrasTotal = round2(
    lines.filter((l) => l.countsInGuestTotal).reduce((s, l) => s + l.amount, 0),
  );
  const depositTotal = round2(
    lines.filter((l) => l.isRefundable && !l.includedInRate).reduce((s, l) => s + l.amount, 0),
  );
  const includedTotal = round2(
    lines.filter((l) => l.includedInRate).reduce((s, l) => s + l.amount, 0),
  );

  return {
    accommodation: round2(ctx.accommodation),
    extrasTotal,
    depositTotal,
    includedTotal,
    guestTotal: round2(ctx.accommodation + extrasTotal),
    lines,
    nights: ctx.nights,
    rooms: ctx.rooms,
    adults: ctx.adults,
    children: ctx.children,
    infants: ctx.infants,
  };
}

export interface BookingChargeInput {
  bookingId: string;
  propertyId: string;
  /** Accommodation total for the (new) stay. */
  accommodation: number;
  checkIn: string;
  checkOut: string;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  rooms?: number | null;
  roomTypeIds?: (string | null | undefined)[];
  rateTypeId?: string | null;
  currency?: string | null;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

/** Load the property's active charges and quote them for a booking. */
// deno-lint-ignore no-explicit-any
export async function quoteBookingCharges(supabase: any, input: BookingChargeInput): Promise<ChargeQuote> {
  const { data: charges } = await supabase
    .from("property_charges")
    .select("*")
    .eq("property_id", input.propertyId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  return quoteCharges((charges || []) as PropertyChargeRow[], {
    accommodation: Number(input.accommodation) || 0,
    nights: nightsBetween(input.checkIn, input.checkOut),
    rooms: Math.max(1, Number(input.rooms) || 1),
    adults: Math.max(0, Number(input.adults ?? 1) || 0),
    children: Math.max(0, Number(input.children ?? 0) || 0),
    infants: Math.max(0, Number(input.infants ?? 0) || 0),
    roomTypeIds: (input.roomTypeIds || []).filter((id): id is string => !!id),
    rateTypeId: input.rateTypeId || null,
    currency: input.currency || "ZAR",
  });
}

export interface ReconcileResult extends ChargeQuote {
  created: number;
  updated: number;
  removed: number;
  folioId: string | null;
}

const txTypeFor = (category: string): string =>
  category === "tax" ? "tax" : category === "deposit" ? "deposit" : "charge";

/**
 * Bring rolos_booking_charges + their folio transactions in line with the quote.
 *
 * Rule-based lines (those carrying a charge_id) are created, corrected or
 * removed. Anything an operator posted by hand (no charge_id, or a folio
 * transaction with no matching booking charge) is left untouched.
 */
// deno-lint-ignore no-explicit-any
export async function reconcileBookingCharges(supabase: any, input: BookingChargeInput): Promise<ReconcileResult> {
  const quote = await quoteBookingCharges(supabase, input);

  let { data: folio } = await supabase
    .from("rolos_folios")
    .select("id")
    .eq("booking_id", input.bookingId)
    .maybeSingle();
  if (!folio?.id) {
    const { data: created } = await supabase
      .from("rolos_folios")
      .insert({ booking_id: input.bookingId })
      .select("id")
      .maybeSingle();
    folio = created;
  }
  const folioId: string | null = folio?.id ?? null;

  const { data: existingRows } = await supabase
    .from("rolos_booking_charges")
    .select("id, charge_id, folio_transaction_id, amount, name, breakdown")
    .eq("booking_id", input.bookingId);

  const existing = (existingRows || []).filter((r: PropertyChargeRow) => !!r.charge_id);
  const byChargeId = new Map<string, PropertyChargeRow>();
  for (const row of existing) byChargeId.set(String(row.charge_id), row);

  let createdCount = 0;
  let updatedCount = 0;
  let removedCount = 0;

  for (const line of quote.lines) {
    const row = byChargeId.get(line.chargeId);
    const shouldPostFolio = !line.includedInRate && !!folioId;

    if (!row) {
      let txId: string | null = null;
      if (shouldPostFolio) {
        const { data: tx } = await supabase
          .from("rolos_folio_transactions")
          .insert({
            folio_id: folioId,
            transaction_type: txTypeFor(line.category),
            description: `${line.name}${line.description ? ` - ${line.description}` : ""}`,
            amount: line.amount,
            revenue_stream: line.revenueStream,
          })
          .select("id")
          .maybeSingle();
        txId = tx?.id ?? null;
      }

      await supabase.from("rolos_booking_charges").insert({
        booking_id: input.bookingId,
        property_id: input.propertyId,
        charge_id: line.chargeId,
        folio_transaction_id: txId,
        name: line.name,
        category: line.category,
        calculation_method: line.method,
        amount: line.amount,
        revenue_stream: line.revenueStream,
        is_refundable: line.isRefundable,
        refund_timing: line.refundTiming,
        refund_status: line.isRefundable ? "pending" : null,
        breakdown: line.breakdown,
      });
      createdCount++;
      continue;
    }

    byChargeId.delete(line.chargeId);

    const changed = round2(row.amount) !== line.amount || row.breakdown !== line.breakdown;
    if (!changed) continue;

    let txId: string | null = row.folio_transaction_id ?? null;
    if (shouldPostFolio) {
      if (txId) {
        await supabase
          .from("rolos_folio_transactions")
          .update({
            amount: line.amount,
            description: `${line.name}${line.description ? ` - ${line.description}` : ""}`,
            revenue_stream: line.revenueStream,
            transaction_type: txTypeFor(line.category),
          })
          .eq("id", txId);
      } else {
        const { data: tx } = await supabase
          .from("rolos_folio_transactions")
          .insert({
            folio_id: folioId,
            transaction_type: txTypeFor(line.category),
            description: `${line.name}${line.description ? ` - ${line.description}` : ""}`,
            amount: line.amount,
            revenue_stream: line.revenueStream,
          })
          .select("id")
          .maybeSingle();
        txId = tx?.id ?? null;
      }
    } else if (txId) {
      // Charge became "included in rate" — drop the double-charging transaction.
      await supabase.from("rolos_folio_transactions").delete().eq("id", txId);
      txId = null;
    }

    await supabase
      .from("rolos_booking_charges")
      .update({
        folio_transaction_id: txId,
        name: line.name,
        category: line.category,
        calculation_method: line.method,
        amount: line.amount,
        revenue_stream: line.revenueStream,
        is_refundable: line.isRefundable,
        refund_timing: line.refundTiming,
        breakdown: line.breakdown,
      })
      .eq("id", row.id);
    updatedCount++;
  }

  // Anything rule-based left over no longer applies to this stay.
  for (const stale of byChargeId.values()) {
    if (stale.folio_transaction_id) {
      await supabase.from("rolos_folio_transactions").delete().eq("id", stale.folio_transaction_id);
    }
    await supabase.from("rolos_booking_charges").delete().eq("id", stale.id);
    removedCount++;
  }

  return { ...quote, created: createdCount, updated: updatedCount, removed: removedCount, folioId };
}

/** Compact JSON snapshot stored on bookings.charges_breakdown. */
export function chargesBreakdownSnapshot(quote: ChargeQuote): Record<string, unknown> {
  return {
    accommodation: quote.accommodation,
    extras_total: quote.extrasTotal,
    deposit_total: quote.depositTotal,
    included_total: quote.includedTotal,
    guest_total: quote.guestTotal,
    nights: quote.nights,
    computed_at: new Date().toISOString(),
    lines: quote.lines.map((l) => ({
      charge_id: l.chargeId,
      name: l.name,
      category: l.category,
      calculation_method: l.method,
      amount: l.amount,
      breakdown: l.breakdown,
      is_refundable: l.isRefundable,
      included_in_rate: l.includedInRate,
      counts_in_total: l.countsInGuestTotal,
    })),
  };
}

export interface BookingChargeStayContext {
  accommodation: number;
  rooms: number;
  roomTypeIds: string[];
}

/**
 * Resolve the accommodation base and room scope for a booking.
 *
 * Accommodation is the room revenue only — never the guest total. Preference
 * order: active room lines, then the last stored breakdown, then total_price
 * minus the extras that breakdown recorded.
 */
// deno-lint-ignore no-explicit-any
export async function resolveBookingChargeContext(supabase: any, booking: any): Promise<BookingChargeStayContext> {
  const { data: lines } = await supabase
    .from("rolos_booking_rooms")
    .select("room_type_id, rate_charged, status")
    .eq("booking_id", booking.id);

  const active = (lines || []).filter((l: PropertyChargeRow) => (l.status ?? "active") === "active");
  const lineTotal = active.reduce((s: number, l: PropertyChargeRow) => s + (Number(l.rate_charged) || 0), 0);

  const snapshot = (booking.charges_breakdown || {}) as Record<string, unknown>;
  const snapAccommodation = Number(snapshot.accommodation) || 0;
  const snapExtras = Number(snapshot.extras_total) || 0;
  const total = Number(booking.total_price) || 0;

  const accommodation = lineTotal > 0
    ? lineTotal
    : snapAccommodation > 0
      ? snapAccommodation
      : round2(Math.max(0, total - snapExtras));

  const roomTypeIds = [
    ...active.map((l: PropertyChargeRow) => l.room_type_id),
    booking.room_type_id,
  ].filter((id: unknown): id is string => typeof id === "string" && !!id);

  return {
    accommodation: round2(accommodation),
    rooms: Math.max(1, active.length || (booking.rolos_room_ids?.length ?? 0) || 1),
    roomTypeIds: [...new Set(roomTypeIds)],
  };
}
