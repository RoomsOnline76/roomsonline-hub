import { supabase } from "@/integrations/supabase/client";
import { resolvePropertyTier, isTierStrategy } from "@/lib/billingTierResolver";
import { DEFAULT_LISTING_RATE, DEFAULT_PMS_RATE } from "@/lib/commissionResolver";
import { paymentModelLabel, resolvePaymentModel } from "@/lib/paymentMode";
import {
  GATEWAY_MODEL_LABELS,
  getEffectiveBillingRate,
  loadGatewaySchedule,
  loadPeriodVolume,
  normalizeGatewayModel,
  normalizeVolumeTiers,
  summariseVolumeTiers,
} from "@/lib/gatewayBillingRate";

const STRATEGY_LABELS: Record<string, string> = {
  default: "Standard Commission",
  widget: "Widget Distribution",
  saas: "SaaS Subscription",
  portfolio: "Portfolio Partnership",
  enterprise: "Enterprise Agreement",
  enterprise_white_label: "Enterprise White Label",
  "volume-tiered": "Volume-Tiered Pricing",
  volume_tiered: "Volume-Tiered Pricing",
  rolos_pms: "ROL'OS PMS Subscription",
  payment_facilitator: "Payment Facilitator",
};

const NA = "<!-- N/A -->";

export function numberToWords(n: number): string {
  const ones = ["zero","one","two","three","four","five","six","seven","eight","nine","ten",
    "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  if (n < 20) return ones[n] || String(n);
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "");
  return String(n);
}

/** "ten percent (10%)" */
export function ratePhrase(rate: number): string {
  const rounded = Math.round(rate);
  const words = numberToWords(rounded);
  return `${words} percent (${rate}%)`;
}

/** Where a resolved value came from — surfaced in admin UIs. */
export type BillingVarSource =
  | "commercial_term"
  | "portfolio"
  | "property"
  | "global_default"
  | "constant"
  | "none";

export interface BillingContractVariables {
  billing_strategy_label: string;

  /** Shared/legacy commission phrase (listing rate). */
  commission_rate: string;
  commission_clause: string;
  /** Split commissions. */
  listing_commission_rate: string;
  listing_commission_clause: string;
  pms_commission_rate: string;
  pms_commission_clause: string;
  widget_flat_commission_rate: string;
  widget_flat_commission_clause: string;

  subscription_fee_monthly: string;
  subscription_clause: string;

  white_label_monthly_fee: string;
  white_label_setup_fee: string;
  white_label_billing_mode: string;
  white_label_clause: string;

  branding_addon_monthly_fee: string;
  branding_addon_setup_fee: string;
  branding_addon_clause: string;

  pricelabs_monthly_fee: string;
  pricelabs_setup_fee: string;
  pricelabs_clause: string;

  channel_manager_per_unit_fee: string;
  channel_manager_clause: string;

  /** Human label for the agreed payment model. */
  payment_model_label: string;
  payment_facilitator_fee: string;
  payment_facilitator_clause: string;
  byo_gateway_fee: string;
  byo_gateway_clause: string;
  /** Emitted only for reservation-only properties (no online payment). */
  reservation_only_clause: string;

  /** Gateway billing schedule actually applied to this Property. */
  billing_model: string;
  billing_percentage: string;
  billing_fixed_fee: string;
  billing_monthly_fee: string;
  billing_volume_tiers_summary: string;
  billing_config_version: string;
  billing_schedule_clause: string;


  enterprise_fee: string;
  enterprise_fee_clause: string;

  volume_tier_clause: string;
  tier_monthly_fee: string;
  tier_room_count: string;
  tier_clause: string;

