/**
 * Subscription amount drift.
 *
 * The payment gateway keeps charging the amount of the subscription the owner
 * activated. When the billing configuration changes (payment model, add-ons,
 * room tier) the contracted monthly fee moves, but the gateway keeps collecting
 * the old amount until the current plan is cancelled and the new one activated.
 *
 * This helper compares the two so the ROL Account and the admin billing
 * overview can flag the mismatch instead of it going unnoticed.
 */

export interface DriftInvoiceLike {
  invoice_kind?: string | null;
  status?: string | null;
  amount?: number | string | null;
  subscription_amount?: number | string | null;
  paid_at?: string | null;
  created_at?: string | null;
}

export interface SubscriptionDrift {
  /** Amount the gateway is collecting today (last paid subscription invoice). */
  billed: number;
  /** Contracted monthly fee resolved from the billing config. */
  contracted: number;
  /** billed − contracted (positive = the client is being over-charged). */
  difference: number;
  /** True when the two differ and there is a live collected amount to compare. */
  drifting: boolean;
  /** True when a plan change has already been scheduled for the new amount. */
  scheduled: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const isSubscriptionInvoice = (inv: DriftInvoiceLike) =>
  inv.invoice_kind !== "once_off" && inv.invoice_kind !== "setup";

/** The amount currently being collected: the most recent paid subscription. */
export function lastCollectedAmount(invoices: DriftInvoiceLike[] | null | undefined): number {
  const paid = (invoices ?? [])
    .filter((i) => isSubscriptionInvoice(i) && i.status === "paid")
    .sort((a, b) => String(b.paid_at || b.created_at || "").localeCompare(String(a.paid_at || a.created_at || "")));
  const latest = paid[0];
  if (!latest) return 0;
  return num(latest.subscription_amount) || num(latest.amount);
}

export function detectSubscriptionDrift(opts: {
  contractedMonthlyFee: number;
  invoices?: DriftInvoiceLike[] | null;
  /** Pass through when the backend already resolved the collected amount. */
  billedAmount?: number | null;
  /** A pending plan already parked for the new amount. */
  pendingMonthlyFee?: number | null;
}): SubscriptionDrift {
  const contracted = Math.round(num(opts.contractedMonthlyFee) * 100) / 100;
  const billed =
    opts.billedAmount != null && num(opts.billedAmount) > 0
      ? Math.round(num(opts.billedAmount) * 100) / 100
      : Math.round(lastCollectedAmount(opts.invoices) * 100) / 100;
  const difference = Math.round((billed - contracted) * 100) / 100;
  const drifting = billed > 0 && Math.abs(difference) > 0.005;
  const scheduled =
    opts.pendingMonthlyFee != null && Math.abs(num(opts.pendingMonthlyFee) - contracted) <= 0.005;
  return { billed, contracted, difference, drifting, scheduled };
}

export function driftMessage(d: SubscriptionDrift, fmt: (n: number) => string): string {
  const direction = d.difference > 0 ? "more than" : "less than";
  return `The payment gateway is collecting ${fmt(d.billed)} per month — ${direction} the contracted amount of ${fmt(
    d.contracted,
  )}.`;
}
