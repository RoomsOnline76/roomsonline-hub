import { describe, expect, it } from "vitest";
import {
  isEligibleForOnboardingQueue,
  isValidLatestContract,
  propertyEditorContract,
} from "./contractStatus";

describe("latest contract status", () => {
  it("accepts only a latest signed or overridden contract", () => {
    expect(isValidLatestContract({ status: "signed" })).toBe(true);
    expect(isValidLatestContract({ status: "overridden" })).toBe(true);
    expect(isValidLatestContract({ status: "sent" })).toBe(false);
    expect(isValidLatestContract({ status: "revoked" })).toBe(false);
  });

  it("does not expose a revoked record in the property editor", () => {
    expect(propertyEditorContract({ status: "revoked", id: "history-only" })).toBeNull();
    expect(propertyEditorContract({ status: "sent", id: "replacement" })).toEqual({
      status: "sent",
      id: "replacement",
    });
  });

  it("removes a revoked agreement from the onboarding work queue", () => {
    expect(isEligibleForOnboardingQueue({ status: "revoked" })).toBe(false);
    expect(isEligibleForOnboardingQueue({ status: "sent" })).toBe(true);
    expect(isEligibleForOnboardingQueue({ status: "signed" })).toBe(true);
    expect(isEligibleForOnboardingQueue(null)).toBe(true);
  });
});