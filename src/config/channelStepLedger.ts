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

/**
 * The five Ready-to-sell steps — the only steps the onboarding queue's channel
 * percentage measures, so the bar can only read 0/20/40/60/80/100.
 */
export const READY_TO_SELL_LEDGER_STEP_KEYS = [
  "identity",
  "location",
  "rooms",
  "media",
  "commercial",
] as const satisfies readonly ChannelLedgerStepKey[];

/** Ledger row that carries the gate's own overall Ready-to-sell verdict. */
export const READY_TO_SELL_GATE_STEP_KEY = "ready_to_sell";


/** Platform settings key holding `{ "enabled": boolean }` for the ledger rollout. */
export const CHANNEL_STEP_LEDGER_SETTING_KEY = "channel_step_ledger_enabled";
