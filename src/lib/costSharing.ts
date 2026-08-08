/**
 * ROL Pulse → Cost Sharing.
 *
 * A 60/40 settlement basis applies to platform build expenses until app
 * commissioning is complete. Dawie (partner, 40%) has already paid every
 * invoice in full, so his share is always considered settled. Carike's
 * contributions reduce her 60% allocation; whatever is left is outstanding.
 *
 * All screen figures and the PDF statement read from these pure functions so
 * the two can never diverge.
 */

import { invoiceZar, type BurnInvoice, type FxRates, DEFAULT_FX } from "./burnRate";

export const CONTRIBUTORS = {
  dawie: { key: "dawie", name: "Dawie J Erasmus", email: "dev@roomsonline.co.za", role: "partner" },
  carike: { key: "carike", name: "Carike", email: "carike@roomsonline.co.za", role: "roomsonline" },
} as const;

export type ContributorKey = keyof typeof CONTRIBUTORS;

export const contributorName = (key: string): string =>
  CONTRIBUTORS[key as ContributorKey]?.name ?? key;

export interface CostShareConfig {
  id?: string;
  split_active: boolean;
  roomsonline_pct: number;
  partner_pct: number;
  commissioning_complete: boolean;
  statement_fx_usd_zar: number;
}

export const DEFAULT_COST_SHARE_CONFIG: CostShareConfig = {
  split_active: false,
  roomsonline_pct: 60,
  partner_pct: 40,
  commissioning_complete: false,
  statement_fx_usd_zar: 16.5,
};

export interface Contribution {
  id?: string;
  contributor_key: string;
  contributor_name?: string | null;
  contribution_date: string;
  amount: number | string;
  source_currency?: string | null;
  amount_zar: number | string;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
}

const toNum = (value: number | string | null | undefined): number => {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const sumInvoicesZar = (
  invoices: BurnInvoice[] | null | undefined,
  fx: FxRates = DEFAULT_FX,
): number => (invoices ?? []).reduce((sum, inv) => sum + invoiceZar(inv, fx), 0);

export const sumContributionsZar = (
  contributions: Contribution[] | null | undefined,
  key?: ContributorKey,
): number =>
  (contributions ?? [])
    .filter((c) => !key || c.contributor_key === key)
    .reduce((sum, c) => sum + toNum(c.amount_zar), 0);

export interface CostShareSummary {
  /** Spend inside the selected period. */
  periodSpendZar: number;
  /** Every bill ever loaded. */
  allTimeSpendZar: number;
  roomsonlinePct: number;
  partnerPct: number;
  /** Carike's 60% of all-time spend. */
  roomsonlineAllocationZar: number;
  /** Dawie's 40% of all-time spend. */
  partnerAllocationZar: number;
  /** Contributions received from Carike (all time). */
  carikeContributedZar: number;
  /** Contributions/settlements recorded against Dawie (all time). */
  dawieContributedZar: number;
  /** Carike's remaining balance after her contributions. */
  roomsonlineOutstandingZar: number;
  /** Dawie's 40% is settled by the invoices he already paid. */
  partnerOutstandingZar: number;
  totalContributedZar: number;
}

export function computeCostShare(params: {
  periodInvoices: BurnInvoice[] | null | undefined;
  allInvoices: BurnInvoice[] | null | undefined;
  contributions: Contribution[] | null | undefined;
  config: CostShareConfig;
  fx?: FxRates;
}): CostShareSummary {
  const { periodInvoices, allInvoices, contributions, config } = params;
  const fx = params.fx ?? DEFAULT_FX;

  const periodSpendZar = sumInvoicesZar(periodInvoices, fx);
  const allTimeSpendZar = sumInvoicesZar(allInvoices, fx);

  const roomsonlinePct = config.split_active ? toNum(config.roomsonline_pct) : 100;
  const partnerPct = config.split_active ? toNum(config.partner_pct) : 0;

  const roomsonlineAllocationZar = (allTimeSpendZar * roomsonlinePct) / 100;
  const partnerAllocationZar = (allTimeSpendZar * partnerPct) / 100;

  const carikeContributedZar = sumContributionsZar(contributions, "carike");
  const dawieContributedZar = sumContributionsZar(contributions, "dawie");

  /* Dawie already paid the invoices in full, so anything he contributed beyond
     his own 40% allocation is a credit against Carike's side. */
  const dawieCredit = Math.max(0, dawieContributedZar - partnerAllocationZar);

  const roomsonlineOutstandingZar = Math.max(
    0,
    roomsonlineAllocationZar - carikeContributedZar - dawieCredit,
  );

  return {
    periodSpendZar,
    allTimeSpendZar,
    roomsonlinePct,
    partnerPct,
    roomsonlineAllocationZar,
    partnerAllocationZar,
    carikeContributedZar,
    dawieContributedZar,
    roomsonlineOutstandingZar,
    partnerOutstandingZar: 0,
    totalContributedZar: sumContributionsZar(contributions),
  };
}

export const formatZar = (value: number): string =>
  `R${Math.abs(value).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const formatZarSigned = (value: number): string =>
  value < 0 ? `(${formatZar(value)})` : formatZar(value);
