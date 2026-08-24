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
  | "contract_signed"
  | "timezone_format"
  | "location_id"
  | "google_place_id"
  | "content_quality"
  | "unit_content_quality"
  | "unit_stay_times"
  | "address_geo"
  | "rooms_beds"
  | "photos"
  | "policies_payments"
  | "pricing_365"
  | "availability_365"
  | "sub_owner_id"
  | "api_keys_stored"
  | "api_keys_verified"
  | "company_details"
  | "manual_signoff"
  | "listings_pulled"
  | "listing_ids"
  | "listings_verified"
  | "quality_check"
  | "currency_verified"
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

export type MacroActionKind =
  | "ensure_owner"
  | "ensure_company_details"
  | "signoff"
  | "pull_listings"
  | "open_channels"
  | "none";

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
  /**
   * Steps 6–14 are executed as the two-step flow on Channel Monitor → Onboard Property.
   * They stay listed here so the roadmap still shows the full journey, but the wizard
   * points at the monitor rather than asking the owner to drive each channel call.
   */
  monitorOwned?: boolean;
}

export const ROLOS_ONBOARDING_MACROS: MacroDef[] = [
  {
    key: "identity",
    order: 1,
    title: "Property identity & company profile",
    goal: "The property exists in ROL'OS with a complete, legally valid identity.",
    section: "general",
    tasks: [
      { kind: "state", key: "contract_signed" },
      { kind: "fields", sections: ["general", "contacts"], label: "Identity, company & contact fields" },
      { kind: "state", key: "timezone_format" },
      { kind: "state", key: "content_quality" },
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
      { kind: "state", key: "unit_content_quality" },
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
      { kind: "fields", sections: ["rates", "policies"], label: "Rates & policy fields" },
      { kind: "state", key: "policies_payments" },
      { kind: "state", key: "unit_stay_times" },
      { kind: "state", key: "pricing_365" },
      { kind: "state", key: "availability_365" },
    ],
    notes: ["Specials, packages and add-ons are optional but publish with the rate set once configured."],
  },
  {
    key: "push_owner",
    monitorOwned: true,
    order: 6,
    title: "Push owner: create the distribution sub-user",
    goal: "The owner exists as a distribution identity.",
    section: "integrations",
    tasks: [{ kind: "state", key: "sub_owner_id" }],
    action: "ensure_owner",
    adminOnly: true,
    notes: [
      "Existing distribution owners are detected first (by owner ID, then login email) and simply linked — the owner ID is adopted and no duplicate identity is created.",
    ],

  },
  {
    key: "keys",
    monitorOwned: true,
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
      "Sign in to the distribution account portal with the sub-account login, open Security settings, generate the API key and secret, then capture them in the ROL'OS owner panel.",
      "The secret is shown once. Copy both values before closing the dialog — if it is lost, generate a fresh pair and re-save it here.",
      "Until the pair is stored and verified, nothing is sent for this account: content, pricing and availability pushes are held rather than sent on the parent account.",
      "This step is done the moment the pair is stored and verified — the company profile is sent for you in the next step.",
    ],

  },
  {
    key: "company_profile",
    monitorOwned: true,
    order: 8,
    title: "Company profile on the sub-account",
    goal: "The sub-account carries the owner's company profile, sent with its own verified keys.",
    section: "integrations",
    action: "ensure_company_details",
    adminOnly: true,
    tasks: [{ kind: "state", key: "company_details" }],
    notes: [
      "This runs automatically as soon as the key pair is verified — no button needed.",
      "The manual send is a correction tool: use it after editing Company Information, or to retry a failed attempt.",
    ],
  },
  {
    key: "signoff",
    monitorOwned: true,
    order: 9,
    title: "Sub-account verification",
    goal: "A human confirms the live sub-account is correct before anything is published.",
    manual: true,
    adminOnly: true,
    action: "signoff",
    tasks: [{ kind: "state", key: "manual_signoff" }],
    notes: [
      "Sign in with the sub-account login, then tick each item below as you confirm it. The step completes only once every item is ticked.",
      "This happens before the push, so a wrong owner, company profile or currency is caught before anything is published.",
    ],

  },
  {
    key: "pull_listings",
    monitorOwned: true,
    order: 10,
    title: "Pull listings (if any)",
    goal: "Any listing already present under the sub-account is adopted, so the push never duplicates.",
    section: "integrations",
    action: "pull_listings",
    adminOnly: true,
    tasks: [{ kind: "state", key: "listings_pulled" }],
    notes: [
      "Lists everything under the sub-account and links matches to this property and its units by name.",
      "An empty sub-account is normal — the step passes as “nothing to adopt” and the push creates the listing.",
    ],
  },
  {
    key: "publish",
    monitorOwned: true,
    order: 11,
    title: "Push property & full ARI publish",
    goal: "The property is live on the distribution layer with a stable identity.",
    section: "integrations",
    tasks: [
      { kind: "state", key: "listing_ids" },
      { kind: "state", key: "listings_verified" },
      { kind: "state", key: "quality_check", optional: true },
    ],


    notes: [
      "Push stays disabled below 100% mandatory readiness. Re-push updates the stored listing IDs — it never duplicates.",
      "Availability and pricing publish for the full rolling 365-day horizon and are read back to verify.",
      "The content quality check runs later — it can only be assessed once a channel subscription exists.",
    ],

  },
  {
    key: "currency",
    monitorOwned: true,
    order: 12,
    title: "Location & currency verification",
    goal: "The published location and currency agree on both sides.",
    section: "integrations",
    tasks: [{ kind: "state", key: "currency_verified" }],
  },
  {
    key: "entitlement",
    monitorOwned: true,
    order: 13,
    title: "Enable Channel Manager",
    goal: "Channel Manager is on the billing profile so channels can connect.",
    section: "admin",
    adminOnly: true,
    tasks: [{ kind: "state", key: "channel_entitlement" }],
    notes: [
      "This is the billing switch — not a separate admin page. Enabling it unlocks the channel console on this same screen.",
    ],
  },
  {
    key: "connect",
    monitorOwned: true,
    order: 14,
    title: "Connect channels",
    goal: "The owner activates the sales channels they want to trade on.",
    action: "open_channels",
    tasks: [{ kind: "state", key: "channels_connected" }],
    notes: [
      "Connect channels one at a time in the Channel Manager on this page. A first inbound test reservation should write a booking and block availability.",
    ],
  },
];


export function getMacro(key: string): MacroDef | undefined {
  return ROLOS_ONBOARDING_MACROS.find((m) => m.key === key);
}

/**
 * Step 8 sub-account verification checklist — ticked before anything is published.
 * Each item is ticked individually by an admin / owner / developer; the macro only
 * completes once all are ticked.
 */
export interface SignoffChecklistItem {
  key: string;
  label: string;
}

export const ROLOS_SIGNOFF_CHECKLIST: SignoffChecklistItem[] = [
  { key: "login_works", label: "Sub-account login signs in successfully" },
  { key: "owner_details", label: "Owner details are correct" },
  { key: "company_details", label: "Company details are correct" },
  { key: "account_currency", label: "Account currency & locale are correct" },
  { key: "no_stray_listings", label: "No unexpected pre-existing listings on the sub-account" },
];

