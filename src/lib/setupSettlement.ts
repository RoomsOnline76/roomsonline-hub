/**
 * Settlement state for once-off (setup) fees.
 *
 * Once-off fees are contracted on the billing config but settled through
 * `subscription_invoices` rows with `invoice_kind = 'once_off'`. This module
 * reconciles the two so every surface reports the same picture: what is paid,
 * what is still outstanding, and — when the config changed after payment —
 * which individual fee re-opened a balance.
 *
 * Pure functions only. Callers supply the contracted lines and the invoice rows.
 */

/** Canonical key for a setup fee, tolerant of every historic kind spelling. */
export function setupKey(kind?: string | null): string {
  const k = String(kind || "")
    .toLowerCase()
    .replace(/^setup[_-]/, "")
    .replace(/[_-]setup$/, "");
  if (/price ?labs/.test(k)) return "pricelabs";
  if (/white[_-]?label|^wl$/.test(k)) return "white_label";
  if (/brand/.test(k)) return "branding";
  return k || "other";
}

/**
 * Same normalisation, driven off a human label ("White-Label setup") because the
 * Estimated Client Cost card builds its lines from labels rather than kinds.
 */
export function setupKeyFromLabel(label: string): string {
  const l = label.toLowerCase();
  if (/price ?labs/.test(l)) return "pricelabs";
  if (/white[- _]?label/.test(l)) return "white_label";
  if (/brand/.test(l)) return "branding";
  return "other";
}

export interface ContractedSetupLine {
  /** Canonical key, e.g. `white_label`. */
  key: string;
  amount: number;
}

export interface OnceOffInvoiceLike {
  status?: string | null;
  amount?: number | string | null;
  paid_at?: string | null;
  line_items?: unknown;
}

export type SetupLineState = "paid" | "partial" | "due";

export interface SetupSettlement {
  /** Total settled across all paid once-off invoices. */
  paidTotal: number;
  /** Contracted total still payable (floored at zero). */
  outstanding: number;
  /** Contracted total the settlement was measured against. */
  contractedTotal: number;
  /** Latest payment date across paid once-off invoices. */
  lastPaidAt: string | null;
  /** Per-fee settlement state, keyed by canonical setup key. */
  byKey: Record<string, { paid: number; contracted: number; state: SetupLineState }>;
  /** True when something has been paid and nothing is outstanding. */
  fullySettled: boolean;
  /** True when a payment exists but a later change re-opened a balance. */
  reopened: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Amount settled per canonical key, read off paid invoices' line items. */
function paidByKey(invoices: OnceOffInvoiceLike[]): Record<string, number> {
  const out: Record<string, number> = {};
  invoices.forEach((inv) => {
    const items = Array.isArray(inv.line_items) ? (inv.line_items as Record<string, unknown>[]) : [];
    items.forEach((li) => {
      const amount = num(li?.amount);
      // Credit lines ("Less: once-off fees already paid") must not inflate a key.
      if (amount <= 0) return;
      const key = setupKey(
        (li?.kind as string) || (typeof li?.description === "string" ? li.description : ""),
      );
      out[key] = round2((out[key] || 0) + amount);
    });
  });
  return out;
}

export function resolveSetupSettlement(
  contracted: ContractedSetupLine[],
  invoices: OnceOffInvoiceLike[] | null | undefined,
): SetupSettlement {
  const paidInvoices = (invoices || []).filter((i) => String(i.status || "").toLowerCase() === "paid");
  const paidTotal = round2(paidInvoices.reduce((s, i) => s + num(i.amount), 0));
  const contractedTotal = round2(contracted.reduce((s, l) => s + num(l.amount), 0));
  const outstanding = round2(Math.max(0, contractedTotal - paidTotal));
  const lastPaidAt =
    paidInvoices
      .map((i) => (i.paid_at ? String(i.paid_at) : null))
      .filter((d): d is string => !!d)
      .sort()
      .pop() || null;

  const settledPerKey = paidByKey(paidInvoices);
  const byKey: SetupSettlement["byKey"] = {};
  contracted.forEach((line) => {
    const paid = round2(settledPerKey[line.key] || 0);
    const amount = round2(num(line.amount));
    const state: SetupLineState = paid <= 0 ? "due" : paid + 0.001 >= amount ? "paid" : "partial";
    byKey[line.key] = { paid, contracted: amount, state };
  });

  return {
    paidTotal,
    outstanding,
    contractedTotal,
    lastPaidAt,
    byKey,
    fullySettled: paidTotal > 0 && outstanding <= 0,
    reopened: paidTotal > 0 && outstanding > 0,
  };
}
