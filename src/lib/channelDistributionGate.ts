/**
 * Channel-wizard gates that depend on a live RU sub-account.
 *
 * A property is unbound when the push owner is missing or the key & secret
 * have not been captured. Leftover listing IDs, currency ticks, sign-off
 * and a billing Channel Manager switch cannot count as complete in that state.
 */

export interface DistributionBindSignals {
  ruOwnerId?: string | null;
  keysCaptured?: boolean | null;
  pushGated?: boolean | null;
}

export function isDistributionBound(signals: DistributionBindSignals): boolean {
  if (signals.pushGated === true) return false;
  const owner = !!String(signals.ruOwnerId ?? "").trim();
  const keys = signals.keysCaptured === true;
  return owner && keys;
}

export interface PushReportSignals extends DistributionBindSignals {
  ruPushEnabled?: boolean | null;
  companyDetailsSent?: boolean | null;
  companyFilledAt?: string | null;
}

/**
 * "Push on" in Channel Monitor / RU Accounts. The stored flag is not enough:
 * an unbound property (or one that has not sent company details) cannot be
 * pushing until the Channel wizard identity gates pass.
 */
export function pushReportedOn(signals: PushReportSignals): boolean {
  if (signals.ruPushEnabled !== true) return false;
  if (!isDistributionBound(signals)) return false;
  if (signals.companyDetailsSent === false) return false;
  return true;
}

/** Last-sent company profile may only say "in sync" when a live push is possible. */
export function companySyncEligible(signals: PushReportSignals): boolean {
  return pushReportedOn(signals) && !!signals.companyFilledAt;
}

export type UnboundDependentStep = "publish" | "verify listings" | "currency" | "signoff" | "entitlement" | "connect";

export function unboundDependentDetail(step: UnboundDependentStep, leftover = false): string {
  switch (step) {
    case "publish":
      return leftover
        ? "Listing IDs are leftover from a previous bind. Push is not valid until the owner key & secret are configured."
        : "Property is unbound — configure the push owner and the key & secret before a push can succeed.";
    case "verify listings":
      return "Listings cannot be read back while the property is unbound.";
    case "currency":
      return "Location & currency cannot be verified while the property is unbound.";
    case "signoff":
      return "Sub-account cannot be verified while the property is unbound.";
    case "entitlement":
      return "Channel Manager cannot be enabled while the property is unbound.";
    case "connect":
      return "Channels cannot connect while the property is unbound.";
  }
}
