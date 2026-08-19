import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));

const { ledgerStepComplete } = await import("../channelStepLedger");

describe("ledgerStepComplete", () => {
  it("completes a passed step", () => {
    expect(ledgerStepComplete({ step_key: "media", status: "passed" })).toBe(true);
  });

  it("never completes a blocked step, even with a prior pass", () => {
    expect(
      ledgerStepComplete({ step_key: "media", status: "blocked", passed_at: "2026-01-01T00:00:00Z" }),
    ).toBe(false);
  });

  it("keeps a prior pass through stale and unknown", () => {
    for (const status of ["stale", "unknown", "pending"] as const) {
      expect(ledgerStepComplete({ step_key: "publish", status, passed_at: "2026-01-01T00:00:00Z" })).toBe(true);
      expect(ledgerStepComplete({ step_key: "publish", status })).toBe(false);
    }
  });

  it("treats a missing row as not complete", () => {
    expect(ledgerStepComplete(undefined)).toBe(false);
  });
});
