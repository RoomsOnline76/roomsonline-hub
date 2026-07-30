/**
 * Commission resolution — single source of truth for "what does ROL charge on
 * this booking?".
 *
 * Rules (agreed with the business):
 *  - `listing`  — booking originated on a ROL-owned marketplace surface
 *                 (book.sleepinafrica…, ROL journey/itinerary, ROL OTA pages).
 *                 Charged at the listing rate (default 10%).
 *  - `pms`      — booking originated on the property's own surface: white-label
 *                 site, direct, widget/WBE, embed, WordPress plugin or API.
 *                 Charged at the PMS rate (default 2%).
 *  - `external` — reservation synced in from a third-party channel
 *                 (Booking.com, Expedia, Airbnb, Lekkeslaap, Vrbo, Google…).
 *                 ROL never sees the money, so commission is 0%.
 *
 * Rate cascade per booking:
 *   booking.calculated_commission (already billed)
 *     → active property_commercial_terms row for the type
 *     → billing config rate for the type (portfolio config wins over property)
 *     → billing config shared commission_rate
 *     → global default
 *     → hardcoded 10% listing / 2% PMS
 */

export type CommissionType = "listing" | "pms" | "external";

export const DEFAULT_LISTING_RATE = 10;
export const DEFAULT_PMS_RATE = 2;

/** Origins that mean "the property's own booking surface" → PMS rate. */
const PMS_INTEGRATION_TYPES = [
  "rolos",
  "widget",
  "embed",
  "api",
  "wordpress",
  "booking_bar",
  "manual",
  "pms",
];
const PMS_CHANNELS = ["direct", "widget", "embed", "api", "wordpress", "white_label", "wl", "manual", "pms"];

/** Origins that mean "a third-party channel manager reservation" → 0%. */
const EXTERNAL_CHANNELS = [
  "booking.com",
  "booking_com",
  "bookingcom",
  "expedia",
  "airbnb",
  "lekkeslaap",
  "vrbo",
  "homeaway",
  "google",
  "google_travel",
  "agoda",
  "hostelworld",
  "nightsbridge",
  "hyperguest",
  "rentals_united",
  "rentalsunited",
  "channel",
  "ota_channel",
];

/** ROL-owned marketplace surfaces → listing rate. */
const LISTING_CHANNELS = ["rol_itinerary", "journey", "marketplace", "sleepinafrica", "rol", "listing", "ota"];
const LISTING_HOST_HINTS = ["sleepinafrica", "roomsonline.co.za/property", "/journey", "/itinerary"];

export interface CommissionBookingLike {
  integration_type?: string | null;
  booking_channel?: string | null;
  source_url?: string | null;
  calculated_commission?: number | null;
  commission_rate_applied?: number | null;
  commission_type?: string | null;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function resolveCommissionType(booking: CommissionBookingLike | null | undefined): CommissionType {
  if (!booking) return "listing";

  const stored = norm(booking.commission_type);
  if (stored === "pms" || stored === "listing" || stored === "external") return stored as CommissionType;

  const integration = norm(booking.integration_type);
  const channel = norm(booking.booking_channel);
  const url = norm(booking.source_url);

  const matches = (haystack: string, list: string[]) =>
    !!haystack && list.some((k) => haystack === k || haystack.includes(k));

  // Third-party channel reservations never carry ROL commission.
  if (matches(channel, EXTERNAL_CHANNELS) || matches(integration, EXTERNAL_CHANNELS)) return "external";

  // Property-owned surfaces.
  if (integration && PMS_INTEGRATION_TYPES.includes(integration)) return "pms";
  if (channel && PMS_CHANNELS.includes(channel)) return "pms";
  if (url && (url.includes("widget") || url.includes("embed") || url.includes("wordpress") || url.includes("wl=1")))
    return "pms";

  // ROL marketplace surfaces.
  if (matches(channel, LISTING_CHANNELS)) return "listing";
  if (matches(url, LISTING_HOST_HINTS)) return "listing";

  return "listing";
}

/** Billing config fields the resolver needs (property or portfolio scoped). */
export interface CommissionConfigLike {
  billing_strategy?: string | null;
  commission_rate?: number | null;
  listing_commission_rate?: number | null;
  pms_commission_rate?: number | null;
  widget_flat_commission_rate?: number | null;
}

export interface CommissionGlobalsLike {
  default_commission_rate?: number | null;
  listing_commission_rate?: number | null;
  pms_commission_rate?: number | null;
  widget_flat_commission_rate?: number | null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface ResolvedRate {
  rate: number;
  type: CommissionType;
  source: string;
}

/**
 * Resolve the commission % for a booking type against a (already portfolio-aware)
 * billing config, global defaults and any active commercial term.
 */
export function resolveCommissionRate(
  type: CommissionType,
  config: CommissionConfigLike | null | undefined,
  globals?: CommissionGlobalsLike | null,
  commercialTermRate?: number | null,
): ResolvedRate {
  if (type === "external") return { rate: 0, type, source: "external_channel" };

  const term = num(commercialTermRate);
  if (term != null) return { rate: term, type, source: "commercial_term" };

  const strategy = norm(config?.billing_strategy);

  // Enterprise white-label is a subscription-only model — no booking commission.
  if (strategy === "enterprise_white_label") return { rate: 0, type, source: "enterprise_white_label" };

  if (type === "pms") {
    const flat = num(config?.widget_flat_commission_rate) ?? num(globals?.widget_flat_commission_rate);
    const pms = num(config?.pms_commission_rate) ?? num(globals?.pms_commission_rate);
    if (pms != null) return { rate: pms, type, source: "config_pms_rate" };
    if (flat != null) return { rate: flat, type, source: "widget_flat" };
    if (strategy === "rolos_pms") {
      const shared = num(config?.commission_rate) ?? num(globals?.default_commission_rate);
      if (shared != null) return { rate: shared, type, source: "config_shared_rate" };
    }
    return { rate: DEFAULT_PMS_RATE, type, source: "default" };
  }

  const listing = num(config?.listing_commission_rate) ?? num(globals?.listing_commission_rate);
  if (listing != null) return { rate: listing, type, source: "config_listing_rate" };
  const shared = num(config?.commission_rate) ?? num(globals?.default_commission_rate);
  if (shared != null) return { rate: shared, type, source: "config_shared_rate" };
  return { rate: DEFAULT_LISTING_RATE, type, source: "default" };
}

export interface BookingCommission extends ResolvedRate {
  amount: number;
}

/** Commission for one booking, preferring the amount already billed. */
export function resolveBookingCommission(
  booking: CommissionBookingLike | null | undefined,
  grossAmount: number,
  config: CommissionConfigLike | null | undefined,
  globals?: CommissionGlobalsLike | null,
  commercialTermRate?: number | null,
): BookingCommission {
  const type = resolveCommissionType(booking);
  const billed = num(booking?.calculated_commission);
  if (billed != null && billed > 0) {
    return {
      amount: billed,
      rate: num(booking?.commission_rate_applied) ?? (grossAmount > 0 ? (billed / grossAmount) * 100 : 0),
      type,
      source: "booking_billed",
    };
  }
  const resolved = resolveCommissionRate(type, config, globals, commercialTermRate);
  return { ...resolved, amount: grossAmount * (resolved.rate / 100) };
}

export const COMMISSION_TYPE_LABEL: Record<CommissionType, string> = {
  listing: "Marketplace",
  pms: "PMS / direct",
  external: "Channel (no fee)",
};
