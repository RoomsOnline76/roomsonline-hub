/**
 * Property payout statements — shared types and display maths.
 *
 * A statement is a self-balancing document for one settlement group
 * (a portfolio, or a standalone property) over one period:
 *
 *   Section A  Bookings settled through ROL   gross - commission - fees = amount held
 *   Section B  Recoveries (money ROL never held): OTA/BYO commission, subscription,
 *              white-label, PriceLabs, per-unit charges, adjustments
 *   Section C  ROL tax invoice = A commission + A fees + all of B (VAT optional)
 *   Section D  Net payable = amount held - invoice total (+/- brought-forward balance)
 *
 * Amounts on a finalised statement are snapshots — nothing recomputes them.
 * Later booking changes land on the next period as an adjustment line.
 */

export type PayoutStatementStatus = "draft" | "finalised" | "paid" | "void";
export type PayoutGroupKind = "portfolio" | "property";
export type PayoutMode = "consolidated" | "split";
export type PayoutLineKind = "booking" | "recovery" | "charge" | "adjustment" | "opening_balance";
export type PayoutPaymentStatus = "pending" | "paid" | "failed";

export interface PayoutStatementLine {
  id: string;
  statement_id: string;
  property_id: string | null;
  property_name: string | null;
  line_kind: PayoutLineKind;
  line_date: string | null;
  booking_id: string | null;
  payment_transaction_id: string | null;
  rol_reference: string | null;
  description: string | null;
  guest_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  settlement_route: string | null;
  commission_type: string | null;
  gross_amount: number;
  commission_rate: number;
  commission_amount: number;
  fee_amount: number;
  net_amount: number;
  is_recoverable: boolean;
  source_kind: string | null;
  source_id: string | null;
  created_at: string;
}

export interface PayoutStatementPayment {
  id: string;
  statement_id: string;
  property_id: string | null;
  beneficiary_name: string | null;
  bank_name: string | null;
  branch_code: string | null;
  account_number_masked: string | null;
  account_type: string | null;
  amount: number;
  currency: string;
  payment_reference: string;
  status: PayoutPaymentStatus;
  paid_at: string | null;
  failure_reason: string | null;
}

export interface PayoutStatement {
  id: string;
  group_kind: PayoutGroupKind;
  portfolio_id: string | null;
  property_id: string | null;
  group_name: string;
  owner_email: string | null;
  period_start: string;
  period_end: string;
  payout_mode: PayoutMode;
  currency: string;

  gross_amount: number;
  rol_gross: number;
  byo_gross: number;
  rol_commission: number;
  byo_commission: number;
  ota_commission: number;
  transaction_fees: number;
  recurring_fees: number;
  other_recoveries: number;
  adjustments: number;

  invoice_subtotal: number;
  invoice_vat: number;
  invoice_total: number;
  vat_rate: number;

  opening_balance: number;
  amount_held: number;
  net_payable: number;
  carry_forward: number;

  booking_count: number;
  status: PayoutStatementStatus;
  statement_reference: string | null;
  invoice_reference: string | null;
  payment_reference: string | null;
  bank_payment_reference: string | null;
  notes: string | null;
  finalised_at: string | null;
  paid_at: string | null;
  emailed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutStatementDetail extends PayoutStatement {
  lines: PayoutStatementLine[];
  payments: PayoutStatementPayment[];
}

/** Settled gateway payment in the period that no statement has claimed. */
export interface UnassignedPayment {
  id: string;
  booking_id: string | null;
  property_id: string | null;
  property_name: string | null;
  guest_name: string | null;
  rol_reference: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  reason: "unassigned" | "failed" | "expired";
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

export const CURRENCY_SYMBOLS: Record<string, string> = { ZAR: "R", USD: "$", EUR: "€", GBP: "£" };

export function fmtMoney(amount: number, currency = "ZAR"): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const sign = amount < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(amount).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export const STATUS_LABELS: Record<PayoutStatementStatus, string> = {
  draft: "Draft",
  finalised: "Finalised",
  paid: "Paid",
  void: "Void",
};

/** Bookings section of a statement. */
export function bookingLines(lines: PayoutStatementLine[]): PayoutStatementLine[] {
  return lines.filter((l) => l.line_kind === "booking");
}

/** Everything that becomes a recovery on the ROL invoice. */
export function recoveryLines(lines: PayoutStatementLine[]): PayoutStatementLine[] {
  return lines.filter((l) => l.line_kind === "recovery" || l.line_kind === "charge");
}

export function adjustmentLines(lines: PayoutStatementLine[]): PayoutStatementLine[] {
  return lines.filter((l) => l.line_kind === "adjustment" || l.line_kind === "opening_balance");
}

/** Per-property subtotals, for consolidated portfolio statements. */
export interface PropertySubtotal {
  property_id: string | null;
  property_name: string;
  gross: number;
  commission: number;
  fees: number;
  net: number;
  bookings: number;
}

export function propertySubtotals(lines: PayoutStatementLine[]): PropertySubtotal[] {
  const map = new Map<string, PropertySubtotal>();
  lines.forEach((l) => {
    const key = l.property_id ?? "unassigned";
    const existing = map.get(key) ?? {
      property_id: l.property_id,
      property_name: l.property_name || "Unallocated",
      gross: 0,
      commission: 0,
      fees: 0,
      net: 0,
      bookings: 0,
    };
    existing.gross += l.gross_amount;
    existing.commission += l.commission_amount;
    existing.fees += l.fee_amount;
    existing.net += l.net_amount;
    if (l.line_kind === "booking") existing.bookings += 1;
    map.set(key, existing);
  });
  return Array.from(map.values()).sort((a, b) => b.gross - a.gross);
}

/**
 * Gross guest money ROL actually received in the period (before commission and
 * processing fees are recovered on the ROL invoice). Older statements stored a
 * net figure in `amount_held`, so fall back to reconstructing the gross.
 */
export function grossReceivedByRol(s: PayoutStatement): number {
  if (s.rol_gross > 0) return round2(s.rol_gross);
  return round2(s.amount_held + s.rol_commission + s.transaction_fees);
}

/**
 * The invoice total must always equal what the payout deducted — this is the
 * balance check the UI shows so an admin can trust the document.
 */
export function statementBalances(s: PayoutStatement): boolean {
  const expected = round2(grossReceivedByRol(s) - s.invoice_total - s.opening_balance);
  const actual = round2(s.net_payable - s.carry_forward);
  return Math.abs(expected - actual) < 0.02;
}


export interface VatSettings {
  vat_enabled: boolean;
  vat_rate: number;
  vat_number: string | null;
  company_legal_name: string | null;
  company_address: string | null;
}

export const DEFAULT_VAT_SETTINGS: VatSettings = {
  vat_enabled: false,
  vat_rate: 15,
  vat_number: null,
  company_legal_name: "Rooms Online",
  company_address: null,
};

export function periodLabel(periodStart: string, periodEnd: string): string {
  const from = new Date(periodStart);
  const to = new Date(periodEnd);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${from.toLocaleDateString("en-ZA", opts)} – ${to.toLocaleDateString("en-ZA", opts)}`;
}