  /** Provenance of each resolved figure. */
  sources: Record<string, BillingVarSource>;
  /** Scope the billing config was read from. */
  scope: "portfolio" | "property" | "global";
  portfolio_name: string;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const money = (v: number) => `R${v.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;

function emptyVars(): BillingContractVariables {
  return {
    billing_strategy_label: "Standard Commission",
    commission_rate: ratePhrase(DEFAULT_LISTING_RATE),
    commission_clause: "",
    listing_commission_rate: ratePhrase(DEFAULT_LISTING_RATE),
    listing_commission_clause: "",
    pms_commission_rate: ratePhrase(DEFAULT_PMS_RATE),
    pms_commission_clause: "",
    widget_flat_commission_rate: "",
    widget_flat_commission_clause: NA,
    subscription_fee_monthly: "",
    subscription_clause: NA,
    white_label_monthly_fee: "",
    white_label_setup_fee: "",
    white_label_billing_mode: "monthly",
    white_label_clause: NA,
    branding_addon_monthly_fee: "",
    branding_addon_setup_fee: "",
    branding_addon_clause: NA,
    pricelabs_monthly_fee: "",
    pricelabs_setup_fee: "",
    pricelabs_clause: NA,
    channel_manager_per_unit_fee: "",
    channel_manager_clause: NA,
    payment_model_label: "",
    payment_facilitator_fee: "",
    payment_facilitator_clause: NA,
    byo_gateway_fee: "",
    byo_gateway_clause: NA,
    reservation_only_clause: NA,
    billing_model: NA,
    billing_percentage: "",
    billing_fixed_fee: "",
    billing_monthly_fee: "",
    billing_volume_tiers_summary: NA,
    billing_config_version: "",
    billing_schedule_clause: NA,

    enterprise_fee: "",
    enterprise_fee_clause: NA,
    volume_tier_clause: NA,
    tier_monthly_fee: "",
    tier_room_count: "",
    tier_clause: NA,
    sources: {},
    scope: "global",
    portfolio_name: "",
  };
}

interface ResolvedScope {
  scope: "portfolio" | "property" | "global";
  portfolioId: string | null;
  portfolioName: string;
  config: Record<string, any> | null;
}

/**
 * Portfolio-aware billing config lookup — mirrors `useBillingConfig`:
 * a property that belongs to a portfolio is billed from the shared
 * `portfolio_billing_configs` row, otherwise its own property row.
 */
async function resolveScopedConfig(propertyIds: string[]): Promise<ResolvedScope> {
  const primary = propertyIds[0];
  if (!primary) return { scope: "global", portfolioId: null, portfolioName: "", config: null };

  const { data: mem } = await supabase
    .from("property_portfolio_members")
    .select("portfolio_id")
    .in("property_id", propertyIds)
    .limit(1)
    .maybeSingle();

  const portfolioId = (mem?.portfolio_id as string | undefined) || null;

  if (portfolioId) {
    const [{ data: cfg }, { data: pf }] = await Promise.all([
      supabase
        .from("portfolio_billing_configs" as any)
        .select("*")
        .eq("portfolio_id", portfolioId)
        .maybeSingle(),
      supabase.from("property_portfolios").select("name").eq("id", portfolioId).maybeSingle(),
    ]);
    if (cfg) {
      return {
        scope: "portfolio",
        portfolioId,
        portfolioName: (pf?.name as string | undefined) || "",
        config: cfg as Record<string, any>,
      };
    }
  }

  const { data: propCfg } = await supabase
    .from("property_billing_configs")
    .select("*")
    .in("property_id", propertyIds)
    .limit(1)
    .maybeSingle();

  if (propCfg) {
    return { scope: "property", portfolioId, portfolioName: "", config: propCfg as Record<string, any> };
  }
  return { scope: "global", portfolioId, portfolioName: "", config: null };
}

/** Pick the global defaults row that matches the strategy, else the generic one. */
function pickGlobalsRow(rows: Record<string, any>[] | null, strategy: string): Record<string, any> | null {
  if (!rows?.length) return null;
  const want = (strategy || "default").toLowerCase();
  return (
    rows.find((r) => String(r.strategy || "").toLowerCase() === want) ||
    rows.find((r) => String(r.strategy || "").toLowerCase() === "default") ||
    rows[0]
  );
}

/**
 * Fetches billing for a property (portfolio-aware), layers in global defaults and
 * any active commercial term, and returns pre-rendered contract clause variables.
 *
 * Cascade per figure: commercial term → property/portfolio billing config →
 * billing_global_defaults (strategy row) → platform constant.
 */
export async function resolveBillingContractVariables(
  propertyIds: string[]
): Promise<BillingContractVariables> {
  const out = emptyVars();
  if (!propertyIds.length) return out;

  const today = new Date().toISOString().split("T")[0];

  const [scoped, globalsRes, termsRes] = await Promise.all([
    resolveScopedConfig(propertyIds),
    supabase.from("billing_global_defaults").select("*"),
    supabase
      .from("property_commercial_terms")
      .select("revenue_share_percent, commission_type, effective_from")
      .in("property_id", propertyIds)
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order("effective_from", { ascending: false }),
  ]);

  const config = scoped.config;
  const strategy = String(config?.billing_strategy || "default");
  const globals = pickGlobalsRow((globalsRes.data as any[]) || null, strategy);
  const terms = (termsRes.data as any[]) || [];
  const termFor = (type: string) =>
    num(terms.find((t) => String(t.commission_type || "").toLowerCase() === type)?.revenue_share_percent);

  const cfgScope: BillingVarSource = scoped.scope === "portfolio" ? "portfolio" : "property";
  out.scope = scoped.scope;
  out.portfolio_name = scoped.portfolioName;
  out.billing_strategy_label = STRATEGY_LABELS[strategy] || strategy;

  /** Resolve one numeric figure through the cascade. */
  const pick = (
    key: string,
    opts: { term?: number | null; cfgField?: string | string[]; globalField?: string | string[]; fallback?: number | null },
  ): number | null => {
    if (opts.term != null) {
      out.sources[key] = "commercial_term";
      return opts.term;
    }
    const cfgFields = ([] as string[]).concat(opts.cfgField || []);
    for (const f of cfgFields) {
      const v = num(config?.[f]);
      if (v != null) {
        out.sources[key] = cfgScope;
        return v;
      }
    }
    const globalFields = ([] as string[]).concat(opts.globalField || []);
    for (const f of globalFields) {
      const v = num(globals?.[f]);
      if (v != null) {
        out.sources[key] = "global_default";
        return v;
      }
    }
    if (opts.fallback != null) {
      out.sources[key] = "constant";
      return opts.fallback;
    }
    out.sources[key] = "none";
    return null;
  };

  const isEnterpriseWl = strategy === "enterprise_white_label";

  // ── Commissions ──────────────────────────────────────────────────────────
  const listing = pick("listing_commission_rate", {
    term: termFor("listing"),
    cfgField: ["listing_commission_rate", "commission_rate"],
    globalField: ["listing_commission_rate", "default_commission_rate"],
    fallback: DEFAULT_LISTING_RATE,
  });
  const pms = pick("pms_commission_rate", {
    term: termFor("pms"),
    cfgField: ["pms_commission_rate"],
    globalField: ["pms_commission_rate"],
    fallback: DEFAULT_PMS_RATE,
  });
  const widgetFlat = pick("widget_flat_commission_rate", {
    cfgField: ["widget_flat_commission_rate"],
    globalField: ["widget_flat_commission_rate"],
  });

  const listingRate = isEnterpriseWl ? 0 : listing ?? DEFAULT_LISTING_RATE;
  const pmsRate = isEnterpriseWl ? 0 : pms ?? DEFAULT_PMS_RATE;

  out.listing_commission_rate = ratePhrase(listingRate);
  out.commission_rate = out.listing_commission_rate;
  out.pms_commission_rate = ratePhrase(pmsRate);
  out.listing_commission_clause = isEnterpriseWl
    ? "No booking commission is levied under the enterprise white-label subscription model."
    : `A commission of ${ratePhrase(listingRate)} of the gross booking value applies to bookings originating on RoomsOnline marketplace and journey surfaces.`;
  out.pms_commission_clause = isEnterpriseWl
    ? NA
    : `A commission of ${ratePhrase(pmsRate)} of the gross booking value applies to bookings originating on the Property's own surfaces (direct, white-label site, widget, embed, WordPress plugin or API).`;
  out.commission_clause = out.listing_commission_clause;

