/**
 * Payment handling mode for a property.
 *
 * - `rol`              — guests pay online through the Rooms Online gateway.
 * - `byo`              — guests pay online through the property's own gateway.
 * - `reservation_only` — no online payment is offered. The guest makes a
 *                        reservation, the property collects payment manually
 *                        (EFT) and marks it paid in ROL'OS.
 */
export type PaymentMode = "rol" | "byo" | "reservation_only";

export const PAYMENT_MODES: { value: PaymentMode; label: string; description: string }[] = [
  {
    value: "rol",
    label: "Rooms Online gateway",
    description: "Guests pay online; funds settle to the Rooms Online facilitator account.",
  },
  {
    value: "byo",
    label: "Own gateway (BYO)",
    description: "Guests pay online through this property's own merchant account.",
  },
  {
    value: "reservation_only",
    label: "Reservation only — no online payment",
    description:
      "No payment is proposed at checkout. The guest reserves, receives banking details on a pro forma invoice, and the property marks the reservation paid in ROL'OS.",
  },
];

export function isPaymentMode(value: unknown): value is PaymentMode {
  return value === "rol" || value === "byo" || value === "reservation_only";
}

export function normalisePaymentMode(
  value: unknown,
  allowCustom?: boolean | null,
): PaymentMode {
  if (isPaymentMode(value)) return value;
  return allowCustom ? "byo" : "rol";
}

export function isReservationOnly(value: unknown): boolean {
  return value === "reservation_only";
}

/** How long a reservation-only hold blocks inventory (ROL'OS default). */
export const RESERVATION_HOLD_DAYS = 3;
/** Inside this arrival window a lapsed, unpaid reservation is cancelled. */
export const RESERVATION_CANCEL_WINDOW_DAYS = 14;

export function reservationHoldExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + RESERVATION_HOLD_DAYS * 86_400_000).toISOString();
}

// ── Banking details ───────────────────────────────────────────────────────────

export interface PropertyBankingDetails {
  bank_name?: string | null;
  branch_code?: string | null;
  account_holder?: string | null;
  account_number?: string | null;
  account_type?: string | null;
  swift_code?: string | null;
}

/** Pulls the banking block captured on the property (amenities.banking). */
export function extractBankingDetails(
  amenities: unknown,
): PropertyBankingDetails | null {
  const banking = (amenities as { banking?: PropertyBankingDetails } | null)?.banking;
  if (!banking) return null;
  const hasAny =
    !!banking.bank_name || !!banking.account_number || !!banking.account_holder;
  return hasAny ? banking : null;
}

export function bankingLines(b: PropertyBankingDetails): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (b.account_holder) rows.push({ label: "Account holder", value: b.account_holder });
  if (b.bank_name) rows.push({ label: "Bank", value: b.bank_name });
  if (b.account_number) rows.push({ label: "Account number", value: b.account_number });
  if (b.account_type) rows.push({ label: "Account type", value: b.account_type });
  if (b.branch_code) rows.push({ label: "Branch code", value: b.branch_code });
  if (b.swift_code) rows.push({ label: "SWIFT / BIC", value: b.swift_code });
  return rows;
}

// ── Canonical payment model resolution ────────────────────────────────────────
/**
 * The commercial record of how a property collects money. Billing configs now
 * store this explicitly (`payment_model`); older rows are inferred from the
 * facilitator flag / gateway fee, and finally from the property switch.
 */
export interface PaymentModelConfigLike {
  payment_model?: string | null;
  payment_facilitator_enabled?: boolean | null;
  byo_gateway_monthly_fee?: number | null;
}

export interface PaymentModelSources {
  /** Property-level billing config (highest priority). */
  config?: PaymentModelConfigLike | null;
  /** Portfolio-level billing config, used when the property has none. */
  portfolioConfig?: PaymentModelConfigLike | null;
  /** Operational switch stored on the property row. */
  property?: { payment_mode?: string | null; allow_custom_payment_provider?: boolean | null } | null;
}

function fromConfig(cfg?: PaymentModelConfigLike | null): PaymentMode | null {
  if (!cfg) return null;
  if (isPaymentMode(cfg.payment_model)) return cfg.payment_model;
  if (cfg.payment_facilitator_enabled) return "rol";
  if ((cfg.byo_gateway_monthly_fee ?? 0) > 0) return "byo";
  return null;
}

export function resolvePaymentModel(sources: PaymentModelSources): PaymentMode {
  return (
    fromConfig(sources.config) ??
    fromConfig(sources.portfolioConfig) ??
    (isPaymentMode(sources.property?.payment_mode)
      ? (sources.property!.payment_mode as PaymentMode)
      : sources.property?.allow_custom_payment_provider
        ? "byo"
        : "reservation_only")
  );
}

export function paymentModelLabel(mode: PaymentMode): string {
  return PAYMENT_MODES.find((m) => m.value === mode)?.label ?? mode;
}
