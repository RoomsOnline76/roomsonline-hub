/**
 * Channel step ledger — canonical step keys (Phase 0, documentation only).
 *
 * These mirror the macro `key` values in `rolosOnboardingMacros.ts`. Later phases
 * will record one ledger row per step using these keys; nothing is wired to them
 * yet and no wizard behaviour depends on this file.
 */
export const CHANNEL_LEDGER_STEP_KEYS = [
  "identity",
  "location",
  "rooms",
  "media",
  "commercial",
  "push_owner",
  "keys",
  "company_profile",
  "signoff",
  "pull_listings",
  "publish",
  "currency",
  "entitlement",
  "connect",
] as const;

export type ChannelLedgerStepKey = (typeof CHANNEL_LEDGER_STEP_KEYS)[number];

/** Platform settings key holding `{ "enabled": boolean }` for the ledger rollout. */
export const CHANNEL_STEP_LEDGER_SETTING_KEY = "channel_step_ledger_enabled";
