/**
 * Two-step channel onboarding — task registry.
 *
 * Single source of truth for what Step A and Step B actually do, in order. The monitor
 * renders this registry; the orchestrator supplies one runner per task id. Nothing here
 * knows anything about channel wire format.
 */

export type ChannelOnboardStep = "a" | "b";

export type ChannelOnboardTaskId =
  | "owner_account"
  | "api_keys"
  | "verify_keys"
  | "company_profile"
  | "adopt_listings"
  | "review_listings"
  | "push_property"

  | "verify_listings"
  | "verify_currency"
  | "entitlement";

export interface ChannelOnboardTask {
  id: ChannelOnboardTaskId;
  step: ChannelOnboardStep;
  title: string;
  /** What the operator gets out of it — plain language, no vendor naming. */
  detail: string;
  /** Optional tasks never stop the chain. */
  optional?: boolean;
}

export const CHANNEL_ONBOARD_TASKS: ChannelOnboardTask[] = [
  {
    id: "owner_account",
    step: "a",
    title: "Confirm or create the distribution account",
    detail: "Adopts an existing account for this owner email, or creates one. Never duplicates an identity.",
  },
  {
    id: "api_keys",
    step: "a",
    title: "Capture & verify account credentials",
    detail:
      "Opens the capture window for the key pair created in the channel portal, then signs in with it so every later write is correctly scoped. Keys are never auto-generated.",
  },

  {
    id: "company_profile",
    step: "a",
    title: "Company profile",
    detail: "Sends the owner's company details on the account's own credentials.",
  },
  {
    id: "adopt_listings",
    step: "a",
    title: "Adopt existing listings",
    detail: "Links anything already on the account to this property so the push updates instead of duplicating.",
  },
  {
    id: "review_listings",
    step: "b",
    title: "Review what is already published",
    detail:
      "Reads the current listings back and compares them with local content, so only changed rooms are re-sent.",
  },
  {
    id: "push_property",
    step: "b",
    title: "Push property, rooms and full ARI",
    detail:
      "Publishes changed content, then availability and pricing for the rolling 365-day horizon. Content is skipped when nothing moved.",
  },

  {
    id: "verify_listings",
    step: "b",
    title: "Read the listings back",
    detail: "Confirms every unit exists on the distribution account under the expected identity.",
  },
  {
    id: "verify_currency",
    step: "b",
    title: "Verify location & currency",
    detail: "Checks the published location and currency agree on both sides.",
  },
  {
    id: "entitlement",
    step: "b",
    title: "Enable Channel Manager",
    detail: "Switches Channel Manager on for the billing profile so sales channels can connect.",
  },
];

export const CHANNEL_ONBOARD_STEP_META: Record<
  ChannelOnboardStep,
  { key: "monitor_step_a" | "monitor_step_b"; title: string; goal: string; cta: string }
> = {
  a: {
    key: "monitor_step_a",
    title: "Distribution account",
    goal: "One correct distribution account for this owner, with verified credentials and company profile.",
    cta: "Continue",
  },
  b: {
    key: "monitor_step_b",
    title: "Publish property & ARI",
    goal: "The property, its rooms and a full year of availability and pricing are live and read back.",
    cta: "Publish",
  },
};

/** Readiness groups that make up mandatory steps 1–5 (mirrors the edge gate). */
export const READY_TO_SELL_GROUP_LABELS = [
  "Content",
  "Address & geo",
  "Rooms & beds",
  "Photos",
  "Policies & payments",
  "Availability 365d",
  "Pricing 365d",
];

/** The five Ready-to-sell macros, mapped to the scorer groups they own. */
export const READY_TO_SELL_STEPS = [
  { key: "identity", label: "Content", groups: ["Content"] },
  { key: "location", label: "Address & geo", groups: ["Address & geo"] },
  { key: "rooms", label: "Rooms & beds", groups: ["Rooms & beds"] },
  { key: "media", label: "Photos", groups: ["Photos"] },
  { key: "commercial", label: "Policies, rates & availability", groups: ["Policies & payments", "Availability 365d", "Pricing 365d"] },
] as const;