  if (widgetFlat != null && !isEnterpriseWl) {
    out.widget_flat_commission_rate = ratePhrase(widgetFlat);
    out.widget_flat_commission_clause = `Bookings taken through the Web Booking Engine (widget) are charged at a flat ${ratePhrase(widgetFlat)} of the gross booking value.`;
  }

  // ── Subscription / tier ──────────────────────────────────────────────────
  const subFee = pick("subscription_fee_monthly", {
    cfgField: ["subscription_fee_monthly"],
    globalField: ["default_subscription_fee"],
  });
  if (subFee != null && subFee > 0) {
    out.subscription_fee_monthly = String(subFee);
    out.subscription_clause = `A platform subscription of ${money(subFee)} per month is payable in advance.`;
  }

  if (isTierStrategy(strategy)) {
    try {
      const info = await resolvePropertyTier(propertyIds[0]);
      if (info.tier) {
        out.tier_monthly_fee = String(info.tier.monthly_fee);
        out.tier_room_count = String(info.rooms);
        out.sources.tier_monthly_fee = cfgScope;
        const feeWords = numberToWords(Math.round(info.tier.monthly_fee ?? 0));
        const roomsWords = numberToWords(info.rooms);
        const propsWords = numberToWords(info.properties);
        const scopeLabel = info.scope === "portfolio" ? "portfolio" : "property";
        const propsPart =
          info.scope === "portfolio"
            ? ` across ${propsWords} (${info.properties}) ${info.properties === 1 ? "property" : "properties"}`
            : "";
        const bumpNote = info.bumpedByPropertyCount
          ? ` The portfolio's property count exceeds the room-bracket cap, so the next tier applies.`
          : "";
        out.tier_clause = `Based on a ${scopeLabel} of ${roomsWords} (${info.rooms}) rooms${propsPart}, the applicable monthly subscription is ${feeWords} Rand (R${info.tier.monthly_fee}) per month.${bumpNote}`;
        out.volume_tier_clause = out.tier_clause;
      }
    } catch (e) {
      console.warn("[contractBillingVariables] tier resolution failed", e);
    }
  }

