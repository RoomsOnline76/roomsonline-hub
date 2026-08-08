/**
 * Expected (contracted) billing amounts for a property or portfolio.
 *
 * This mirrors the "Estimated Client Cost" breakdown shown on the property /
 * portfolio billing overview so that ROL Pulse reports the same numbers the
 * client is actually contracted to pay. Pure functions only — callers supply
 * the resolved room/unit counts and tier fee.
 */

import { DEFAULT_TIERS, isTierStrategy, resolveTier, type PricingTier } from "@/lib/billingTierResolver";

export interface ExpectedBillingLine {
  label: string;
  amount: number;
  /** True for once-off (setup) charges. */
  once?: boolean;
}

export interface ExpectedBillingConfig {
  billing_strategy?: string | null;
  subscription_fee_monthly?: number | null;
  enterprise_custom_fee?: number | null;
  tier_pricing_json?: unknown;
  room_count_override?: number | null;
  channel_manager_enabled?: boolean | null;
  channel_manager_per_unit_fee?: number | null;
  white_label_allowed?: boolean | null;
  white_label_monthly_fee?: number | null;
  white_label_setup_fee?: number | null;
  white_label_billing_mode?: string | null;
  branding_addon_enabled?: boolean | null;
  branding_addon_monthly_fee?: number | null;
  branding_addon_setup_fee?: number | null;
  pricelabs_allowed?: boolean | null;
  pricelabs_monthly_fee?: number | null;
  pricelabs_setup_fee?: number | null;
  byo_gateway_monthly_fee?: number | null;
  payment_facilitator_enabled?: boolean | null;
}

export interface ExpectedBillingContext {
  /** Sellable units used for per-unit charges (channel manager). */
  units: number;
  /** Total rooms used for tier resolution (portfolio-wide where applicable). */
  rooms: number;
  /** True when the owner uses their own payment gateway. */
  byoGateway?: boolean;
}

export interface ExpectedBilling {
  monthly: number;
  setup: number;
  lines: ExpectedBillingLine[];
  /** True when the resolved tier needs a custom fee that has not been set. */
  requiresCustomFee: boolean;
}

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function normalizeTierRows(input: unknown): PricingTier[] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_TIERS;
  const rows = input
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const min = Number(r.min_rooms ?? 0);
      const max = r.max_rooms == null || r.max_rooms === "" ? null : Number(r.max_rooms);
      const fee = r.monthly_fee == null || r.monthly_fee === "" ? null : Number(r.monthly_fee);
      if (!Number.isFinite(min)) return null;
      return {
        min_rooms: min,
        max_rooms: max != null && Number.isFinite(max) ? max : null,
        max_properties: null,
        monthly_fee: fee != null && Number.isFinite(fee) ? fee : null,
        label: typeof r.label === "string" ? (r.label as PricingTier["label"]) : undefined,
      } satisfies PricingTier;
    })
    .filter((t): t is PricingTier => t !== null);
  return rows.length ? rows : DEFAULT_TIERS;
}

export function computeExpectedBilling(
  config: ExpectedBillingConfig | null | undefined,
  ctx: ExpectedBillingContext,
): ExpectedBilling {
  const lines: ExpectedBillingLine[] = [];
  let requiresCustomFee = false;
  const push = (label: string, amount: number | null | undefined, once = false) => {
    const n = num(amount);
    if (n > 0) lines.push({ label, amount: n, once });
  };

  if (!config) return { monthly: 0, setup: 0, lines, requiresCustomFee };

  const strategy = config.billing_strategy || "default";
  const units = Math.max(0, ctx.units);
  const rooms = config.room_count_override ?? Math.max(0, ctx.rooms);

  // PMS subscription — tier strategies resolve the fee from room count.
  if (isTierStrategy(strategy)) {
    const tier = resolveTier(rooms, normalizeTierRows(config.tier_pricing_json));
    const tierFee = tier?.monthly_fee ?? num(config.enterprise_custom_fee) || null;
    const tierLabel = tier?.label ? ` — ${tier.label.toUpperCase()}` : "";
    if (tierFee && tierFee > 0) {
      push(`PMS Subscription${tierLabel} (${rooms} room${rooms === 1 ? "" : "s"})`, tierFee);
    } else {
      requiresCustomFee = true;
    }
  } else {
    push("Subscription", config.subscription_fee_monthly);
  }

  // Channel Manager per-unit fee
  if (config.channel_manager_enabled && units > 0) {
    const perUnit = num(config.channel_manager_per_unit_fee);
    if (perUnit > 0) push(`Channel Manager (${units} × R${perUnit})`, perUnit * units);
  }

  // White-label licence + setup
  if (config.white_label_allowed) {
    const annual = config.white_label_billing_mode === "annual";
    const wl = num(config.white_label_monthly_fee);
    if (wl > 0) push(`White-Label licence${annual ? " (annual/12)" : ""}`, annual ? wl / 12 : wl);
  }
  push("White-Label setup", config.white_label_setup_fee, true);

  // Branding add-on (free when bundled with white-label)
  if (!config.white_label_allowed && config.branding_addon_enabled) {
    push("Branding add-on", config.branding_addon_monthly_fee);
  }
  push("Branding add-on setup", config.branding_addon_setup_fee, true);

  // PriceLabs revenue add-on
  if (config.pricelabs_allowed) push("PriceLabs add-on", config.pricelabs_monthly_fee);
  push("PriceLabs setup", config.pricelabs_setup_fee, true);

  // BYO gateway add-on
  if (ctx.byoGateway) push("BYO payment gateway add-on", config.byo_gateway_monthly_fee);

  const monthly = lines.filter((l) => !l.once).reduce((s, l) => s + l.amount, 0);
  const setup = lines.filter((l) => l.once).reduce((s, l) => s + l.amount, 0);
  return { monthly, setup, lines, requiresCustomFee };
}

/* ── Invoice kind classification ─────────────────────────────────────────── */

export type InvoiceStream = "monthly" | "once_off";

/**
 * `once_off` is the current kind for upfront setup invoices; `setup` is the
 * legacy spelling. Activation/renewal invoices are the monthly subscription.
 */
export function invoiceStream(kind: string | null | undefined): InvoiceStream {
  return kind === "once_off" || kind === "setup" ? "once_off" : "monthly";
}

export const PAID_INVOICE_STATUSES = ["paid"] as const;
export const OPEN_INVOICE_STATUSES = ["pending", "failed"] as const;
