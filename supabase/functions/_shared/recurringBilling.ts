/**
 * Recurring platform fees — the monthly components ROL bills for a property or
 * portfolio, derived from the billing config that already drives the estimator
 * on Admin → Billing Defaults.
 *
 * Pure functions only: the caller supplies the resolved config, globals and unit
 * count, so the same composition can be reused by an invoice run, a forecast, or
 * a preview without touching the database twice.
 */

export interface PricingTier {
  min_rooms?: number | null;
  max_rooms?: number | null;
  monthly_fee?: number | null;
  label?: string | null;
}

export const DEFAULT_TIERS: PricingTier[] = [
  { min_rooms: 0, max_rooms: 9, monthly_fee: 450, label: "xs" },
  { min_rooms: 10, max_rooms: 19, monthly_fee: 600, label: "s" },
  { min_rooms: 20, max_rooms: 50, monthly_fee: 750, label: "m" },
  { min_rooms: 51, max_rooms: null, monthly_fee: 925, label: "l" },
];

const TIER_STRATEGIES = ["rolos_pms", "volume_tiered"];

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function normalizeTiers(input: unknown): PricingTier[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      min_rooms: r.min_rooms == null ? 0 : Number(r.min_rooms),
      max_rooms: r.max_rooms == null || r.max_rooms === "" ? null : Number(r.max_rooms),
      monthly_fee: r.monthly_fee == null || r.monthly_fee === "" ? null : Number(r.monthly_fee),
      label: typeof r.label === "string" ? r.label : null,
    }))
    .filter((t) => Number.isFinite(Number(t.min_rooms)));
}

export function resolveTier(rooms: number, tiers: PricingTier[]): PricingTier | null {
  const sorted = [...tiers].sort(
    (a, b) => (a.max_rooms ?? Number.POSITIVE_INFINITY) - (b.max_rooms ?? Number.POSITIVE_INFINITY),
  );
  for (const t of sorted) {
    const min = num(t.min_rooms);
    const max = t.max_rooms == null ? Number.POSITIVE_INFINITY : num(t.max_rooms);
    if (rooms >= min && rooms <= max) return t;
  }
  return sorted[sorted.length - 1] ?? null;
}

export interface RecurringConfigLike {
  billing_strategy?: string | null;
  billing_enabled?: boolean | null;
  subscription_fee_monthly?: number | null;
  tier_pricing_json?: unknown;
  enterprise_custom_fee?: number | null;
  channel_manager_enabled?: boolean | null;
  channel_manager_per_unit_fee?: number | null;
  pricelabs_allowed?: boolean | null;
  pricelabs_monthly_fee?: number | null;
  white_label_allowed?: boolean | null;
  white_label_monthly_fee?: number | null;
  white_label_billing_mode?: string | null;
  branding_addon_enabled?: boolean | null;
  branding_addon_monthly_fee?: number | null;
  branding_addon_billing_mode?: string | null;
  byo_gateway_monthly_fee?: number | null;
  portfolio_aggregator_billing_mode?: string | null;
  portfolio_aggregator_monthly_default?: number | null;
}

export interface RecurringGlobalsLike {
  strategy?: string | null;
  default_subscription_fee?: number | null;
  tier_pricing_json?: unknown;
  enterprise_custom_fee?: number | null;
  channel_manager_per_unit_fee?: number | null;
  pricelabs_monthly_fee?: number | null;
  white_label_monthly_fee?: number | null;
  branding_addon_monthly_fee?: number | null;
  byo_gateway_monthly_fee?: number | null;
  portfolio_aggregator_monthly_default?: number | null;
}

export interface RecurringComponent {
  /** Stable key so a line can be traced back to the config field that produced it. */
  key: string;
  description: string;
  amount: number;
  quantity: number;
  rate: number;
}

/** Pick the globals row matching the config's strategy, falling back to `default`. */
export function pickRecurringGlobals(
  rows: RecurringGlobalsLike[] | null | undefined,
  strategy?: string | null,
): RecurringGlobalsLike {
  const list = rows || [];
  const want = String(strategy || "default").toLowerCase();
  return (
    list.find((r) => String(r.strategy || "").toLowerCase() === want) ||
    list.find((r) => String(r.strategy || "").toLowerCase() === "default") ||
    list[0] ||
    {}
  );
}

/**
 * Build the monthly recurring lines for one settlement group.
 *
 * `units` is the total sellable unit count the tier and channel per-unit fee are
 * priced on (portfolio-wide when the group is a portfolio).
 */
