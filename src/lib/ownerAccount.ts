import { computeExpectedBilling, type ExpectedBillingConfig } from "@/lib/billingExpected";
/**
 * Owner account (ROL Account) — derivation helpers.
 *
 * Everything an owner owes ROL, has paid ROL, and is owed by ROL, derived from
 * the persisted documents only. Amounts are never recomputed: an invoice total
 * is the invoice total, a statement's net payable is the net payable. This file
 * only classifies, sums and orders what was already stored.
 *
 * Vocabulary is fixed (product rule): Due, Overdue, Paid, Due to you.
 */

import { fmtMoney, round2 } from "./propertyInvoice";

export { fmtMoney, round2 };

/** Days after issue that a subscription invoice is considered overdue. */
export const SUBSCRIPTION_GRACE_DAYS = 7;

export type OwnerScopeKind = "property" | "portfolio";

export interface OwnerScope {
  kind: OwnerScopeKind;
  id: string;
  name: string;
  /** Properties covered by this scope (self for a property scope). */
  propertyIds: string[];
}

export interface OwnerSubscriptionInvoice {
  id: string;
  invoice_number: string | null;
  amount: number;
  subscription_amount: number | null;
  once_off_amount: number | null;
  currency: string;
  status: string;
  invoice_kind: string | null;
  period_start: string | null;
  period_end: string | null;
  pdf_url: string | null;
  payfast_token: string | null;
  paid_at: string | null;
  created_at: string;
  line_items: unknown;
}

