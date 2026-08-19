import { describe, expect, it, vi } from "vitest";
import {
  CHANNEL_LEDGER_STEP_KEYS,
  isChannelStepLedgerEnabled,
  logLedgerEvent,
  sanitizeLedgerDetail,
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

// ── Phase 1: readiness → ledger mapping ──

Deno.test("mapReadinessToLedgerRows marks steps passed when mandatory checks pass", () => {
  const rows = mapReadinessToLedgerRows({
    checks: [
      { key: "name", group: "Content", label: "Name", mandatory: true, passed: true },
      { key: "images", group: "Photos", label: "10 photos", mandatory: true, passed: false, detail: "Only 4 photos", unit: "Galjoen" },
      { key: "currency_verified", group: "Channel publishing", label: "Currency", mandatory: false, passed: true },
    ],
  });
  const byStep = new Map(rows.map((r) => [r.step_key, r]));
  assertEquals(byStep.get("identity")?.status, "passed");
  assertEquals(byStep.get("media")?.status, "blocked");
  assertEquals(byStep.get("media")?.blocker_summary, "Galjoen: Only 4 photos");
  assertEquals(byStep.get("currency")?.status, "passed");
});

Deno.test("mapReadinessToLedgerRows returns unknown (never blocked) when readiness could not be evaluated", () => {
  const rows = mapReadinessToLedgerRows({ error: "Dry run failed", checks: [] });
  assertEquals(rows.length > 0, true);
  assertEquals(rows.every((r) => r.status === "unknown"), true);
  assertEquals(rows.some((r) => r.status === "blocked"), false);
});

Deno.test("mapReadinessToLedgerRows treats an empty check list as unanswered", () => {
  const rows = mapReadinessToLedgerRows({ checks: [] });
  assertEquals(rows.every((r) => r.status === "unknown"), true);
});

Deno.test("ledgerFingerprint is stable and input-sensitive", () => {
  assertEquals(ledgerFingerprint({ a: 1 }), ledgerFingerprint({ a: 1 }));
  assertEquals(ledgerFingerprint({ a: 1 }) === ledgerFingerprint({ a: 2 }), false);
});