  // ── White label ──────────────────────────────────────────────────────────
  const wlAllowed = config ? !!config.white_label_allowed : false;
  const wlMonthly = pick("white_label_monthly_fee", {
    cfgField: ["white_label_monthly_fee"],
    globalField: ["white_label_monthly_fee"],
  });
  const wlSetup = pick("white_label_setup_fee", {
    cfgField: ["white_label_setup_fee"],
    globalField: ["white_label_setup_fee"],
  });
  const wlMode = String(config?.white_label_billing_mode || globals?.white_label_billing_mode || "monthly");
  out.white_label_billing_mode = wlMode;
  if (wlMonthly != null) out.white_label_monthly_fee = String(wlMonthly);
  if (wlSetup != null) out.white_label_setup_fee = String(wlSetup);
  if (wlAllowed || isEnterpriseWl) {
    const parts = [
      wlMonthly != null && wlMonthly > 0
        ? `${money(wlMonthly)} per ${wlMode === "annual" ? "annum" : "month"}`
        : null,
      wlSetup != null && wlSetup > 0 ? `a once-off setup fee of ${money(wlSetup)}` : null,
    ].filter(Boolean);
    out.white_label_clause = parts.length
      ? `The white-label booking site is licensed at ${parts.join(" plus ")}.`
      : `The white-label booking site is included in the Property's package.`;
  }