export interface OwnerRolInvoice {
  id: string;
  invoice_reference: string | null;
  group_name: string;
  period_start: string;
  period_end: string;
  currency: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  amount_paid: number;
  commission_total: number;
  recurring_total: number;
  charge_total: number;
  booking_count: number;
  status: string;
  due_date: string | null;
  pay_token: string | null;
  issued_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface OwnerPayoutStatement {
  id: string;
  statement_reference: string | null;
  group_name: string | null;
  period_start: string;
  period_end: string;
  currency: string;
  gross_collected: number;
  total_deductions: number;
  net_payable: number;
  status: string;
  paid_at: string | null;
  payment_reference: string | null;
  rol_invoice_reference: string | null;
  created_at: string;
}

export interface OwnerBillingConfig {
  subscription_status: string | null;
  subscription_fee_monthly: number | null;
  current_period_end: string | null;
  billing_enabled: boolean | null;
  cancelled_at: string | null;
  billing_switched_off_at: string | null;
  plan_changed_at: string | null;
  previous_subscription_fee: number | null;
  subscription_reset_pending: boolean | null;
  engagement_date: string | null;
  billing_start_date: string | null;
  free_period_days: number | null;
  billing_anchor_day: number | null;
  channel_manager_enabled: boolean | null;
  channel_manager_per_unit_fee: number | null;
  white_label_monthly_fee: number | null;
  pricelabs_allowed: boolean | null;
  pricelabs_monthly_fee: number | null;
  branding_addon_enabled: boolean | null;
  branding_addon_monthly_fee: number | null;
  byo_gateway_monthly_fee: number | null;
}

/* ------------------------------------------------------------------ */
/* Status semantics                                                    */
/* ------------------------------------------------------------------ */

export type SubscriptionDisplayStatus =
  | "active"
  | "pending"
  | "past_due"
  | "cancelled"
  | "switched_off"
  | "reset_pending";

export interface SubscriptionView {
  status: SubscriptionDisplayStatus;
  label: string;
  /** Access remains in force to this date after a switch-off / cancellation. */
  activeUntil: string | null;
  monthlyFee: number;
  previousFee: number | null;
  planChangedAt: string | null;
  resetPending: boolean;
}

export function subscriptionView(cfg: OwnerBillingConfig | null | undefined): SubscriptionView {
  const monthlyFee = Number(cfg?.subscription_fee_monthly || 0);
  const raw = cfg?.subscription_status || "pending";
  const switchedOff = cfg?.billing_enabled === false || !!cfg?.billing_switched_off_at;
  const cancelled = raw === "cancelled" || !!cfg?.cancelled_at;
  const activeUntil = cfg?.current_period_end ? String(cfg.current_period_end).slice(0, 10) : null;
  const resetPending = cfg?.subscription_reset_pending === true;

  let status: SubscriptionDisplayStatus = (["active", "pending", "past_due", "cancelled"] as const).includes(
    raw as never,
  )
    ? (raw as SubscriptionDisplayStatus)
    : "pending";
  if (resetPending) status = "reset_pending";
  else if (switchedOff && !cancelled) status = "switched_off";
  else if (cancelled) status = "cancelled";

  const LABELS: Record<SubscriptionDisplayStatus, string> = {
    active: "Active",
    pending: "Pending",
    past_due: "Overdue",
    cancelled: activeUntil ? `Cancelled — active until ${activeUntil}` : "Cancelled",
    switched_off: activeUntil ? `Off — active until ${activeUntil}` : "Off",
    reset_pending: "Plan changed — payment due",
  };

  return {
    status,
    label: LABELS[status],
    activeUntil,
    monthlyFee,
    previousFee: cfg?.previous_subscription_fee != null ? Number(cfg.previous_subscription_fee) : null,
    planChangedAt: cfg?.plan_changed_at ? String(cfg.plan_changed_at).slice(0, 10) : null,
    resetPending,
  };
}

export interface FeeComponent {
  label: string;
  amount: number;
}

/**
 * What the monthly fee is made up of, for transparency on the owner page.
 *
 * Uses the same contracted resolution as the Estimated Client Cost card, so the
 * tier-resolved ROL'OS PMS subscription is always included even when
 * `subscription_fee_monthly` has not been written to the config.
 */
export function feeBreakdown(
  cfg: OwnerBillingConfig | null | undefined,
  unitCount = 0,
  byoGateway = false,
): FeeComponent[] {
  if (!cfg) return [];
  return computeExpectedBilling(cfg as unknown as ExpectedBillingConfig, {
    units: unitCount,
    rooms: unitCount,
    byoGateway,
  })
    .lines.filter((l) => !l.once)
    .map((l) => ({ label: l.label, amount: l.amount }));
}

/** Contracted monthly total (tier + add-ons), regardless of stored fee. */
export function expectedMonthlyFee(
  cfg: OwnerBillingConfig | null | undefined,
  unitCount = 0,
  byoGateway = false,
): number {
  if (!cfg) return 0;
  return computeExpectedBilling(cfg as unknown as ExpectedBillingConfig, {
    units: unitCount,
    rooms: unitCount,
    byoGateway,
  }).monthly;
}

/** Contracted once-off (setup) total, payable on signature. */
export function expectedSetupFee(
  cfg: OwnerBillingConfig | null | undefined,
  unitCount = 0,
  byoGateway = false,
): number {
  if (!cfg) return 0;
  return computeExpectedBilling(cfg as unknown as ExpectedBillingConfig, {
    units: unitCount,
    rooms: unitCount,
    byoGateway,
  }).setup;
}


/* ------------------------------------------------------------------ */
/* Balances                                                            */
/* ------------------------------------------------------------------ */

const today = () => new Date().toISOString().slice(0, 10);

const isSettled = (status: string) => ["paid", "settled", "completed"].includes(status);

export function subscriptionInvoiceDue(inv: OwnerSubscriptionInvoice): number {
  return isSettled(inv.status) || inv.status === "void" ? 0 : round2(Number(inv.amount || 0));
}

export function subscriptionInvoiceDueDate(inv: OwnerSubscriptionInvoice): string {
  const d = new Date(inv.created_at);
  d.setUTCDate(d.getUTCDate() + SUBSCRIPTION_GRACE_DAYS);
  return d.toISOString().slice(0, 10);
}

export function rolInvoiceDue(inv: OwnerRolInvoice): number {
  if (inv.status === "void") return 0;
  return round2(Math.max(0, Number(inv.total || 0) - Number(inv.amount_paid || 0)));
}

export interface OwnerBalances {
  currency: string;
  /** Everything unpaid right now. */
  due: number;
  /** Portion of `due` past its due date. */
  overdue: number;
  /** Age in days of the oldest overdue document (0 when nothing is overdue). */
  oldestOverdueDays: number;
  /** Paid to ROL in the current calendar year. */
  paidThisYear: number;
  /** Paid to ROL since engagement. */
  paidAllTime: number;
  /** Finalised payout statements not yet paid out, plus ROL-held funds awaiting a statement. */
  dueToYou: number;
  /** Portion of `dueToYou` from bookings ROL has collected but not yet statemented. */
  pendingSettlement: number;
  /** Payout statements already paid, all time. */
  receivedAllTime: number;
  /** Net position: positive means you owe ROL. */
  net: number;
}

export interface BalanceInput {
  subscriptionInvoices: OwnerSubscriptionInvoice[];
  rolInvoices: OwnerRolInvoice[];
  payouts: OwnerPayoutStatement[];
  currency?: string;
  /** Contracted once-off setup still payable but not yet invoiced (or only cancelled invoices exist). */
  uninvoicedSetupDue?: number;
  /** Date the once-off setup became payable (contract signature / engagement). */
  setupDueDate?: string | null;
  /** ROL-collected booking funds (net of commission/fees) not yet on a payout statement. */
  pendingSettlement?: number;
}


export function computeBalances(input: BalanceInput): OwnerBalances {
  const now = today();
  const year = now.slice(0, 4);
  let due = 0;
  let overdue = 0;
  let paidThisYear = 0;
  let paidAllTime = 0;
  let oldest: string | null = null;


  const noteOverdue = (amount: number, dueDate: string | null) => {
    if (!amount || !dueDate || dueDate >= now) return;
    overdue += amount;
    if (!oldest || dueDate < oldest) oldest = dueDate;
  };

  for (const inv of input.subscriptionInvoices) {
    const outstanding = subscriptionInvoiceDue(inv);
    due += outstanding;
    noteOverdue(outstanding, subscriptionInvoiceDueDate(inv));
    if (isSettled(inv.status)) {
      const amount = Number(inv.amount || 0);
      paidAllTime += amount;
      if ((inv.paid_at || inv.created_at).slice(0, 4) === year) paidThisYear += amount;
    }
  }

  for (const inv of input.rolInvoices) {
    const outstanding = rolInvoiceDue(inv);
    due += outstanding;
    noteOverdue(outstanding, inv.due_date ? inv.due_date.slice(0, 10) : null);
    const paid = Number(inv.amount_paid || 0);
    if (paid > 0) {
      paidAllTime += paid;
      if ((inv.paid_at || inv.created_at).slice(0, 4) === year) paidThisYear += paid;
    }
  }

  // Contracted once-off setup that is payable now but has no live invoice yet.
  const setupDue = round2(Math.max(0, Number(input.uninvoicedSetupDue || 0)));
  if (setupDue > 0) {
    due += setupDue;
    noteOverdue(setupDue, input.setupDueDate ? input.setupDueDate.slice(0, 10) : null);
  }



  let dueToYou = 0;
  let receivedAllTime = 0;
  for (const s of input.payouts) {
    const net = Number(s.net_payable || 0);
    if (s.status === "paid") receivedAllTime += net;
    else if (s.status === "finalised") dueToYou += net;
  }

  // Money ROL already collected for bookings that no statement covers yet.
  const pendingSettlement = round2(Math.max(0, Number(input.pendingSettlement || 0)));
  dueToYou += pendingSettlement;

  const oldestOverdueDays = oldest
    ? Math.max(
        0,
        Math.round((new Date(`${now}T00:00:00Z`).getTime() - new Date(`${oldest}T00:00:00Z`).getTime()) / 86_400_000),
      )
    : 0;

  return {
    currency: input.currency || input.rolInvoices[0]?.currency || input.subscriptionInvoices[0]?.currency || "ZAR",
    due: round2(due),
    overdue: round2(overdue),
    oldestOverdueDays,
    paidThisYear: round2(paidThisYear),
    paidAllTime: round2(paidAllTime),
    dueToYou: round2(dueToYou),
    pendingSettlement,
    receivedAllTime: round2(receivedAllTime),
    net: round2(due - dueToYou),
  };

}

/* ------------------------------------------------------------------ */
/* Pending settlement (ROL-held booking funds without a statement)     */
/* ------------------------------------------------------------------ */

const PAID_BOOKING_PAYMENT_STATUSES = [
  "paid",
  "paid_externally",
  "settled",
  "completed",
  "partially_paid",
  "deposit_paid",
];
const EXCLUDED_BOOKING_STATUSES = ["cancelled", "canceled", "refunded", "no_show", "failed"];

export interface SettlementBooking {
  id: string;
  status: string | null;
  payment_status: string | null;
  total_price: number | null;
  calculated_commission: number | null;
  commission_rate_applied: number | null;
  commission_type: string | null;
  integration_type?: string | null;
  booking_channel?: string | null;
  source_url?: string | null;
  check_in_date?: string | null;
  created_at?: string | null;
}

export interface PendingSettlement {
  /** Net owed to the property for funds ROL holds. */
  amount: number;
  /** Gross collected by ROL for those bookings. */
  gross: number;
  /** Commission withheld from that gross. */
  commission: number;
  bookings: number;
}

/**
 * Money ROL has collected for confirmed/paid bookings that no payout statement
 * covers yet. Own-gateway (BYO) settlements are excluded — those funds never
 * reach ROL.
 */
export function computePendingSettlement(
  bookings: SettlementBooking[],
  opts: {
    /** Booking ids already reflected on a payout statement line. */
    statementedBookingIds: Set<string>;
    /** Booking ids whose gateway transaction settled through the property's own credentials. */
    byoBookingIds?: Set<string>;
    /** Resolves commission for a booking against its gross. */
    resolveCommission: (booking: SettlementBooking, gross: number) => number;
  },
): PendingSettlement {
  let gross = 0;
  let commission = 0;
  let count = 0;

  for (const b of bookings) {
    if (!b?.id) continue;
    if (opts.statementedBookingIds.has(b.id)) continue;
    if (EXCLUDED_BOOKING_STATUSES.includes(String(b.status || "").toLowerCase())) continue;
    const payment = String(b.payment_status || "").toLowerCase();
    if (!PAID_BOOKING_PAYMENT_STATUSES.includes(payment)) continue;
    if (payment === "paid_externally") continue;
    if (opts.byoBookingIds?.has(b.id)) continue;
    const amount = Number(b.total_price || 0);
    if (amount <= 0) continue;
    gross += amount;
    commission += Math.max(0, opts.resolveCommission(b, amount));
    count += 1;
  }

  return {
    amount: round2(Math.max(0, gross - commission)),
    gross: round2(gross),
    commission: round2(commission),
    bookings: count,
  };
}


/* ------------------------------------------------------------------ */
/* Account statement ledger                                            */
/* ------------------------------------------------------------------ */

export type LedgerKind = "subscription" | "setup" | "commission" | "payment" | "payout" | "payout_paid";

export interface LedgerEntry {
  date: string;
  kind: LedgerKind;
  reference: string;
  description: string;
  /** Positive increases what you owe ROL, negative reduces it. */
  amount: number;
  currency: string;
  status: string;
}

const KIND_FROM_SUBSCRIPTION = (inv: OwnerSubscriptionInvoice): LedgerKind =>
  inv.invoice_kind === "once_off" || (Number(inv.once_off_amount || 0) > 0 && !Number(inv.subscription_amount || 0))
    ? "setup"
    : "subscription";

export function buildLedger(input: BalanceInput): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const inv of input.subscriptionInvoices) {
    if (inv.status === "void") continue;
    const kind = KIND_FROM_SUBSCRIPTION(inv);
    entries.push({
      date: inv.created_at.slice(0, 10),
      kind,
      reference: inv.invoice_number || inv.id.slice(0, 8).toUpperCase(),
      description:
        kind === "setup"
          ? "Once-off / setup fees"
          : `Monthly subscription${inv.period_start ? ` ${inv.period_start.slice(0, 7)}` : ""}`,
      amount: round2(Number(inv.amount || 0)),
      currency: inv.currency || "ZAR",
      status: inv.status,
    });
    if (isSettled(inv.status)) {
      entries.push({
        date: (inv.paid_at || inv.created_at).slice(0, 10),
        kind: "payment",
        reference: inv.invoice_number || inv.id.slice(0, 8).toUpperCase(),
        description: "Payment received by ROL",
        amount: -round2(Number(inv.amount || 0)),
        currency: inv.currency || "ZAR",
        status: "paid",
      });
    }
  }

  for (const inv of input.rolInvoices) {
    if (inv.status === "void") continue;
    entries.push({
      date: (inv.issued_at || inv.created_at).slice(0, 10),
      kind: "commission",
      reference: inv.invoice_reference || inv.id.slice(0, 8).toUpperCase(),
      description: `ROL invoice ${inv.period_start.slice(0, 7)}${
        inv.booking_count ? ` — ${inv.booking_count} booking${inv.booking_count === 1 ? "" : "s"}` : ""
      }`,
      amount: round2(Number(inv.total || 0)),
      currency: inv.currency || "ZAR",
      status: inv.status,
    });
    if (Number(inv.amount_paid || 0) > 0) {
      entries.push({
        date: (inv.paid_at || inv.created_at).slice(0, 10),
        kind: "payment",
        reference: inv.invoice_reference || inv.id.slice(0, 8).toUpperCase(),
        description: "Payment received by ROL",
        amount: -round2(Number(inv.amount_paid || 0)),
        currency: inv.currency || "ZAR",
        status: "paid",
      });
    }
  }

  for (const s of input.payouts) {
    if (s.status === "void" || s.status === "draft") continue;
    entries.push({
      date: s.period_end.slice(0, 10),
      kind: s.status === "paid" ? "payout_paid" : "payout",
      reference: s.statement_reference || s.id.slice(0, 8).toUpperCase(),
      description:
        s.status === "paid"
          ? `Payout paid to you${s.payment_reference ? ` (${s.payment_reference})` : ""}`
          : "Payout due to you",
      amount: -round2(Number(s.net_payable || 0)),
      currency: s.currency || "ZAR",
      status: s.status,
    });
  }

  return entries.sort((a, b) => (a.date === b.date ? a.kind.localeCompare(b.kind) : a.date.localeCompare(b.date)));
}

