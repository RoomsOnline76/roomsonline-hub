import { describe, expect, it } from "vitest";
import { invoiceCountsTowardSetup, setupResetAt } from "./setupSettlement";

describe("setupResetAt", () => {
  it("reads the stamp from billing custom_overrides", () => {
    expect(setupResetAt({ custom_overrides: { setup_reset_at: "2026-08-14T10:00:00.000Z" } })).toBe(
      "2026-08-14T10:00:00.000Z",
    );
    expect(setupResetAt({ custom_overrides: {} })).toBeNull();
  });
});

describe("invoiceCountsTowardSetup", () => {
  it("ignores paid invoices from before an owner-change reset", () => {
    expect(
      invoiceCountsTowardSetup({ created_at: "2026-01-01T00:00:00.000Z" }, "2026-08-14T10:00:00.000Z"),
    ).toBe(false);
    expect(
      invoiceCountsTowardSetup({ created_at: "2026-08-15T00:00:00.000Z" }, "2026-08-14T10:00:00.000Z"),
    ).toBe(true);
  });
});