  // ── Branding add-on ──────────────────────────────────────────────────────
  const brandingEnabled = config ? !!config.branding_addon_enabled : !!globals?.branding_addon_allowed;
  const brandMonthly = pick("branding_addon_monthly_fee", {
    cfgField: ["branding_addon_monthly_fee"],
    globalField: ["branding_addon_monthly_fee"],
  });
  const brandSetup = pick("branding_addon_setup_fee", {
    cfgField: ["branding_addon_setup_fee"],
    globalField: ["branding_addon_setup_fee"],
  });
  const brandMode = String(config?.branding_addon_billing_mode || globals?.branding_addon_billing_mode || "monthly");
  if (brandMonthly != null) out.branding_addon_monthly_fee = String(brandMonthly);
  if (brandSetup != null) out.branding_addon_setup_fee = String(brandSetup);
  if (brandingEnabled) {
    const parts = [
      brandMonthly != null && brandMonthly > 0
        ? `${money(brandMonthly)} per ${brandMode === "annual" ? "annum" : "month"}`
        : null,
      brandSetup != null && brandSetup > 0 ? `a once-off setup fee of ${money(brandSetup)}` : null,
    ].filter(Boolean);
    out.branding_addon_clause = parts.length
      ? `The Branding Pack (custom palette, fonts and branded communications) is charged at ${parts.join(" plus ")}.`
      : `The Branding Pack is included in the Property's package.`;
  }

  // ── PriceLabs ────────────────────────────────────────────────────────────
  const plAllowed = config ? !!config.pricelabs_allowed : false;
  const plMonthly = pick("pricelabs_monthly_fee", {
    cfgField: ["pricelabs_monthly_fee"],
    globalField: ["pricelabs_monthly_fee"],
  });
  const plSetup = pick("pricelabs_setup_fee", {
    cfgField: ["pricelabs_setup_fee"],
    globalField: ["pricelabs_setup_fee"],
  });
  if (plMonthly != null) out.pricelabs_monthly_fee = String(plMonthly);
  if (plSetup != null) out.pricelabs_setup_fee = String(plSetup);
  if (plAllowed) {
    const parts = [
      plMonthly != null && plMonthly > 0 ? `${money(plMonthly)} per property per month` : null,
      plSetup != null && plSetup > 0 ? `a once-off setup fee of ${money(plSetup)}` : null,
    ].filter(Boolean);
    out.pricelabs_clause = parts.length
      ? `Automated revenue management (PriceLabs) is charged at ${parts.join(" plus ")}.`
      : `Automated revenue management (PriceLabs) is included in the Property's package.`;
  }

  // ── Channel manager ──────────────────────────────────────────────────────
  const cmEnabled = config ? !!config.channel_manager_enabled : false;
  const cmFee = pick("channel_manager_per_unit_fee", {
    cfgField: ["channel_manager_per_unit_fee"],
    globalField: ["channel_manager_per_unit_fee"],
  });
  if (cmFee != null) out.channel_manager_per_unit_fee = String(cmFee);
  if (cmEnabled) {
    out.channel_manager_clause =
      cmFee != null && cmFee > 0
        ? `Channel management (OTA distribution via the ROL'OS Channel Manager) is charged at ${money(cmFee)} per bookable unit per month.`
        : `Channel management (OTA distribution) is included in the Property's package.`;
  }

  // ── Payments ─────────────────────────────────────────────────────────────
  // The agreed payment model is a single explicit choice. Each clause is gated
  // on it so a reservation-only Property never receives gateway wording.
  const paymentModel = resolvePaymentModel({ config: config as never });
  out.payment_model_label = paymentModelLabel(paymentModel);
  const payFacFee = pick("payment_facilitator_fee", {
    cfgField: ["transaction_fee_percentage"],
    globalField: ["default_transaction_fee"],
  });
  const byoFee = pick("byo_gateway_fee", {
    cfgField: ["byo_gateway_monthly_fee"],
    globalField: ["byo_gateway_monthly_fee"],
  });
  if (paymentModel === "rol") {
    if (payFacFee != null) {
      out.payment_facilitator_fee = String(payFacFee);
      out.payment_facilitator_clause = `RoomsOnline processes guest payments as payment facilitator. A transaction fee of ${ratePhrase(payFacFee)} of the amount processed is recovered, and amounts due to the Property are settled net of commission and fees.`;
    } else {
      out.payment_facilitator_clause = `RoomsOnline processes guest payments as payment facilitator and settles amounts due to the Property net of commission and fees.`;
    }
  } else if (paymentModel === "byo") {
    if (byoFee != null) out.byo_gateway_fee = String(byoFee);
    out.byo_gateway_clause =
      byoFee != null && byoFee > 0
        ? `The Property collects guest payments through its own payment gateway. A gateway integration fee of ${money(byoFee)} per month applies and commission due to RoomsOnline is invoiced monthly.`
        : `The Property collects guest payments through its own payment gateway and commission due to RoomsOnline is invoiced monthly.`;
  } else {
    out.reservation_only_clause = `No online payment is processed for this Property. The guest reserves through the RoomsOnline platform and receives the Property's banking details on a pro forma invoice; the Property collects payment directly, confirms settlement in ROL'OS, and commission due to RoomsOnline is invoiced monthly rather than deducted at source. No payment facilitation or gateway integration fee applies.`;
  }

