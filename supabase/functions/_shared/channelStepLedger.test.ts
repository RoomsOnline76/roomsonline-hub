import { describe, expect, it, vi } from "vitest";
import {
  CHANNEL_LEDGER_STEP_KEYS,
  isChannelStepLedgerEnabled,
  logLedgerEvent,
  sanitizeLedgerDetail,
  mapReadinessToLedgerRows,
  ledgerFingerprint,
} from "./channelStepLedger";

function fakeAdmin(value: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: value === undefined ? null : { value } }) }),
      }),
    }),
  };
}

describe("channel step ledger flag", () => {
  it("defaults to false when the setting row is missing", async () => {
    expect(await isChannelStepLedgerEnabled(fakeAdmin(undefined))).toBe(false);
  });

  it("is false unless explicitly enabled", async () => {
    expect(await isChannelStepLedgerEnabled(fakeAdmin({ enabled: false }))).toBe(false);
    expect(await isChannelStepLedgerEnabled(fakeAdmin({}))).toBe(false);
    expect(await isChannelStepLedgerEnabled(fakeAdmin({ enabled: true }))).toBe(true);
  });

  it("resolves false when the read throws", async () => {
    const throwing = {
      from: () => {
        throw new Error("denied");
      },
    };
    expect(await isChannelStepLedgerEnabled(throwing)).toBe(false);
  });
});

describe("ledger logging", () => {
  it("redacts credential-shaped fields at any depth", () => {
    const safe = sanitizeLedgerDetail({
      AccessKey: "abc",
      nested: { SecretKey: "xyz", unit: "Galjoen" },
      step: "keys",
    });
    expect(safe).toEqual({
      AccessKey: "[REDACTED]",
      nested: { SecretKey: "[REDACTED]", unit: "Galjoen" },
      step: "keys",
    });
  });

  it("never throws and never prints secrets", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logLedgerEvent({ propertyId: "p1", event: "keys.verified", detail: { secret_key: "s3cr3t" } });
    const line = spy.mock.calls[0].join(" ");
    expect(line).not.toContain("s3cr3t");
    expect(line).toContain("keys.verified");
    spy.mockRestore();
  });

  it("documents all fourteen canonical step keys", () => {
    expect(CHANNEL_LEDGER_STEP_KEYS).toHaveLength(14);
  });
});

describe("readiness → ledger mapping", () => {
  it("marks steps passed or blocked from mandatory checks", () => {
    const rows = mapReadinessToLedgerRows({
      checks: [
        { key: "name", group: "Content", label: "Name", mandatory: true, passed: true },
        { key: "images", group: "Photos", label: "10 photos", mandatory: true, passed: false, detail: "Only 4 photos", unit: "Galjoen" },
        { key: "currency_verified", group: "Channel publishing", label: "Currency", mandatory: false, passed: true },
      ],
    });
    const byStep = new Map(rows.map((r) => [r.step_key, r]));
    expect(byStep.get("identity")?.status).toBe("passed");
    expect(byStep.get("media")?.status).toBe("blocked");
    expect(byStep.get("media")?.blocker_summary).toBe("Galjoen: Only 4 photos");
    expect(byStep.get("currency")?.status).toBe("passed");
  });

  it("groups policies, availability and pricing under commercial", () => {
    const rows = mapReadinessToLedgerRows({
      checks: [
        { key: "policy", group: "Policies & payments", label: "Policies", mandatory: true, passed: true },
        { key: "avail", group: "Availability 365d", label: "Availability", mandatory: true, passed: true },
        { key: "price", group: "Pricing 365d", label: "Pricing", mandatory: true, passed: true },
      ],
    });
    expect(rows.map((r) => r.step_key)).toEqual(["commercial"]);
    expect(rows[0].details).toMatchObject({ checks_total: 3, checks_passed: 3 });
  });

  it("returns unknown, never blocked, when readiness could not be evaluated", () => {
    const rows = mapReadinessToLedgerRows({ error: "Dry run failed", checks: [] });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === "unknown")).toBe(true);
  });

  it("treats an empty check list as unanswered", () => {
    const rows = mapReadinessToLedgerRows({ checks: [] });
    expect(rows.every((r) => r.status === "unknown")).toBe(true);
  });

  it("fingerprints are stable and input sensitive", () => {
    expect(ledgerFingerprint({ a: 1 })).toBe(ledgerFingerprint({ a: 1 }));
    expect(ledgerFingerprint({ a: 1 })).not.toBe(ledgerFingerprint({ a: 2 }));
  });
});
