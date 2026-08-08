import { describe, it, expect } from "vitest";
import {
  computeRunway,
  convertToZar,
  deriveMonthlyBurnZar,
  deriveRecurringCommitments,
  invoiceZar,
  monthlyEquivalentZar,
  recurringKey,
  type BurnInvoice,
  type FxRates,
} from "./burnRate";

const rates: FxRates = { usdZar: 18, eurZar: 20 };

const bill = (overrides: Partial<BurnInvoice>): BurnInvoice => ({
  description: "Supabase Pro",
  vendor: "Supabase",
  billing_type: "monthly",
  source_currency: "ZAR",
  cost_zar: 1000,
  invoice_date: "2026-01-01",
  ...overrides,
});

describe("cadence normalisation", () => {
  it("keeps monthly bills as-is", () => {
    expect(monthlyEquivalentZar(1200, "monthly")).toBe(1200);
  });

  it("divides quarterly bills by three", () => {
    expect(monthlyEquivalentZar(1200, "quarterly")).toBe(400);
  });

  it("divides annual bills by twelve", () => {
    expect(monthlyEquivalentZar(1200, "annual")).toBe(100);
  });

  it("gives once-off bills no monthly cost", () => {
    expect(monthlyEquivalentZar(1200, "once_off")).toBe(0);
  });
});

describe("currency conversion", () => {
  it("converts EUR to ZAR", () => {
    expect(convertToZar(250, "EUR", rates)).toBe(5000);
  });

  it("converts USD to ZAR", () => {
    expect(convertToZar(100, "USD", rates)).toBe(1800);
  });

  it("uses the stored ZAR value when present", () => {
    const invoice = bill({ source_currency: "EUR", cost_eur: 250, cost_zar: 4800 });
    expect(invoiceZar(invoice, rates)).toBe(4800);
  });

  it("converts from the invoiced currency when no ZAR value is stored", () => {
    const invoice = bill({ source_currency: "EUR", cost_eur: 250, cost_zar: null });
    expect(invoiceZar(invoice, rates)).toBe(5000);
  });
});

describe("recurring commitment identity", () => {
  it("matches case-insensitively on vendor, description and cadence", () => {
    expect(recurringKey(bill({ vendor: "GitHub", description: "Copilot" }))).toBe(
      recurringKey(bill({ vendor: "github", description: " copilot " })),
    );
  });

  it("treats different cadences as different commitments", () => {
    expect(recurringKey(bill({ billing_type: "monthly" }))).not.toBe(
      recurringKey(bill({ billing_type: "annual" })),
    );
  });
});

describe("deriveRecurringCommitments", () => {
  it("counts a recurring commitment once across many invoices", () => {
    const invoices = [
      bill({ invoice_date: "2026-01-01", cost_zar: 1000 }),
      bill({ invoice_date: "2026-02-01", cost_zar: 1000 }),
      bill({ invoice_date: "2026-03-01", cost_zar: 1000 }),
    ];
    const commitments = deriveRecurringCommitments(invoices, rates);
    expect(commitments).toHaveLength(1);
    expect(commitments[0].invoiceCount).toBe(3);
    expect(deriveMonthlyBurnZar(invoices, rates)).toBe(1000);
  });

  it("takes the price from the most recent invoice", () => {
    const invoices = [
      bill({ invoice_date: "2026-01-01", cost_zar: 1000 }),
      bill({ invoice_date: "2026-04-01", cost_zar: 1500 }),
      bill({ invoice_date: "2026-02-01", cost_zar: 1200 }),
    ];
    const [commitment] = deriveRecurringCommitments(invoices, rates);
    expect(commitment.monthlyZar).toBe(1500);
    expect(commitment.latestInvoiceDate).toBe("2026-04-01");
  });

  it("excludes once-off bills from burn", () => {
    const invoices = [
      bill({ billing_type: "once_off", cost_zar: 50000, description: "Laptop" }),
      bill({ cost_zar: 800 }),
    ];
    expect(deriveMonthlyBurnZar(invoices, rates)).toBe(800);
  });

  it("normalises a EUR annual bill into a monthly ZAR cost", () => {
    const invoices = [
      bill({
        description: "Channel Manager",
        vendor: "Channel",
        billing_type: "annual",
        source_currency: "EUR",
        cost_eur: 6000,
        cost_zar: null,
      }),
    ];
    // 6000 EUR * 20 = 120 000 ZAR / 12 = 10 000
    expect(deriveMonthlyBurnZar(invoices, rates)).toBe(10000);
  });

  it("includes paid invoices — burn is a commitment, not an outstanding balance", () => {
    const invoices = [bill({ is_paid: true, cost_zar: 700 })];
    expect(deriveMonthlyBurnZar(invoices, rates)).toBe(700);
  });

  it("sums distinct commitments", () => {
    const invoices = [
      bill({ vendor: "Supabase", description: "Pro", cost_zar: 1000 }),
      bill({ vendor: "Resend", description: "Emails", cost_zar: 400 }),
      bill({ vendor: "Resend", description: "Emails", cost_zar: 450, invoice_date: "2026-02-01" }),
    ];
    expect(deriveMonthlyBurnZar(invoices, rates)).toBe(1450);
  });
});

describe("computeRunway", () => {
  it("divides cash by net burn", () => {
    const result = computeRunway(100000, 15000, 5000);
    expect(result.netBurnZar).toBe(10000);
    expect(result.months).toBe(10);
    expect(result.cashFlowPositive).toBe(false);
  });

  it("flags cash-flow positive when revenue covers burn", () => {
    const result = computeRunway(100000, 10000, 12000);
    expect(result.cashFlowPositive).toBe(true);
    expect(result.months).toBeNull();
  });

  it("returns null when there is no burn", () => {
    expect(computeRunway(100000, 0, 0).months).toBeNull();
  });

  it("returns null when cash is unknown", () => {
    expect(computeRunway(null, 10000, 0).months).toBeNull();
  });
});
