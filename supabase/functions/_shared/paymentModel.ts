/**
 * Canonical payment model for a property or portfolio, shared by the billing
 * crons and invoice generators. Mirrors src/lib/paymentMode.ts.
 */
export type PaymentModel = "rol" | "byo" | "reservation_only";

export interface PaymentModelConfigLike {
  payment_model?: string | null;
  payment_facilitator_enabled?: boolean | null;
  byo_gateway_monthly_fee?: number | null;
}

export function isPaymentModel(value: unknown): value is PaymentModel {
  return value === "rol" || value === "byo" || value === "reservation_only";
}

function fromConfig(cfg?: PaymentModelConfigLike | null): PaymentModel | null {
  if (!cfg) return null;
  if (isPaymentModel(cfg.payment_model)) return cfg.payment_model;
  if (cfg.payment_facilitator_enabled) return "rol";
  if (Number(cfg.byo_gateway_monthly_fee ?? 0) > 0) return "byo";
  return null;
}

export function resolvePaymentModel(sources: {
  config?: PaymentModelConfigLike | null;
  portfolioConfig?: PaymentModelConfigLike | null;
  property?: { payment_mode?: string | null; allow_custom_payment_provider?: boolean | null } | null;
}): PaymentModel {
  const fromCfg = fromConfig(sources.config) ?? fromConfig(sources.portfolioConfig);
  if (fromCfg) return fromCfg;
  const mode = sources.property?.payment_mode;
  if (isPaymentModel(mode)) return mode;
  return sources.property?.allow_custom_payment_provider ? "byo" : "reservation_only";
}

export function paymentModelLabel(model: PaymentModel): string {
  if (model === "rol") return "Rooms Online processes payments";
  if (model === "byo") return "Property's own payment gateway";
  return "Reservation only — no online payment";
}
