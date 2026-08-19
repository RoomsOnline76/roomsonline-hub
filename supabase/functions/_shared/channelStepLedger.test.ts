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
