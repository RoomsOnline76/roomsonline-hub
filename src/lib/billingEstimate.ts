/**
 * Billing estimator.
 *
 * Turns the configured billing defaults into a "what will this cost?" breakdown
 * for a prospective client: the first 60 days (full stack free, bookings and
 * card processing still payable) versus steady-state monthly billing from day 61.
 *
 * The rules here mirror the live billing engine and the Connect pricing story:
 *   • The free window covers subscriptions and add-ons only.
 *   • Commission on platform bookings is always payable.
 *   • Card processing is always payable when ROL processes payments, and its
 *     rate comes from the active gateway schedule — never a legacy flat field.
 *   • PMS subscription resolves from TOTAL ROOM COUNT, not property count.
 *   • Setup fees are invoiced upfront on signature, never inside a monthly column.
 */

import { DEFAULT_FREE_PERIOD_DAYS } from "./billingSchedule";
import {
  DEFAULT_TIERS,
  normalizeTiers,
  resolveTier,
  type PricingTier,
} from "./billingTierResolver";
import {
  GATEWAY_MODEL_LABELS,
  getEffectiveBillingRate,
  normalizeGatewayModel,
  type GatewayBillingConfig,
  type GatewayRateOverrides,
} from "./gatewayBillingRate";

export interface EstimatorProperty {
  /** Local row id, UI only. */
  id: string;
  name: string;
  /** Units / rooms sold at this property. */
  units: number;
}

export interface EstimatorAddOns {
  pms: boolean;
  channel_manager: boolean;
  branding: boolean;
  white_label: boolean;
  pricelabs: boolean;
  /** Owner CRM add-on — always fee-free. */
  hubspot: boolean;
}

export type PaymentMode = "rol" | "byo" | "reservation_only";

export type WidgetCommissionMode = "flat" | "tiered";

/** Volume band for widget (direct) booking commission — by bookings per month. */
export interface WidgetTier {
  min_bookings: number;
  rate: number;
}

/** Fallback bands used when the preset carries no widget tiers. */
export const DEFAULT_WIDGET_TIERS: WidgetTier[] = [
  { min_bookings: 0, rate: 5 },
  { min_bookings: 10, rate: 4 },
  { min_bookings: 25, rate: 3 },
  { min_bookings: 50, rate: 2 },
];

export interface EstimatorInput {
  properties: EstimatorProperty[];
  /** OTA / platform bookings per month across the whole estimate. */
  monthlyBookings: number;
  /** OTA / platform booking value per month across the whole estimate. */
  monthlyBookingValue: number;
  /** Bookings per month taken through the booking widget (direct). */
  widgetBookings?: number;
  /** Booking value per month taken through the booking widget (direct). */
  widgetBookingValue?: number;
  /** Flat percentage or volume-tiered widget commission. */
  widgetCommissionMode?: WidgetCommissionMode;
  /** Optional custom bands; defaults to DEFAULT_WIDGET_TIERS. */
  widgetTiers?: WidgetTier[];
  addOns: EstimatorAddOns;
  paymentMode: PaymentMode;
}

/** Only the preset fields the estimate needs. */
export interface EstimatorPreset {
  default_commission_rate?: number | null;
  widget_flat_commission_rate?: number | null;
  default_subscription_fee?: number | null;
  default_transaction_fee?: number | null;
  channel_manager_per_unit_fee?: number | null;
  branding_addon_monthly_fee?: number | null;
  branding_addon_setup_fee?: number | null;
  white_label_monthly_fee?: number | null;
  white_label_setup_fee?: number | null;
  pricelabs_monthly_fee?: number | null;
  pricelabs_setup_fee?: number | null;
  enterprise_custom_fee?: number | null;
  tier_pricing_json?: unknown;
}

/** Transaction-driven fees are grouped apart from monthly recurring charges. */
export type EstimateGroup = "transaction" | "recurring";

