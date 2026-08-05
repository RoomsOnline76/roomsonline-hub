/**
 * ROL'OS Channel Readiness — macro step registry.
 *
 * Single source of truth for the eleven macro steps described in
 * `docs/rolos-onboarding-channel-readiness.md`. The wizard renders this registry;
 * the progress hook only supplies truth values for the referenced keys.
 *
 * Field-level truth always comes from `propertyFieldRequirements.ts` (via
 * `usePropertyReadiness`) — never re-implemented here. Distribution truth comes
 * from the distribution state keys below.
 */

/** Keys resolved by `useRolosOnboardingProgress().state`. */
export type DistributionCheckKey =
  | "timezone_format"
  | "location_id"
  | "google_place_id"
  | "content_quality"
  | "address_geo"
  | "rooms_beds"
  | "photos"
  | "policies_payments"
  | "pricing_365"
  | "availability_365"
  | "sub_owner_id"
  | "api_keys_stored"
  | "api_keys_verified"
  | "listing_ids"
  | "quality_check"
  | "currency_verified"
  | "manual_signoff"
  | "channel_entitlement"
  | "channels_connected";

export interface MacroStateTask {
  kind: "state";
  key: DistributionCheckKey;
  /** Optional override label — otherwise the state supplies it. */
  label?: string;
  /** Recommended tasks never gate the next macro. */
  optional?: boolean;
}

export interface MacroFieldTask {
  kind: "fields";
  /** Requirement sections owned by this macro (see propertySectionOrder keys). */
  sections: string[];
  label: string;
}

export type MacroTask = MacroStateTask | MacroFieldTask;

export type MacroActionKind = "ensure_owner" | "signoff" | "open_channels" | "none";

export interface MacroDef {
  key: string;
  order: number;
  title: string;
  goal: string;
  /** Where the owner does the work — deep-linked from the wizard. */
  section?: string;
  tasks: MacroTask[];
  /** Extra manual notes rendered as plain guidance (no scoring). */
  notes?: string[];
  action?: MacroActionKind;
  /** Manual macros are completed by a human, not by a resolver. */
  manual?: boolean;
  adminOnly?: boolean;
}

export const ROLOS_ONBOARDING_MACROS: MacroDef[] = [
  {
    key: "identity",
    order: 1,
    title: "Property identity & company profile",
    goal: "The property exists in ROL'OS with a complete, legally valid identity.",
    section: "general",
    tasks: [
      { kind: "fields", sections: ["general", "contacts"], label: "Identity, company & contact fields" },
      { kind: "state", key: "timezone_format" },
      { kind: "state", key: "content_quality", optional: true },
    ],
    notes: [
      "Portfolio properties: enable Portfolio Commons auto-share so legal, banking and contact data propagate to siblings.",
    ],
  },
  {
    key: "location",
    order: 2,
    title: "Location & geo registration",
    goal: "The property resolves to a real, distribution-recognised location.",
    section: "general",
    tasks: [
      { kind: "state", key: "address_geo" },
      { kind: "state", key: "location_id" },
      { kind: "state", key: "google_place_id", optional: true },
    ],
  },
  {
    key: "rooms",
    order: 3,
    title: "Rooms, composition & occupancy",
    goal: "Sellable inventory is modelled correctly, unit by unit.",
    section: "rooms",
    tasks: [
      { kind: "fields", sections: ["rooms", "info-facilities"], label: "Room & facility fields" },
      { kind: "state", key: "rooms_beds" },
    ],
    notes: ["Use TOBI amenity scouting to pre-fill unit amenities, then confirm each unit."],
  },
  {
    key: "media",
    order: 4,
    title: "Media",
    goal: "The listing meets image quality minimums.",
    section: "images",
    tasks: [
      { kind: "fields", sections: ["images"], label: "Media fields" },
      { kind: "state", key: "photos" },
    ],
    notes: ["At least 10 photos, each 1024 × 683px or larger, exactly one main image, tagged for channel mapping."],
  },
  {
    key: "commercial",
    order: 5,
    title: "Policies, rates & pricing coverage",
    goal: "Commercial terms are complete and priced for a full year.",
    section: "rates",
    tasks: [
      { kind: "fields", sections: ["rates"], label: "Rates & policy fields" },
      { kind: "state", key: "policies_payments" },
      { kind: "state", key: "pricing_365" },
      { kind: "state", key: "availability_365" },
    ],
    notes: ["Specials, packages and add-ons are optional but publish with the rate set once configured."],
  },
  {
    key: "push_owner",
    order: 6,
    title: "Push owner: create the distribution sub-user",
    goal: "The owner exists as a distribution identity.",
    section: "integrations",
    tasks: [{ kind: "state", key: "sub_owner_id" }],
    action: "ensure_owner",
    adminOnly: true,
  },
  {
    key: "keys",
    order: 7,
    title: "Create key & secret for the sub-account",
    goal: "The sub-account authenticates with its own credentials.",
    section: "integrations",
    manual: true,
    tasks: [
      { kind: "state", key: "api_keys_stored" },
      { kind: "state", key: "api_keys_verified" },
    ],
    notes: [
      "Sign in to the owner portal with the sub-account login, create the API key and secret, then capture them in the ROL'OS owner panel.",
    ],
  },
  {
    key: "publish",
    order: 8,
    title: "Push property & full ARI publish",
    goal: "The property is live on the distribution layer with a stable identity.",
    section: "integrations",
    tasks: [
      { kind: "state", key: "listing_ids" },
      { kind: "state", key: "quality_check" },
    ],
    notes: [
      "Push stays disabled below 100% mandatory readiness. Re-push updates the stored listing IDs — it never duplicates.",
      "Availability and pricing publish for the full rolling 365-day horizon and are read back to verify.",
    ],
  },
  {
    key: "currency",
    order: 9,
    title: "Location & currency verification",
    goal: "The published location and currency agree on both sides.",
    section: "integrations",
    tasks: [{ kind: "state", key: "currency_verified" }],
  },
  {
    key: "signoff",
    order: 10,
    title: "Sub-account verification",
    goal: "A human confirms the live sub-account looks correct.",
    manual: true,
    adminOnly: true,
    action: "signoff",
    tasks: [{ kind: "state", key: "manual_signoff" }],
    notes: [
      "Sign in with the sub-account login and confirm: owner details, company details, property/properties present, calendar resolves in the correct currency, and no outstanding content-quality warnings.",
    ],
  },
  {
    key: "channels",
    order: 11,
    title: "Connect channels",
    goal: "The owner activates the sales channels they want to trade on.",
    action: "open_channels",
    tasks: [
      { kind: "state", key: "channel_entitlement" },
      { kind: "state", key: "channels_connected", optional: true },
    ],
    notes: [
      "Connect one channel at a time. Verify each: listing visible, availability and pricing present, quality check passed, first inbound test reservation writes a booking and blocks availability.",
    ],
  },
];

export function getMacro(key: string): MacroDef | undefined {
  return ROLOS_ONBOARDING_MACROS.find((m) => m.key === key);
}
