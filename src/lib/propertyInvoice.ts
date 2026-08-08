/**
 * ROL property invoices — receivables billed directly to a property or portfolio.
 *
 * A payout statement recovers ROL's charges by deduction, because ROL is holding
 * the guest's money. When ROL never holds the money — the property uses its own
 * gateway (BYO) or takes reservations only — the same charges have to be invoiced
 * and collected. That is what this document is:
 *
 *   Commission   commission on confirmed bookings ROL never settled
 *   Recurring    platform subscription, channel per-unit, PriceLabs, white-label
 *   Charges      pending one-off platform charges (setup, add-ons)
 *   Adjustments  manual credits/debits captured by an admin
 *
 * Nothing appears on an invoice if it was already recovered on a payout
 * statement — the run claims each source once, so a charge is either deducted or
 * invoiced, never both.
 */

export type PropertyInvoiceStatus = "draft" | "issued" | "paid" | "void";
export type PropertyInvoiceGroupKind = "portfolio" | "property";
export type PropertyInvoiceLineKind = "commission" | "recurring" | "charge" | "adjustment";

export interface PropertyInvoiceLine {
  id: string;
  invoice_id: string;
  property_id: string | null;
  property_name: string | null;
  line_kind: PropertyInvoiceLineKind;
  line_date: string | null;
  description: string | null;
  booking_id: string | null;
  rol_reference: string | null;
  guest_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  settlement_route: string | null;
  commission_type: string | null;
  gross_amount: number;
  rate: number;
  amount: number;
  quantity: number;
  source_kind: string | null;
  source_id: string | null;
  is_waived: boolean;
  created_at: string;
}

export interface VatSnapshot {
  vat_enabled: boolean;
  vat_rate: number;
  vat_number: string | null;
  company_legal_name: string | null;
  company_address: string | null;
  footer_note?: string | null;
}

export interface PropertyInvoice {
  id: string;
  group_kind: PropertyInvoiceGroupKind;
  portfolio_id: string | null;
  property_id: string | null;
  group_name: string;
  group_code: string | null;
  bill_to_email: string | null;
  bill_to_name: string | null;
  bill_to_address: string | null;
  period_start: string;
  period_end: string;
  currency: string;

  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  amount_paid: number;

  commission_total: number;
  recurring_total: number;
  charge_total: number;
  adjustment_total: number;
  booking_count: number;

  status: PropertyInvoiceStatus;
  invoice_reference: string | null;
  vat_snapshot: VatSnapshot | null;
  due_date: string | null;
  pay_token: string | null;
  payment_reference: string | null;
  notes: string | null;
  void_reason: string | null;

  issued_at: string | null;
  emailed_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyInvoiceDetail extends PropertyInvoice {
  lines: PropertyInvoiceLine[];
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

export const CURRENCY_SYMBOLS: Record<string, string> = { ZAR: "R", USD: "$", EUR: "€", GBP: "£" };

export function fmtMoney(amount: number, currency = "ZAR"): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const sign = amount < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(Number(amount) || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export const INVOICE_STATUS_LABELS: Record<PropertyInvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  void: "Void",
};

export const LINE_KIND_LABELS: Record<PropertyInvoiceLineKind, string> = {
  commission: "Booking commission",
  recurring: "Platform subscription & services",
  charge: "One-off charges",
  adjustment: "Adjustments",
};

/** Amount still outstanding on an invoice. */
export function balanceDue(invoice: PropertyInvoice): number {
  return round2(invoice.total - invoice.amount_paid);
}

/** Issued, past its due date and not settled. */
export function isOverdue(invoice: PropertyInvoice, today = new Date()): boolean {
  if (invoice.status !== "issued" || !invoice.due_date) return false;
  return new Date(`${invoice.due_date}T23:59:59Z`).getTime() < today.getTime();
}

export function linesOfKind(
  lines: PropertyInvoiceLine[],
  kind: PropertyInvoiceLineKind,
): PropertyInvoiceLine[] {
  return lines.filter((l) => l.line_kind === kind && !l.is_waived);
}

export function periodLabel(periodStart: string, periodEnd: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${new Date(periodStart).toLocaleDateString("en-ZA", opts)} – ${new Date(periodEnd).toLocaleDateString("en-ZA", opts)}`;
}

export const DEFAULT_VAT_SNAPSHOT: VatSnapshot = {
  vat_enabled: false,
  vat_rate: 15,
  vat_number: null,
  company_legal_name: "Rooms Online",
  company_address: null,
  footer_note: null,
};

/**
 * The invoice must always add up: section totals equal the subtotal, and
 * subtotal + VAT equals the total. The UI surfaces this so an admin can trust
 * the document before sending it.
 */
export function invoiceBalances(invoice: PropertyInvoice): boolean {
  const sections = round2(
    invoice.commission_total + invoice.recurring_total + invoice.charge_total + invoice.adjustment_total,
  );
  const expectedTotal = round2(invoice.subtotal + invoice.vat_amount);
  const grossSections = invoice.vat_amount > 0 ? round2(invoice.subtotal) : sections;
  return Math.abs(expectedTotal - invoice.total) < 0.02 && Math.abs(grossSections - invoice.subtotal) < 0.02;
}

/** Public pay-page shape returned by get_rol_property_invoice_by_token. */
export interface PublicInvoiceView {
  id: string;
  invoice_reference: string | null;
  group_name: string;
  bill_to_name: string | null;
  period_start: string;
  period_end: string;
  due_date: string | null;
  currency: string;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  amount_paid: number;
  status: string;
  commission_total: number;
  recurring_total: number;
  charge_total: number;
  adjustment_total: number;
  booking_count: number;
  lines: { line_kind: string; description: string | null; property_name: string | null; amount: number }[];
}
