import { supabase } from "@/integrations/supabase/client";
import { resolvePropertyTier, isTierStrategy, getPortfolioRoomCount } from "@/lib/billingTierResolver";
import { DEFAULT_LISTING_RATE, DEFAULT_PMS_RATE } from "@/lib/commissionResolver";

const STRATEGY_LABELS: Record<string, string> = {
  default: "Standard Commission",
  widget: "Widget Distribution",
  saas: "SaaS Subscription",
  portfolio: "Portfolio Partnership",
  enterprise: "Enterprise Agreement",
  enterprise_white_label: "Enterprise White-Label",
  "volume-tiered": "Volume-Tiered Pricing",
  volume_tiered: "Volume-Tiered Pricing",
  rolos_pms: "ROL'OS PMS Subscription",
  payment_facilitator: "Payment Facilitator",
};

const NA = "<!-- N/A -->";

function numberToWords(n: number): string {
  const ones = ["zero","one","two","three","four","five","six","seven","eight","nine","ten",
    "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 20) return ones[n] || String(n);
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "");
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return `${ones[h]} hundred${rest ? " and " + numberToWords(rest) : ""}`;
  }
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  return `${numberToWords(th)} thousand${rest ? " " + numberToWords(rest) : ""}`;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const money = (v: number) => `R${v.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
const pct = (v: number) => `${numberToWords(Math.round(v))} percent (${v}%)`;
const moneyWords = (v: number) => `${numberToWords(Math.round(v))} Rand (${money(v)})`;

const BILLING_MODE_LABEL: Record<string, string> = {
  monthly: "per month",
  once_off: "as a once-off charge",
  none: "at no charge",
};

export interface BillingContractVariables {
  billing_strategy_label: string;
  /** Legacy: headline commission (listing rate). */
  commission_rate: string;
  commission_clause: string;
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
  white_label_clause: string;
  branding_addon_monthly_fee: string;
  branding_addon_setup_fee: string;
  branding_addon_clause: string;
  pricelabs_monthly_fee: string;
  pricelabs_setup_fee: string;
  pricelabs_clause: string;
  channel_manager_per_unit_fee: string;
  channel_manager_unit_count: string;
  channel_manager_clause: string;
  enterprise_custom_fee: string;
  enterprise_clause: string;
  payment_facilitator_fee: string;
  payment_facilitator_clause: string;
  byo_gateway_fee: string;
  byo_gateway_clause: string;
  volume_tier_clause: string;
  tier_monthly_fee: string;
  tier_room_count: string;
  tier_clause: string;
  /** Rendered HTML table of every fee actually active for this property/portfolio. */
  fee_schedule_table: string;
  /** Plain-text equivalent of the fee schedule (one line per charge). */
  fee_schedule_text: string;
  /** Which scope the fees were resolved from. */
  billing_scope_label: string;
}

interface FeeRow {
  item: string;
  basis: string;
  amount: string;
}

const CONFIG_FIELDS =
  "billing_strategy, commission_rate, listing_commission_rate, pms_commission_rate, widget_flat_commission_rate, " +
  "subscription_fee_monthly, transaction_fee_percentage, payment_facilitator_enabled, byo_gateway_monthly_fee, " +
  "white_label_allowed, white_label_monthly_fee, white_label_setup_fee, white_label_billing_mode, " +
  "branding_addon_enabled, branding_addon_monthly_fee, branding_addon_setup_fee, branding_addon_billing_mode, " +
  "pricelabs_allowed, pricelabs_monthly_fee, pricelabs_setup_fee, " +
  "channel_manager_enabled, channel_manager_per_unit_fee, enterprise_custom_fee";

type Cfg = Record<string, any> | null;

function emptyVars(): BillingContractVariables {
  return {
    billing_strategy_label: "Standard Commission",
    commission_rate: pct(DEFAULT_LISTING_RATE),
    commission_clause: "",
    listing_commission_rate: pct(DEFAULT_LISTING_RATE),
    listing_commission_clause: "",
    pms_commission_rate: pct(DEFAULT_PMS_RATE),
    pms_commission_clause: "",
    widget_flat_commission_rate: "",
    widget_flat_commission_clause: NA,
    subscription_fee_monthly: "",
    subscription_clause: NA,
    white_label_monthly_fee: "",
    white_label_setup_fee: "",
    white_label_clause: NA,
    branding_addon_monthly_fee: "",
    branding_addon_setup_fee: "",
    branding_addon_clause: NA,
    pricelabs_monthly_fee: "",
    pricelabs_setup_fee: "",
    pricelabs_clause: NA,
    channel_manager_per_unit_fee: "",
    channel_manager_unit_count: "",
    channel_manager_clause: NA,
    enterprise_custom_fee: "",
    enterprise_clause: NA,
    payment_facilitator_fee: "",
    payment_facilitator_clause: NA,
    byo_gateway_fee: "",
    byo_gateway_clause: NA,
    volume_tier_clause: NA,
    tier_monthly_fee: "",
    tier_room_count: "",
    tier_clause: NA,
    fee_schedule_table: "",
    fee_schedule_text: "",
    billing_scope_label: "Property",
  };
}

/** Field-by-field cascade: portfolio config → property config → strategy globals → generic globals. */
function pick(field: string, sources: Cfg[]): any {
  for (const src of sources) {
    if (!src) continue;
    const v = src[field];
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function pickBool(field: string, sources: Cfg[]): boolean {
  for (const src of sources) {
    if (!src) continue;
    const v = src[field];
    if (typeof v === "boolean") return v;
  }
  return false;
}

function renderFeeTable(rows: FeeRow[]): string {
  if (!rows.length) return "";
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;">${r.item}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;">${r.basis}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:right;">${r.amount}</td></tr>`,
    )
    .join("");
  return (
    `<table style="width:100%;border-collapse:collapse;font-size:13px;">` +
    `<thead><tr>` +
    `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Item</th>` +
    `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333;">Basis</th>` +
    `<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333;">Amount</th>` +
    `</tr></thead><tbody>${body}</tbody></table>`
  );
}

