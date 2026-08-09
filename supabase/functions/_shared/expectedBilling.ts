// Contracted (expected) billing amounts — SINGLE SOURCE OF TRUTH shared with
// the front-end `src/lib/billingExpected.ts`. Keep the two in step: the number
// shown on the "Estimated client cost" card, the number invoiced, and the
// number compared against the live PayFast subscription must always match.

export type PaymentModel = "rol" | "byo" | "reservation_only";

export interface ExpectedTier {
  min_rooms: number;
  max_rooms: number | null;
  monthly_fee: number | null;
  label?: string;
}

export interface ExpectedBillingLine {
  label: string;
  amount: number;
  once?: boolean;
}

export interface ExpectedBilling {
  monthly: number;
  setup: number;
  lines: ExpectedBillingLine[];
  requiresCustomFee: boolean;
}

export const TIER_STRATEGIES = ["rolos_pms", "pms_tiered", "tiered"];

export function isTierStrategy(strategy?: string | null): boolean {
  return TIER_STRATEGIES.includes(String(strategy || ""));
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function resolveTierFee(tiers: ExpectedTier[] | null, rooms: number): ExpectedTier | null {
  if (!tiers?.length) return null;
  const sorted = [...tiers].sort((a, b) => a.min_rooms - b.min_rooms);
  for (const t of sorted) {
    const max = t.max_rooms == null ? Infinity : t.max_rooms;
    if (rooms >= t.min_rooms && rooms <= max) return t;
  }
  return sorted[sorted.length - 1] ?? null;
}

export function resolvePaymentModel(cfg: any, property?: { payment_mode?: string | null; allow_custom_payment_provider?: boolean | null } | null): PaymentModel {
  const isMode = (v: unknown): v is PaymentModel =>
    v === "rol" || v === "byo" || v === "reservation_only";
  if (isMode(cfg?.payment_model)) return cfg.payment_model;
  if (cfg?.payment_facilitator_enabled) return "rol";
  if (num(cfg?.byo_gateway_monthly_fee) > 0) return "byo";
  if (isMode(property?.payment_mode)) return property!.payment_mode as PaymentModel;
  return property?.allow_custom_payment_provider ? "byo" : "reservation_only";
}

export interface ExpectedBillingContext {
  /** Sellable units used for per-unit charges (channel manager). */
  units: number;
  /** Rooms used for tier resolution. */
  rooms: number;
  /** Fallback tiers when the config carries none. */
  tiers?: ExpectedTier[] | null;
  property?: { payment_mode?: string | null; allow_custom_payment_provider?: boolean | null } | null;
}

export function computeExpectedBilling(cfg: any, ctx: ExpectedBillingContext): ExpectedBilling {
  const lines: ExpectedBillingLine[] = [];
  let requiresCustomFee = false;
  const push = (label: string, amount: unknown, once = false) => {
    const n = num(amount);
    if (n > 0) lines.push({ label, amount: n, once });
  };

  if (!cfg) return { monthly: 0, setup: 0, lines, requiresCustomFee };

  const strategy = String(cfg.billing_strategy || "default");
  const units = Math.max(0, num(ctx.units));
  const rooms = cfg.room_count_override != null ? num(cfg.room_count_override) : Math.max(0, num(ctx.rooms));

  if (isTierStrategy(strategy)) {
    const tiers = (Array.isArray(cfg.tier_pricing_json) && cfg.tier_pricing_json.length
      ? (cfg.tier_pricing_json as ExpectedTier[])
      : ctx.tiers) ?? null;
    const tier = resolveTierFee(tiers, rooms);
    const tierFee = tier?.monthly_fee ?? (num(cfg.enterprise_custom_fee) || null);
    const label = tier?.label ? ` — ${String(tier.label).toUpperCase()}` : "";
    if (tierFee && tierFee > 0) {
      push(`PMS Subscription${label} (${rooms} room${rooms === 1 ? "" : "s"})`, tierFee);
    } else {
      requiresCustomFee = true;
    }
  } else {
    push("Subscription", cfg.subscription_fee_monthly);
  }

  if (cfg.channel_manager_enabled && units > 0) {
    const perUnit = num(cfg.channel_manager_per_unit_fee);
    if (perUnit > 0) push(`Channel Manager (${units} × ${perUnit})`, perUnit * units);
  }

  if (cfg.white_label_allowed) {
    const annual = cfg.white_label_billing_mode === "annual";
    const wl = num(cfg.white_label_monthly_fee);
    if (wl > 0) push(`White-Label licence${annual ? " (annual/12)" : ""}`, annual ? wl / 12 : wl);
  }
  push("White-Label setup", cfg.white_label_setup_fee, true);

  if (!cfg.white_label_allowed && cfg.branding_addon_enabled) {
    push("Branding add-on", cfg.branding_addon_monthly_fee);
  }
  push("Branding add-on setup", cfg.branding_addon_setup_fee, true);

  if (cfg.pricelabs_allowed) push("PriceLabs add-on", cfg.pricelabs_monthly_fee);
  push("PriceLabs setup", cfg.pricelabs_setup_fee, true);

  if (resolvePaymentModel(cfg, ctx.property) === "byo") {
    push("BYO payment gateway add-on", cfg.byo_gateway_monthly_fee);
  }

  const monthly = lines.filter((l) => !l.once).reduce((s, l) => s + l.amount, 0);
  const setup = lines.filter((l) => l.once).reduce((s, l) => s + l.amount, 0);
  return { monthly: Math.round(monthly * 100) / 100, setup: Math.round(setup * 100) / 100, lines, requiresCustomFee };
}