  // ── Gateway billing schedule ─────────────────────────────────────────────
  // Only ROL-processed properties carry a processing schedule; the contract
  // quotes the exact version that will be applied.
  if (paymentModel === "rol") {
    const schedule = await loadGatewaySchedule(propertyIds[0]);
    const cfg = schedule.config;
    if (cfg) {
      const volume = await loadPeriodVolume(propertyIds[0]);
      const rate = getEffectiveBillingRate(cfg, 0, volume, schedule.overrides);
      const model = normalizeGatewayModel(cfg.model);
      const tiers = normalizeVolumeTiers(cfg.volume_tiers);
      const banded = model === "hybrid" || model === "volume_tiered";

      out.billing_model = GATEWAY_MODEL_LABELS[model];
      out.billing_percentage = String(rate.percentage);
      out.billing_fixed_fee = String(rate.fixed_fee);
      out.billing_monthly_fee = String(rate.monthly_fee);
      out.billing_config_version = cfg.version != null ? String(cfg.version) : "";
      if (banded && tiers.length) out.billing_volume_tiers_summary = summariseVolumeTiers(tiers, rate.currency);

      // The schedule is the single source for the processing rate, so the
      // facilitator variables quote it rather than the legacy flat percentage.
      out.payment_facilitator_fee = String(rate.percentage);
      const facFeePart =
        rate.fixed_fee > 0
          ? `${ratePhrase(rate.percentage)} of the amount processed plus ${money(rate.fixed_fee)} per transaction`
          : `${ratePhrase(rate.percentage)} of the amount processed`;
      out.payment_facilitator_clause = `RoomsOnline processes guest payments as payment facilitator. A transaction fee of ${facFeePart} is recovered, and amounts due to the Property are settled net of commission and fees.`;


      const feePart =
        rate.fixed_fee > 0
          ? `${ratePhrase(rate.percentage)} of the amount processed plus ${money(rate.fixed_fee)} per transaction`
          : `${ratePhrase(rate.percentage)} of the amount processed`;
      const monthlyPart = rate.monthly_fee > 0 ? ` A platform fee of ${money(rate.monthly_fee)} per month applies.` : "";
      const tierPart =
        banded && tiers.length
          ? ` The applicable rate is banded on monthly processed volume: ${summariseVolumeTiers(tiers, rate.currency)}.`
          : "";
      const overridePart = rate.usedOverride ? " A negotiated rate agreed for this Property applies in place of the standard band." : "";
      out.billing_schedule_clause = `Payment processing is charged on the ${GATEWAY_MODEL_LABELS[model]} schedule${
        cfg.version != null ? ` (version ${cfg.version})` : ""
      }: ${feePart}.${tierPart}${monthlyPart}${overridePart}`;
    }
  }



  // ── Enterprise custom fee ────────────────────────────────────────────────
  const entFee = pick("enterprise_fee", {
    cfgField: ["enterprise_custom_fee"],
    globalField: ["enterprise_custom_fee"],
  });
  if (entFee != null && entFee > 0) {
    out.enterprise_fee = String(entFee);
    out.enterprise_fee_clause = `A negotiated enterprise licence fee of ${money(entFee)} per month applies in place of standard subscription and commission charges.`;
  }

  return out;
}

/** Flatten to the plain string map used for `{{variable}}` substitution. */
export function billingVariablesToMap(vars: BillingContractVariables): Record<string, string> {
  const { sources, scope, portfolio_name, ...rest } = vars;
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v ?? "")]));
}