/**
 * Fetches the billing configuration actually in force for a property (portfolio
 * config wins over property config, then strategy-matched global defaults) and
 * returns pre-rendered clause variables for contract template substitution.
 */
export async function resolveBillingContractVariables(
  propertyIds: string[]
): Promise<BillingContractVariables> {
  const out = emptyVars();
  if (!propertyIds.length) return out;

  const propertyId = propertyIds[0];

  const [propCfgRes, memberRes] = await Promise.all([
    supabase
      .from("property_billing_configs")
      .select(CONFIG_FIELDS)
      .in("property_id", propertyIds)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("property_portfolio_members")
      .select("portfolio_id")
      .eq("property_id", propertyId)
      .maybeSingle(),
  ]);

  const propertyConfig = (propCfgRes.data as Cfg) || null;

  let portfolioConfig: Cfg = null;
  const portfolioId = (memberRes.data as { portfolio_id?: string } | null)?.portfolio_id;
  if (portfolioId) {
    const { data } = await supabase
      .from("portfolio_billing_configs")
      .select(CONFIG_FIELDS)
      .eq("portfolio_id", portfolioId)
      .maybeSingle();
    portfolioConfig = (data as Cfg) || null;
  }

  const strategy = String(
    portfolioConfig?.billing_strategy || propertyConfig?.billing_strategy || "default",
  );

  // Strategy-matched global defaults, then any generic/default row.
  const { data: globalRows } = await supabase
    .from("billing_global_defaults")
    .select("*")
    .in("strategy", [strategy, "default"]);

  const globals = (globalRows || []) as Record<string, any>[];
  const strategyGlobals = globals.find((g) => g.strategy === strategy) || null;
  const genericGlobals = globals.find((g) => g.strategy === "default") || null;

  // Config sources: portfolio overrides property; globals only fill blanks.
  const cfgSources: Cfg[] = [portfolioConfig, propertyConfig];
  const allSources: Cfg[] = [portfolioConfig, propertyConfig, strategyGlobals, genericGlobals];

  out.billing_scope_label = portfolioConfig ? "Portfolio" : "Property";
  out.billing_strategy_label = STRATEGY_LABELS[strategy] || strategy;

  const rows: FeeRow[] = [];

  // ---- Commission -------------------------------------------------------
  const sharedRate = num(pick("commission_rate", cfgSources)) ?? num(pick("default_commission_rate", allSources));
  const widgetFlat = num(pick("widget_flat_commission_rate", allSources));
  const enterpriseWL = strategy === "enterprise_white_label";

  const listingRate = enterpriseWL
    ? 0
    : num(pick("listing_commission_rate", allSources)) ?? sharedRate ?? DEFAULT_LISTING_RATE;
  const pmsRate = enterpriseWL
    ? 0
    : widgetFlat != null
      ? widgetFlat
      : num(pick("pms_commission_rate", allSources)) ??
        (strategy === "rolos_pms" ? sharedRate ?? DEFAULT_PMS_RATE : DEFAULT_PMS_RATE);

  out.listing_commission_rate = pct(listingRate);
  out.pms_commission_rate = pct(pmsRate);
  out.commission_rate = out.listing_commission_rate;

  if (enterpriseWL) {
    out.listing_commission_clause = NA;
    out.pms_commission_clause = NA;
    out.commission_clause = NA;
  } else {
    out.listing_commission_clause =
      `Bookings originating on a Roomsonline marketplace surface (sleepinafrica.roomsonline.co.za, Roomsonline journeys and itineraries) ` +
      `attract a commission of ${pct(listingRate)} (VAT exclusive) of the Total Booking Value.`;
    out.pms_commission_clause =
      `Bookings originating on the Property's own surfaces (white-label site, booking widget, embed, WordPress plugin or API) ` +
      `attract a commission of ${pct(pmsRate)} (VAT exclusive) of the Total Booking Value.`;
    out.commission_clause = out.listing_commission_clause;
    rows.push({ item: "Marketplace commission", basis: "Per booking (VAT excl.)", amount: `${listingRate}%` });
    rows.push({ item: "Direct / white-label commission", basis: "Per booking (VAT excl.)", amount: `${pmsRate}%` });
  }

  if (widgetFlat != null && !enterpriseWL) {
    out.widget_flat_commission_rate = pct(widgetFlat);
    out.widget_flat_commission_clause =
      `A flat booking-engine (WBE) commission of ${pct(widgetFlat)} applies to all widget and embedded booking-engine reservations, ` +
      `in place of tiered commission.`;
  }

  // ---- Subscription / tier ---------------------------------------------
  const subscriptionFee = num(pick("subscription_fee_monthly", cfgSources)) ?? num(pick("default_subscription_fee", allSources));
  if (subscriptionFee != null && subscriptionFee > 0) {
    out.subscription_fee_monthly = String(subscriptionFee);
    out.subscription_clause = `A platform subscription of ${moneyWords(subscriptionFee)} per month is payable.`;
    rows.push({ item: "Platform subscription", basis: "Monthly", amount: money(subscriptionFee) });
  }

  if (isTierStrategy(strategy)) {
    try {
      const info = await resolvePropertyTier(propertyId);
      if (info.tier && info.tier.monthly_fee != null) {
        out.tier_monthly_fee = String(info.tier.monthly_fee);
        out.tier_room_count = String(info.rooms);
        const scopeLabel = info.scope === "portfolio" ? "portfolio" : "property";
        const propsPart =
          info.scope === "portfolio"
            ? ` across ${numberToWords(info.properties)} (${info.properties}) ${info.properties === 1 ? "property" : "properties"}`
            : "";
        const bumpNote = info.bumpedByPropertyCount
          ? ` The portfolio's property count exceeds the room-bracket cap, so the next tier applies.`
          : "";
        out.tier_clause =
          `Based on a ${scopeLabel} of ${numberToWords(info.rooms)} (${info.rooms}) rooms${propsPart}, ` +
          `the applicable monthly subscription is ${moneyWords(info.tier.monthly_fee)} per month.${bumpNote}`;
        rows.push({
          item: "ROL'OS PMS subscription",
          basis: `${info.rooms} room${info.rooms === 1 ? "" : "s"} (${scopeLabel} tier)`,
          amount: `${money(info.tier.monthly_fee)} / month`,
        });
      }
    } catch (e) {
      console.warn("[contractBillingVariables] tier resolution failed", e);
    }
    out.volume_tier_clause = out.tier_clause;
  }

  // ---- White label ------------------------------------------------------
  const wlAllowed = pickBool("white_label_allowed", cfgSources);
  if (wlAllowed) {
    const wlMonthly = num(pick("white_label_monthly_fee", allSources));
    const wlSetup = num(pick("white_label_setup_fee", allSources));
    const wlMode = String(pick("white_label_billing_mode", allSources) || "monthly");
    out.white_label_monthly_fee = wlMonthly != null ? String(wlMonthly) : "";
    out.white_label_setup_fee = wlSetup != null ? String(wlSetup) : "";
    const parts: string[] = [];
    if (wlMonthly != null && wlMonthly > 0)
      parts.push(`${moneyWords(wlMonthly)} ${BILLING_MODE_LABEL[wlMode] || "per month"}`);
    if (wlSetup != null && wlSetup > 0) parts.push(`a once-off setup fee of ${moneyWords(wlSetup)}`);
    out.white_label_clause = parts.length
      ? `White-label branding and a custom booking domain are provided at ${parts.join(", plus ")}.`
      : `White-label branding and a custom booking domain are included at no additional charge.`;
    if (wlMonthly != null && wlMonthly > 0)
      rows.push({ item: "White-label solution", basis: BILLING_MODE_LABEL[wlMode] || "Monthly", amount: money(wlMonthly) });
    if (wlSetup != null && wlSetup > 0)
      rows.push({ item: "White-label setup", basis: "Once-off", amount: money(wlSetup) });
  }

  // ---- Branding add-on --------------------------------------------------
  if (pickBool("branding_addon_enabled", cfgSources) || pickBool("branding_addon_allowed", cfgSources)) {
    const bMonthly = num(pick("branding_addon_monthly_fee", allSources));
    const bSetup = num(pick("branding_addon_setup_fee", allSources));
    const bMode = String(pick("branding_addon_billing_mode", allSources) || "monthly");
    out.branding_addon_monthly_fee = bMonthly != null ? String(bMonthly) : "";
    out.branding_addon_setup_fee = bSetup != null ? String(bSetup) : "";
    const parts: string[] = [];
    if (bMonthly != null && bMonthly > 0) parts.push(`${moneyWords(bMonthly)} ${BILLING_MODE_LABEL[bMode] || "per month"}`);
    if (bSetup != null && bSetup > 0) parts.push(`a once-off setup fee of ${moneyWords(bSetup)}`);
    out.branding_addon_clause = parts.length
      ? `The custom branding add-on is charged at ${parts.join(", plus ")}.`
      : `The custom branding add-on is included at no additional charge.`;
    if (bMonthly != null && bMonthly > 0)
      rows.push({ item: "Branding add-on", basis: BILLING_MODE_LABEL[bMode] || "Monthly", amount: money(bMonthly) });
    if (bSetup != null && bSetup > 0)
      rows.push({ item: "Branding add-on setup", basis: "Once-off", amount: money(bSetup) });
  }

  // ---- PriceLabs --------------------------------------------------------
  if (pickBool("pricelabs_allowed", cfgSources)) {
    const pMonthly = num(pick("pricelabs_monthly_fee", allSources));
    const pSetup = num(pick("pricelabs_setup_fee", allSources));
    out.pricelabs_monthly_fee = pMonthly != null ? String(pMonthly) : "";
    out.pricelabs_setup_fee = pSetup != null ? String(pSetup) : "";
    const parts: string[] = [];
    if (pMonthly != null && pMonthly > 0) parts.push(`${moneyWords(pMonthly)} per month`);
    if (pSetup != null && pSetup > 0) parts.push(`a once-off activation fee of ${moneyWords(pSetup)}`);
    out.pricelabs_clause = parts.length
      ? `Automated revenue management (PriceLabs) is charged at ${parts.join(", plus ")}.`
      : `Automated revenue management (PriceLabs) is included at no additional charge.`;
    if (pMonthly != null && pMonthly > 0)
      rows.push({ item: "PriceLabs revenue management", basis: "Monthly", amount: money(pMonthly) });
    if (pSetup != null && pSetup > 0)
      rows.push({ item: "PriceLabs activation", basis: "Once-off", amount: money(pSetup) });
  }

  // ---- Channel manager --------------------------------------------------
  if (pickBool("channel_manager_enabled", cfgSources)) {
    const perUnit = num(pick("channel_manager_per_unit_fee", allSources));
    let units = 0;
    try {
      const roomInfo = await getPortfolioRoomCount(propertyId);
      units = roomInfo.totalRooms;
    } catch (e) {
      console.warn("[contractBillingVariables] unit count failed", e);
    }
    out.channel_manager_per_unit_fee = perUnit != null ? String(perUnit) : "";
    out.channel_manager_unit_count = String(units);
    if (perUnit != null && perUnit > 0) {
      const monthlyTotal = perUnit * units;
      out.channel_manager_clause =
        `Channel management (Rentals United distribution) is charged at ${moneyWords(perUnit)} per unit per month` +
        (units > 0 ? `, being ${moneyWords(monthlyTotal)} per month for ${numberToWords(units)} (${units}) units.` : ".");
      rows.push({
        item: "Channel manager",
        basis: units > 0 ? `${units} unit${units === 1 ? "" : "s"} × ${money(perUnit)} / month` : "Per unit, monthly",
        amount: units > 0 ? `${money(monthlyTotal)} / month` : `${money(perUnit)} / unit`,
      });
    } else {
      out.channel_manager_clause = `Channel management (Rentals United distribution) is included at no additional charge.`;
    }
  }

  // ---- Enterprise custom fee -------------------------------------------
  const entFee = num(pick("enterprise_custom_fee", cfgSources));
  if (entFee != null && entFee > 0) {
    out.enterprise_custom_fee = String(entFee);
    out.enterprise_clause = `A negotiated enterprise licence fee of ${moneyWords(entFee)} per month applies.`;
    rows.push({ item: "Enterprise licence", basis: "Monthly", amount: money(entFee) });
  }

  // ---- Payment processing ----------------------------------------------
  const payFacEnabled = pickBool("payment_facilitator_enabled", cfgSources);
  const payFacFee = num(pick("transaction_fee_percentage", cfgSources)) ?? num(pick("default_transaction_fee", allSources));
  const byoFee = num(pick("byo_gateway_monthly_fee", allSources));

  if (payFacEnabled) {
    out.payment_facilitator_fee = payFacFee != null ? String(payFacFee) : "";
    out.payment_facilitator_clause = payFacFee
      ? `Where Roomsonline acts as payment facilitator and collects guest funds, a transaction fee of ${pct(payFacFee)} of the amount processed is recovered.`
      : `Roomsonline acts as payment facilitator and collects guest funds on behalf of the Property.`;
    if (payFacFee) rows.push({ item: "Payment facilitation", basis: "Per transaction processed", amount: `${payFacFee}%` });
  } else if (byoFee != null && byoFee > 0) {
    out.byo_gateway_fee = String(byoFee);
    out.byo_gateway_clause =
      `The Property uses its own payment gateway. Guest funds are settled directly to the Property, and Roomsonline invoices ` +
      `commission due, plus a gateway integration fee of ${moneyWords(byoFee)} per month.`;
    rows.push({ item: "Own gateway (BYO) integration", basis: "Monthly", amount: money(byoFee) });
  } else if (!payFacEnabled) {
    out.byo_gateway_clause =
      `The Property uses its own payment gateway. Guest funds are settled directly to the Property, and Roomsonline invoices commission due in arrears.`;
  }

  out.fee_schedule_table = renderFeeTable(rows);
  out.fee_schedule_text = rows.map((r) => `${r.item} — ${r.basis}: ${r.amount}`).join("\n");

  return out;
}