export interface EstimateLine {
  key: string;
  label: string;
  /** How the number was arrived at, shown under the label. */
  detail: string;
  /** Which block of the breakdown the line belongs to. */
  group: EstimateGroup;
  /** Monthly amount during the first 60 days. */
  freePeriod: number;
  /** Monthly amount from day 61. */
  steadyState: number;
  /** True when the line is waived during the free window. */
  waivedInFreePeriod: boolean;
}


export interface SetupLine {
  key: string;
  label: string;
  amount: number;
}

export interface PropertyEstimate {
  id: string;
  name: string;
  units: number;
  freePeriod: number;
  steadyState: number;
}

export interface BillingEstimate {
  freeDays: number;
  totalUnits: number;
  propertyCount: number;
  lines: EstimateLine[];
  setupLines: SetupLine[];
  perProperty: PropertyEstimate[];
  freePeriodTotal: number;
  steadyStateTotal: number;
  /** Commission + card processing subtotal (payable from day one). */
  transactionFreePeriodTotal: number;
  transactionSteadyStateTotal: number;
  /** Subscriptions and add-ons subtotal. */
  recurringFreePeriodTotal: number;
  recurringSteadyStateTotal: number;
  setupTotal: number;
  /** Resolved PMS tier, when the PMS add-on is selected. */
  tier: PricingTier | null;
  /** Human note about where the card-processing rate came from. */
  gatewayNote: string;
  /** True when no gateway schedule was available and the preset fallback was used. */
  usedLegacyGatewayFallback: boolean;
  /** Resolved widget commission percentage, when widget volume was entered. */
  widgetRate: number | null;
}

/** Resolve the widget commission percentage for a monthly booking count. */
export function resolveWidgetRate(
  mode: WidgetCommissionMode,
  bookings: number,
  flatRate: number,
  tiers: WidgetTier[] = DEFAULT_WIDGET_TIERS,
): { rate: number; tier: WidgetTier | null } {
  if (mode === "flat") return { rate: flatRate, tier: null };
  const sorted = [...tiers].sort((a, b) => b.min_bookings - a.min_bookings);
  const hit = sorted.find((t) => bookings >= t.min_bookings) ?? null;
  return { rate: hit ? hit.rate : flatRate, tier: hit };
}


function n(value: number | null | undefined): number {
  const v = Number(value);
  return Number.isFinite(v) ? v : 0;
}

export function money(amount: number, currency = "R"): string {
  return `${currency}${Math.round(amount).toLocaleString("en-ZA")}`;
}

/**
 * Build the two-period estimate. `schedule` is the gateway schedule that would
 * apply (active global, or an explicitly chosen one); pass null when none exists.
 */
