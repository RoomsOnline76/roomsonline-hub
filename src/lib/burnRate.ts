/**
 * Burn-rate derivation for ROL Pulse → Accounting.
 *
 * Burn is never typed in by hand: it is derived from the recurring bills that
 * have been loaded. A recurring commitment counts exactly ONCE towards monthly
 * burn no matter how many invoices exist for it — the most recent invoice for a
 * commitment defines the current price.
 */

export type BillingType = "monthly" | "quarterly" | "annual" | "once_off" | string;

export type BillCurrency = "ZAR" | "USD" | "EUR";

export interface FxRates {
  /** ZAR per 1 USD */
  usdZar: number;
  /** ZAR per 1 EUR */
  eurZar: number;
}

export const DEFAULT_FX: FxRates = { usdZar: 18.5, eurZar: 20.0 };

export interface BurnInvoice {
  id?: string;
  description: string | null;
  vendor: string | null;
  category?: string | null;
  billing_type: BillingType;
  source_currency?: string | null;
  cost_zar?: number | string | null;
  cost_usd?: number | string | null;
  cost_eur?: number | string | null;
  invoice_date?: string | null;
  created_at?: string | null;
  is_paid?: boolean | null;
}

export interface RecurringCommitment {
  key: string;
  description: string;
  vendor: string | null;
  category: string | null;
  billingType: BillingType;
  /** Amount as invoiced, in its own currency. */
  amount: number;
  currency: BillCurrency;
  /** Invoiced amount converted to ZAR. */
  amountZar: number;
  /** ZAR cost per month once the cadence is normalised. */
  monthlyZar: number;
  /** Date of the invoice that set the current price. */
  latestInvoiceDate: string | null;
  /** How many loaded invoices back this single commitment. */
  invoiceCount: number;
}

/** Cadence divisor: how many months one invoice of this type covers. */
export const CADENCE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
  yearly: 12,
};

export const isRecurring = (billingType: BillingType): boolean =>
  CADENCE_MONTHS[String(billingType).toLowerCase()] !== undefined;

const num = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normaliseCurrency = (value: string | null | undefined): BillCurrency => {
  const upper = String(value ?? "ZAR").toUpperCase();
  return upper === "USD" || upper === "EUR" ? upper : "ZAR";
};

/** Convert an amount in `currency` to ZAR. */
export const convertToZar = (
  amount: number,
  currency: BillCurrency,
  rates: FxRates = DEFAULT_FX,
): number => {
  if (currency === "USD") return amount * (rates.usdZar || DEFAULT_FX.usdZar);
  if (currency === "EUR") return amount * (rates.eurZar || DEFAULT_FX.eurZar);
  return amount;
};

/**
 * Resolve the ZAR value of an invoice. A stored `cost_zar` wins (it is the
 * historically banked value); otherwise the invoiced currency is converted.
 */
export const invoiceZar = (
  invoice: BurnInvoice,
  rates: FxRates = DEFAULT_FX,
): number => {
  const zar = num(invoice.cost_zar);
  if (zar !== null) return zar;

  const currency = normaliseCurrency(invoice.source_currency);
  const own =
    currency === "EUR"
      ? num(invoice.cost_eur)
      : currency === "USD"
        ? num(invoice.cost_usd)
        : null;
  if (own !== null) return convertToZar(own, currency, rates);

  const eur = num(invoice.cost_eur);
  if (eur !== null) return convertToZar(eur, "EUR", rates);
  const usd = num(invoice.cost_usd);
  if (usd !== null) return convertToZar(usd, "USD", rates);
  return 0;
};

/** The amount as invoiced, in the currency it was issued in. */
export const invoiceOwnAmount = (
  invoice: BurnInvoice,
): { amount: number; currency: BillCurrency } => {
  const currency = normaliseCurrency(invoice.source_currency);
  if (currency === "EUR") return { amount: num(invoice.cost_eur) ?? 0, currency };
  if (currency === "USD") return { amount: num(invoice.cost_usd) ?? 0, currency };
  return { amount: num(invoice.cost_zar) ?? 0, currency: "ZAR" };
};

/** ZAR cost per month for one invoice of the given cadence. */
export const monthlyEquivalentZar = (
  amountZar: number,
  billingType: BillingType,
): number => {
  const months = CADENCE_MONTHS[String(billingType).toLowerCase()];
  if (!months) return 0;
  return amountZar / months;
};

