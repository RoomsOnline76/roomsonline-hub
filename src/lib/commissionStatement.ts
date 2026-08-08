/**
 * Referral commission statements — shared types and display maths.
 *
 * A commission statement is the referrer's paysheet for one month:
 *
 *   Per property   ROL revenue earned in the period  x  rate  =  commission
 *   Adjustments    manual corrections and clawbacks (negative lines)
 *   Net payable    gross commission + adjustments
 *
 * Rates and revenue are computed by the `calculate-rep-commissions` engine and
 * snapshotted onto every line, so nothing is recomputed in the browser — what
 * an admin approves is exactly what the rep is paid.
 */

export type CommissionStatementStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "paid"
  | "void";

export type CommissionLineKind = "commission" | "adjustment" | "clawback";
export type CommissionType = "first_year" | "residual";
export type CommissionRateSource =
  | "referral_override"
  | "tier_criteria"
  | "global_default"
  | "constant";

/** Revenue components behind one commission line. All exclude pass-through money. */
export interface CommissionRevenueBreakdown {
  /** Commission ROL earned on bookings settled in the period. */
  booking_commission?: number;
  /** Number of bookings behind that commission. */
  booking_count?: number;
  /** Commission recovered on own-gateway / OTA bookings. */
  recovered_commission?: number;
  /** Paid platform / subscription revenue for the property. */
  subscription_revenue?: number;
  /** Anything explicitly excluded, for transparency on the statement. */
  excluded_note?: string;
}

export interface CommissionLine {
  id: string;
  report_id: string | null;
  rep_id: string;
  property_id: string | null;
  referral_id: string | null;
  period_start: string;
  period_end: string;
  base_revenue: number;
  commission_type: string;
  rate_applied: number;
  amount: number;
  status: string;
  line_kind: CommissionLineKind;
  rate_source: string | null;
  revenue_breakdown: CommissionRevenueBreakdown;
  description: string | null;
  notes: string | null;
  clawback_reason: string | null;
  referral_started_on: string | null;
  created_at: string;
  /** Joined for display. */
  property_name?: string | null;
}

export interface CommissionBankSnapshot {
  bank_name?: string | null;
  branch_code?: string | null;
  account_holder?: string | null;
  account_number_masked?: string | null;
  account_type?: string | null;
  is_verified?: boolean;
}

export interface CommissionTermsSnapshot {
  tier?: string;
  tier_label?: string;
  first_year_rate?: number;
  residual_rate?: number;
  residual_months?: number;
  clawback_days?: number;
  source?: string;
}

export interface CommissionStatement {
  id: string;
  rep_id: string;
  period_month: string;
  period_start: string | null;
  period_end: string | null;
  statement_reference: string | null;
  total_entries: number;
  property_count: number;
  total_revenue: number;
  gross_commission: number;
  adjustments_total: number;
  net_payable: number;
  total_amount: number;
  status: CommissionStatementStatus;
  bank_snapshot: CommissionBankSnapshot;
  terms_snapshot: CommissionTermsSnapshot;
  generated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  paid_at: string | null;
  paid_reference: string | null;
  void_reason: string | null;
  emailed_at: string | null;
  emailed_to: string | null;
  notes: string | null;
  /** Joined for display. */
  rep_name?: string | null;
  rep_code?: string | null;
  rep_email?: string | null;
  rep_tier?: string | null;
}

export interface CommissionStatementDetail extends CommissionStatement {
  lines: CommissionLine[];
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  ZAR: "R",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

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

export const COMMISSION_STATUS_LABELS: Record<CommissionStatementStatus, string> = {
  draft: "Draft",
  pending_approval: "Awaiting approval",
  approved: "Approved",
  paid: "Paid",
  void: "Void",
};

export const COMMISSION_STATUS_CLASSES: Record<CommissionStatementStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-amber-500/10 text-amber-600",
  approved: "bg-primary/10 text-primary",
  paid: "bg-green-500/10 text-green-600",
  void: "bg-destructive/10 text-destructive",
};