export interface StatementPeriod {
  start: string;
  end: string;
}

export interface StatementView {
  openingBalance: number;
  closingBalance: number;
  entries: (LedgerEntry & { balance: number })[];
  allTime: {
    charged: number;
    paid: number;
    dueToYou: number;
    receivedFromRol: number;
    net: number;
  };
}

export function buildStatement(all: LedgerEntry[], period: StatementPeriod): StatementView {
  const opening = all
    .filter((e) => e.date < period.start)
    .reduce((sum, e) => round2(sum + e.amount), 0);

  let running = opening;
  const entries = all
    .filter((e) => e.date >= period.start && e.date <= period.end)
    .map((e) => {
      running = round2(running + e.amount);
      return { ...e, balance: running };
    });

  const charged = all.filter((e) => e.amount > 0).reduce((s, e) => round2(s + e.amount), 0);
  const paid = all.filter((e) => e.kind === "payment").reduce((s, e) => round2(s - e.amount), 0);
  const dueToYou = all.filter((e) => e.kind === "payout").reduce((s, e) => round2(s - e.amount), 0);
  const receivedFromRol = all.filter((e) => e.kind === "payout_paid").reduce((s, e) => round2(s - e.amount), 0);

  return {
    openingBalance: opening,
    closingBalance: running,
    entries,
    allTime: { charged, paid, dueToYou, receivedFromRol, net: round2(charged - paid - dueToYou - receivedFromRol) },
  };
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export interface MonthlyPoint {
  month: string;
  /** Revenue booked through ROL (gross value of confirmed bookings). */
  revenue: number;
  /** What ROL charged: commission + fees. */
  charged: number;
  bookings: number;
  /** Cost of distribution as a percentage of revenue. */
  costPct: number;
}

export interface RevenueRow {
  month: string;
  gross: number;
  bookings: number;
}

export function monthlySeries(revenue: RevenueRow[], ledger: LedgerEntry[]): MonthlyPoint[] {
  const map = new Map<string, MonthlyPoint>();
  const touch = (month: string) => {
    if (!map.has(month)) map.set(month, { month, revenue: 0, charged: 0, bookings: 0, costPct: 0 });
    return map.get(month)!;
  };

  for (const r of revenue) {
    const point = touch(r.month);
    point.revenue = round2(point.revenue + r.gross);
    point.bookings += r.bookings;
  }
  for (const e of ledger) {
    if (e.amount <= 0) continue;
    const point = touch(e.date.slice(0, 7));
    point.charged = round2(point.charged + e.amount);
  }
  for (const point of map.values()) {
    point.costPct = point.revenue > 0 ? round2((point.charged / point.revenue) * 100) : 0;
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function toCsv(rows: Record<string, string | number | null>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