/**
 * Identity of a recurring commitment. Multiple invoices sharing this key are the
 * same monthly obligation and must only be counted once.
 */
export const recurringKey = (invoice: BurnInvoice): string => {
  const vendor = (invoice.vendor ?? "").trim().toLowerCase();
  const description = (invoice.description ?? "").trim().toLowerCase();
  const cadence = String(invoice.billing_type ?? "").toLowerCase();
  return `${vendor}::${description}::${cadence}`;
};

const invoiceTime = (invoice: BurnInvoice): number => {
  const raw = invoice.invoice_date || invoice.created_at;
  const time = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
};

/**
 * Collapse loaded invoices into the distinct recurring commitments that drive
 * monthly burn. Once-off bills are excluded.
 */
export const deriveRecurringCommitments = (
  invoices: BurnInvoice[] | null | undefined,
  rates: FxRates = DEFAULT_FX,
): RecurringCommitment[] => {
  const byKey = new Map<string, RecurringCommitment>();

  for (const invoice of invoices ?? []) {
    if (!isRecurring(invoice.billing_type)) continue;

    const key = recurringKey(invoice);
    const amountZar = invoiceZar(invoice, rates);
    const own = invoiceOwnAmount(invoice);
    const date = invoice.invoice_date || invoice.created_at || null;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        description: invoice.description || invoice.vendor || "Untitled",
        vendor: invoice.vendor ?? null,
        category: invoice.category ?? null,
        billingType: invoice.billing_type,
        amount: own.amount,
        currency: own.currency,
        amountZar,
        monthlyZar: monthlyEquivalentZar(amountZar, invoice.billing_type),
        latestInvoiceDate: date,
        invoiceCount: 1,
      });
      continue;
    }

    existing.invoiceCount += 1;

    // Latest invoice sets the current price.
    const existingTime = existing.latestInvoiceDate
      ? new Date(existing.latestInvoiceDate).getTime()
      : 0;
    if (invoiceTime(invoice) >= existingTime) {
      existing.amount = own.amount;
      existing.currency = own.currency;
      existing.amountZar = amountZar;
      existing.monthlyZar = monthlyEquivalentZar(amountZar, invoice.billing_type);
      existing.latestInvoiceDate = date;
      existing.category = invoice.category ?? existing.category;
    }
  }

  return [...byKey.values()].sort((a, b) => b.monthlyZar - a.monthlyZar);
};

/** Derived monthly burn in ZAR from all recurring commitments. */
export const deriveMonthlyBurnZar = (
  invoices: BurnInvoice[] | null | undefined,
  rates: FxRates = DEFAULT_FX,
): number =>
  deriveRecurringCommitments(invoices, rates).reduce(
    (sum, commitment) => sum + commitment.monthlyZar,
    0,
  );

/** Sentinel runway value meaning "revenue covers recurring costs". */
export const CASH_FLOW_POSITIVE = 999;

export interface RunwayResult {
  /** Monthly burn net of actual revenue, in ZAR. */
  netBurnZar: number;
  /** Months of runway, or null when it cannot be calculated. */
  months: number | null;
  cashFlowPositive: boolean;
}

/** Runway = cash ÷ (burn − actual revenue). */
export const computeRunway = (
  cashZar: number | null | undefined,
  burnZar: number | null | undefined,
  revenueZar: number | null | undefined,
): RunwayResult => {
  const burn = num(burnZar) ?? 0;
  const revenue = num(revenueZar) ?? 0;
  const netBurnZar = burn - revenue;

  if (burn <= 0) {
    return { netBurnZar, months: null, cashFlowPositive: false };
  }
  if (netBurnZar <= 0) {
    return { netBurnZar, months: null, cashFlowPositive: true };
  }

  const cash = num(cashZar);
  if (cash === null || cash <= 0) {
    return { netBurnZar, months: null, cashFlowPositive: false };
  }

  return {
    netBurnZar,
    months: Math.round((cash / netBurnZar) * 10) / 10,
    cashFlowPositive: false,
  };
};

export const formatZar = (value: number): string =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

export const formatCurrencyAmount = (
  value: number,
  currency: BillCurrency,
): string =>
  new Intl.NumberFormat(currency === "ZAR" ? "en-ZA" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