export function buildBillingEstimate(
  preset: EstimatorPreset | null,
  input: EstimatorInput,
  schedule: GatewayBillingConfig | null,
  overrides?: GatewayRateOverrides | null,
): BillingEstimate {
  const properties = input.properties.filter((p) => n(p.units) >= 0);
  const totalUnits = properties.reduce((sum, p) => sum + Math.max(0, Math.round(n(p.units))), 0);
  const propertyCount = properties.length;
  const bookings = Math.max(0, Math.round(n(input.monthlyBookings)));
  const value = Math.max(0, n(input.monthlyBookingValue));

  const lines: EstimateLine[] = [];
  const setupLines: SetupLine[] = [];

  // ── Commission — always payable, in and out of the free window ────────────
  const commissionRate = n(preset?.default_commission_rate);
  const commission = value * (commissionRate / 100);
  lines.push({
    key: "commission",
    label: "Booking commission",
    detail: commissionRate
      ? `${commissionRate}% of ${money(value)} booked through the platform`
      : "No commission configured on this preset",
    freePeriod: commission,
    steadyState: commission,
    waivedInFreePeriod: false,
  });

  // ── Card processing — always payable when ROL processes ───────────────────
  let gatewayNote = "";
  let usedLegacyGatewayFallback = false;
  if (input.paymentMode === "rol") {
    if (schedule) {
      const rate = getEffectiveBillingRate(schedule, value, value, overrides ?? null);
      const processing = value * (rate.percentage / 100) + rate.fixed_fee * bookings;
      const model = GATEWAY_MODEL_LABELS[normalizeGatewayModel(schedule.model)];
      const fixedPart = rate.fixed_fee > 0 ? ` + ${money(rate.fixed_fee)} x ${bookings} transactions` : "";
      lines.push({
        key: "processing",
        label: "Card processing (ROL processes)",
        detail: `${rate.percentage}% of ${money(value)}${fixedPart}`,
        freePeriod: processing,
        steadyState: processing,
        waivedInFreePeriod: false,
      });
      if (rate.monthly_fee > 0) {
        lines.push({
          key: "processing_platform",
          label: "Payment platform fee",
          detail: `${money(rate.monthly_fee)} per month on the ${model} schedule`,
          freePeriod: 0,
          steadyState: rate.monthly_fee,
          waivedInFreePeriod: true,
        });
      }
      gatewayNote = `${model}${schedule.version != null ? ` v${schedule.version}` : ""}${
        rate.tier ? ` — volume band from ${money(rate.tier.min_monthly_volume)}` : ""
      }${rate.usedOverride ? " (negotiated rate applied)" : ""}`;
    } else {
      const fallback = n(preset?.default_transaction_fee);
      const processing = value * (fallback / 100);
      usedLegacyGatewayFallback = true;
      lines.push({
        key: "processing",
        label: "Card processing (ROL processes)",
        detail: `${fallback}% of ${money(value)} — preset fallback`,
        freePeriod: processing,
        steadyState: processing,
        waivedInFreePeriod: false,
      });
      gatewayNote = "No gateway schedule published — the preset fallback percentage was used.";
    }
  } else if (input.paymentMode === "byo") {
    gatewayNote = "Own gateway — processing fees stay with that provider and are not billed by RoomsOnline.";
  } else {
    gatewayNote = "Reservation only — no card payment is processed, so no processing fee applies.";
  }

  // ── PMS subscription — free for the first 60 days ─────────────────────────
  const tiers = normalizeTiers(preset?.tier_pricing_json);
  const tierSet = tiers.length ? tiers : DEFAULT_TIERS;
  let tier: PricingTier | null = null;
  if (input.addOns.pms) {
    const custom = n(preset?.enterprise_custom_fee);
    if (custom > 0) {
      lines.push({
        key: "pms",
        label: "ROL'OS PMS subscription",
        detail: `Enterprise fee of ${money(custom)} per month`,
        freePeriod: 0,
        steadyState: custom,
        waivedInFreePeriod: true,
      });
    } else {
      tier = resolveTier(totalUnits, tierSet, propertyCount);
      const tierFee = n(tier?.monthly_fee) || n(preset?.default_subscription_fee);
      lines.push({
        key: "pms",
        label: "ROL'OS PMS subscription",
        detail: tier
          ? `${totalUnits} rooms → ${tier.min_rooms}–${tier.max_rooms ?? "∞"} room band at ${money(tierFee)} per month`
          : `${money(tierFee)} per month`,
        freePeriod: 0,
        steadyState: tierFee,
        waivedInFreePeriod: true,
      });
    }
  }

  // ── Channel Manager — per unit, free for the first 60 days ────────────────
  if (input.addOns.channel_manager) {
    const perUnit = n(preset?.channel_manager_per_unit_fee) || 60;
    const total = perUnit * totalUnits;
    lines.push({
      key: "channel_manager",
      label: "Channel Manager",
      detail: `${money(perUnit)} x ${totalUnits} units per month`,
      freePeriod: 0,
      steadyState: total,
      waivedInFreePeriod: true,
    });
  }

  // ── Branding pack ────────────────────────────────────────────────────────
  if (input.addOns.branding) {
    const monthly = n(preset?.branding_addon_monthly_fee);
    lines.push({
      key: "branding",
      label: "Branding pack",
      detail: `${money(monthly)} per month`,
      freePeriod: 0,
      steadyState: monthly,
      waivedInFreePeriod: true,
    });
    const setup = n(preset?.branding_addon_setup_fee);
    if (setup > 0) setupLines.push({ key: "branding_setup", label: "Branding pack setup", amount: setup });
  }

  // ── White label ──────────────────────────────────────────────────────────
  if (input.addOns.white_label) {
    const monthly = n(preset?.white_label_monthly_fee);
    lines.push({
      key: "white_label",
      label: "White label",
      detail: `${money(monthly)} per month`,
      freePeriod: 0,
      steadyState: monthly,
      waivedInFreePeriod: true,
    });
    const setup = n(preset?.white_label_setup_fee);
    if (setup > 0) setupLines.push({ key: "white_label_setup", label: "White label setup", amount: setup });
  }

  // ── PriceLabs — priced per property ──────────────────────────────────────
  if (input.addOns.pricelabs) {
    const monthly = n(preset?.pricelabs_monthly_fee);
    const total = monthly * Math.max(1, propertyCount);
    lines.push({
      key: "pricelabs",
      label: "PriceLabs",
      detail: `${money(monthly)} x ${Math.max(1, propertyCount)} properties per month`,
      freePeriod: 0,
      steadyState: total,
      waivedInFreePeriod: true,
    });
    const setup = n(preset?.pricelabs_setup_fee);
    if (setup > 0) {
      setupLines.push({
        key: "pricelabs_setup",
        label: "PriceLabs setup",
        amount: setup * Math.max(1, propertyCount),
      });
    }
  }

  // ── HubSpot owner CRM — free, always ─────────────────────────────────────
  if (input.addOns.hubspot) {
    lines.push({
      key: "hubspot",
      label: "Owner CRM (HubSpot)",
      detail: "Included at no charge",
      freePeriod: 0,
      steadyState: 0,
      waivedInFreePeriod: false,
    });
  }

  const freePeriodTotal = lines.reduce((sum, l) => sum + l.freePeriod, 0);
  const steadyStateTotal = lines.reduce((sum, l) => sum + l.steadyState, 0);
  const setupTotal = setupLines.reduce((sum, l) => sum + l.amount, 0);

  // ── Per-property split ───────────────────────────────────────────────────
  // Booking-driven lines follow booking value; unit-driven lines follow units;
  // with no units anywhere the split falls back to an even share.
  const perProperty: PropertyEstimate[] = properties.map((p) => {
    const units = Math.max(0, Math.round(n(p.units)));
    const share = totalUnits > 0 ? units / totalUnits : propertyCount > 0 ? 1 / propertyCount : 0;
    return {
      id: p.id,
      name: p.name,
      units,
      freePeriod: freePeriodTotal * share,
      steadyState: steadyStateTotal * share,
    };
  });

  return {
    freeDays: DEFAULT_FREE_PERIOD_DAYS,
    totalUnits,
    propertyCount,
    lines,
    setupLines,
    perProperty,
    freePeriodTotal,
    steadyStateTotal,
    setupTotal,
    tier,
    gatewayNote,
    usedLegacyGatewayFallback,
  };
}

/** One-line plain-language summary shown under the table. */
export function summariseEstimate(estimate: BillingEstimate): string {
  const setupPart = estimate.setupTotal > 0 ? ` Setup of ${money(estimate.setupTotal)} is invoiced on signature.` : "";
  return `First ${estimate.freeDays} days: about ${money(
    estimate.freePeriodTotal,
  )} per month — bookings and card processing only, the platform itself is free. From day ${
    estimate.freeDays + 1
  }: about ${money(estimate.steadyStateTotal)} per month including subscriptions and add-ons.${setupPart}`;
}