export function buildRecurringComponents(
  config: RecurringConfigLike | null,
  globals: RecurringGlobalsLike,
  units: number,
  opts: { isPortfolio?: boolean } = {},
): RecurringComponent[] {
  const out: RecurringComponent[] = [];
  if (!config) return out;
  if (config.billing_enabled === false) return out;

  const strategy = String(config.billing_strategy || "").toLowerCase();

  // 1. PMS subscription — flat fee if set, otherwise the room-count tier.
  if (strategy !== "enterprise_white_label") {
    let subscription = num(config.subscription_fee_monthly);
    let label = "ROL'OS PMS subscription";
    if (subscription <= 0 && (TIER_STRATEGIES.includes(strategy) || !strategy)) {
      const tiers = normalizeTiers(config.tier_pricing_json).length
        ? normalizeTiers(config.tier_pricing_json)
        : normalizeTiers(globals.tier_pricing_json).length
          ? normalizeTiers(globals.tier_pricing_json)
          : DEFAULT_TIERS;
      const tier = resolveTier(units, tiers);
      const tierFee = tier?.monthly_fee ?? null;
      subscription =
        tierFee != null
          ? num(tierFee)
          : num(config.enterprise_custom_fee ?? globals.enterprise_custom_fee);
      if (tier?.label) label = `ROL'OS PMS subscription — tier ${String(tier.label).toUpperCase()} (${units} unit${units === 1 ? "" : "s"})`;
    }
    if (subscription <= 0) subscription = num(globals.default_subscription_fee);
    if (subscription > 0) {
      out.push({ key: "subscription", description: label, amount: round2(subscription), quantity: 1, rate: 0 });
    }
  } else {
    const custom = num(config.enterprise_custom_fee ?? globals.enterprise_custom_fee);
    if (custom > 0) {
      out.push({
        key: "enterprise",
        description: "Enterprise white-label licence",
        amount: round2(custom),
        quantity: 1,
        rate: 0,
      });
    }
  }

  // 2. Channel manager — charged per connected unit.
  if (config.channel_manager_enabled && units > 0) {
    const perUnit = num(config.channel_manager_per_unit_fee ?? globals.channel_manager_per_unit_fee);
    if (perUnit > 0) {
      out.push({
        key: "channel_manager",
        description: `Channel distribution — ${units} unit${units === 1 ? "" : "s"} @ ${perUnit.toFixed(2)}`,
        amount: round2(perUnit * units),
        quantity: units,
        rate: perUnit,
      });
    }
  }

  // 3. PriceLabs revenue management.
  if (config.pricelabs_allowed) {
    const fee = num(config.pricelabs_monthly_fee ?? globals.pricelabs_monthly_fee);
    if (fee > 0) {
      out.push({ key: "pricelabs", description: "PriceLabs revenue management", amount: round2(fee), quantity: 1, rate: 0 });
    }
  }

  // 4. White-label — only billed monthly here; annual licences are invoiced once.
  if (config.white_label_allowed && String(config.white_label_billing_mode || "monthly") === "monthly") {
    const fee = num(config.white_label_monthly_fee ?? globals.white_label_monthly_fee);
    if (fee > 0) {
      out.push({ key: "white_label", description: "White-label booking site", amount: round2(fee), quantity: 1, rate: 0 });
    }
  }

  // 5. Branding pack.
  if (config.branding_addon_enabled && String(config.branding_addon_billing_mode || "monthly") === "monthly") {
    const fee = num(config.branding_addon_monthly_fee ?? globals.branding_addon_monthly_fee);
    if (fee > 0) {
      out.push({ key: "branding", description: "Branding pack", amount: round2(fee), quantity: 1, rate: 0 });
    }
  }

  // 6. BYO gateway support fee — only when the property actually collects via
  //    its own gateway. ROL-processed and reservation-only clients never pay it,
  //    even when a global default fee exists.
  if (resolvePaymentModel({ config }) === "byo") {
    const byoFee = num(config.byo_gateway_monthly_fee ?? globals.byo_gateway_monthly_fee);
    if (byoFee > 0) {
      out.push({ key: "byo_gateway", description: "Own payment gateway integration", amount: round2(byoFee), quantity: 1, rate: 0 });
    }
  }

  // 7. Portfolio aggregator surface.
  if (opts.isPortfolio && String(config.portfolio_aggregator_billing_mode || "none") === "monthly") {
    const fee = num(config.portfolio_aggregator_monthly_default ?? globals.portfolio_aggregator_monthly_default);
    if (fee > 0) {
      out.push({ key: "aggregator", description: "Portfolio aggregator site", amount: round2(fee), quantity: 1, rate: 0 });
    }
  }

  return out;
}