export const COMMISSION_TYPE_LABELS: Record<string, string> = {
  first_year: "First year",
  residual: "Residual",
};

export const RATE_SOURCE_LABELS: Record<string, string> = {
  referral_override: "Referral override",
  tier_criteria: "Tier criteria",
  global_default: "Billing default",
  constant: "Platform default",
};

/** The wording that keeps the basis of the paysheet unambiguous. */
export const COMMISSION_BASIS_NOTE =
  "Commission is earned on ROL net revenue only — guest payments, payment-gateway fees, facilitator surcharges and other pass-through costs are excluded.";

export function commissionLines(lines: CommissionLine[]): CommissionLine[] {
  return lines.filter((l) => l.line_kind === "commission");
}

export function commissionAdjustments(lines: CommissionLine[]): CommissionLine[] {
  return lines.filter((l) => l.line_kind === "adjustment" || l.line_kind === "clawback");
}

export interface CommissionTotals {
  revenue: number;
  gross: number;
  adjustments: number;
  net: number;
  properties: number;
}

/** Recompute totals from lines — used for drafts and previews only. */
export function totalsFromLines(lines: CommissionLine[]): CommissionTotals {
  const commission = commissionLines(lines);
  const adjustments = commissionAdjustments(lines);
  return {
    revenue: round2(commission.reduce((s, l) => s + (Number(l.base_revenue) || 0), 0)),
    gross: round2(commission.reduce((s, l) => s + (Number(l.amount) || 0), 0)),
    adjustments: round2(adjustments.reduce((s, l) => s + (Number(l.amount) || 0), 0)),
    net: round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)),
    properties: new Set(commission.map((l) => l.property_id).filter(Boolean)).size,
  };
}

/** A finalised statement must equal its lines — this is the trust check the UI shows. */
export function statementBalances(statement: CommissionStatementDetail): boolean {
  const t = totalsFromLines(statement.lines);
  return Math.abs(round2(t.net) - round2(statement.net_payable)) < 0.02;
}

export function periodLabel(periodStart?: string | null, periodEnd?: string | null): string {
  if (!periodStart || !periodEnd) return "—";
  const from = new Date(periodStart);
  const to = new Date(periodEnd);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${from.toLocaleDateString("en-ZA", opts)} – ${to.toLocaleDateString("en-ZA", opts)}`;
}

export function monthLabel(periodMonth: string): string {
  const d = new Date(periodMonth);
  return Number.isNaN(d.getTime())
    ? periodMonth
    : d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

/** Month boundaries (inclusive) for a YYYY-MM-01 style key. */
export function monthRange(periodMonth: string): { start: string; end: string } {
  const d = new Date(`${periodMonth.slice(0, 7)}-01T00:00:00Z`);
  const start = d.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  return { start, end };
}

/** Previous full month, the default period for a run. */
export function previousMonthKey(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 10);
}

/** Recent months, newest first, for the period picker. */
export function recentMonthKeys(count = 15, from = new Date()): string[] {
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1)).toISOString().slice(0, 10),
  );
}

export interface CommissionPropertyBlock {
  property_id: string | null;
  property_name: string;
  since: string | null;
  commission_type: string;
  rate_applied: number;
  rate_source: string | null;
  revenue: number;
  commission: number;
  breakdown: CommissionRevenueBreakdown;
}

/** One block per referred property, the shape the paysheet is read in. */
export function propertyBlocks(lines: CommissionLine[]): CommissionPropertyBlock[] {
  return commissionLines(lines)
    .map((l) => ({
      property_id: l.property_id,
      property_name: l.property_name || "Unallocated",
      since: l.referral_started_on,
      commission_type: l.commission_type,
      rate_applied: Number(l.rate_applied) || 0,
      rate_source: l.rate_source,
      revenue: Number(l.base_revenue) || 0,
      commission: Number(l.amount) || 0,
      breakdown: l.revenue_breakdown || {},
    }))
    .sort((a, b) => b.commission - a.commission);
}

export const EDITABLE_STATUSES: CommissionStatementStatus[] = ["draft", "pending_approval"];

export function isEditable(status: CommissionStatementStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}
