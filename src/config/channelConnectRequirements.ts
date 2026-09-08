/**
 * Sales-channel connect requirements.
 *
 * The Channel Manager's own connect wizard only ever answers with a generic refusal
 * ("not eligible"). Everything ROL'OS can measure locally is graded here BEFORE the
 * operator opens that wizard, so a miss names the field, the rule and the measurement,
 * and deep-links to the exact control.
 *
 * Three layers:
 *   - shared    — every channel wants it (already the go-live standard)
 *   - overlay   — only the selected channel enforces it (never raises go-live)
 *   - staffOnly — a partner/staff action, shown to platform users only
 *
 * This module never re-implements a predicate: shared rows delegate to
 * PROPERTY_FIELD_REQUIREMENTS / UNIT_ROW_RULES so the connect panel and the go-live
 * stepper can never disagree. It only adds the wording and the focus target.
 *
 * Vendor naming stays out of this surface (see src/lib/channelVocabulary.ts).
 */

import {
  PROPERTY_FIELD_REQUIREMENTS,
  REQUIREMENT_SHORTFALLS,
  UNIT_ROW_RULES,
  authoredBedCapacity,
  requirementRoomRows,
  type RequirementSubject,
  type RoomRequirementRow,
} from "@/config/propertyFieldRequirements";
import { normalizeChannelPropertyType } from "@/config/channelPropertyTypes";
import { isChannelListingNameLengthOk } from "@/lib/channelFieldRules";

export type ConnectChannelId = "all" | "airbnb" | "booking" | "expedia" | "vrbo" | "other";

export const CONNECT_CHANNELS: Array<{ id: ConnectChannelId; label: string; help?: string }> = [
  { id: "all", label: "All channels", help: "Everything every sales channel we can score asks for." },
  {
    id: "airbnb",
    label: "Airbnb",
    help: "Airbnb's published floors (7 photos, 50-character description, 5 amenities) are already covered by the listing standards above.",
  },
  { id: "booking", label: "Booking.com" },
  { id: "expedia", label: "Expedia" },
  { id: "vrbo", label: "VRBO / HomeAway" },
  { id: "other", label: "Other" },
];

export interface ConnectRequirement {
  key: string;
  /** Channels the rule belongs to. "all" = shared layer. */
  channels: ConnectChannelId[];
  title: string;
  /** The exact rule, printed verbatim. */
  requirement: string;
  section: string;
  /** Existing PROPERTY_FIELD_REQUIREMENTS key used as the deep-link focus. */
  focusKey: string;
  unitOwned: boolean;
  staffOnly?: boolean;
  /** Advisory rows are listed but never keep the panel red. */
  advisory?: boolean;
  appliesTo?: (subject: RequirementSubject) => boolean;
  isSatisfied: (subject: RequirementSubject) => boolean;
  describeShortfall: (subject: RequirementSubject) => string;
}

const str = (value: unknown): string => String(value ?? "").trim();

const amenityValue = (subject: RequirementSubject, key: string): unknown => {
  const bag = subject.amenities;
  if (!bag || typeof bag !== "object") return undefined;
  return (bag as Record<string, unknown>)[key];
};

const registryRow = (key: string) => PROPERTY_FIELD_REQUIREMENTS.find((r) => r.key === key);

/** Shortfall from the registry, so the panel prints the same measurement as the stepper. */
const registryShortfall = (key: string, fallback: string) =>
  (subject: RequirementSubject): string => {
    const row = registryRow(key);
    try {
      const measured = (row?.describeShortfall ?? REQUIREMENT_SHORTFALLS[key])?.(subject);
      if (measured) return measured;
    } catch {
      /* a shortfall helper must never break the panel */
    }
    return row?.hint || fallback;
  };

/** Row that delegates entirely to an existing registry key. */
const sharedRow = (spec: {
  key: string;
  title: string;
  requirement: string;
  unitOwned?: boolean;
  focusKey?: string;
  channels?: ConnectChannelId[];
  advisory?: boolean;
}): ConnectRequirement | null => {
  const row = registryRow(spec.key);
  if (!row) return null;
  return {
    key: spec.key,
    channels: spec.channels ?? ["all"],
    title: spec.title,
    requirement: spec.requirement,
    section: row.section,
    focusKey: spec.focusKey ?? spec.key,
    unitOwned: spec.unitOwned ?? false,
    advisory: spec.advisory,
    appliesTo: row.appliesTo,
    isSatisfied: (subject) => row.isSatisfied(subject),
    describeShortfall: registryShortfall(spec.key, spec.requirement),
  };
};

/* ------------------------------------------------------------------ *
 * Shared layer — the listing standard every sales channel expects.
 * ------------------------------------------------------------------ */

const SHARED_SPECS: Array<Parameters<typeof sharedRow>[0]> = [
  { key: "name", title: "Listing name", requirement: "A listing name is required." },
  {
    key: "name_hygiene",
    title: "Listing name characters",
    requirement:
      "Plain text, 3+ characters. No emoji, no special characters (< > [ ] | * # @ ! ?), not ALL CAPS.",
  },
  {
    key: "property_type",
    title: "Property type",
    requirement:
      "A channel property type must be mapped so the listing is not sent as an unknown object.",
  },
  {
    key: "room_channel_type",
    title: "Channel property type per unit",
    requirement:
      "A channel property type must be mapped so the listing is not sent as an unknown object.",
    unitOwned: true,
  },
  {
    key: "description",
    title: "Property description",
    requirement:
      "Property description must be at least 700 characters of original prose. No bullet-only text, no contact details or URLs.",
  },
  {
    key: "address",
    title: "Street address",
    requirement: "Full street address (name and number). A suburb or farm name alone is rejected.",
  },
  {
    key: "postal_code",
    title: "Postal / ZIP code",
    requirement: "Postal / ZIP code is required (3–10 letters or digits).",
  },
  {
    key: "city",
    title: "City",
    requirement: "City and country must match the official place names the channel can resolve.",
  },
  {
    key: "country",
    title: "Country",
    requirement: "City and country must match the official place names the channel can resolve.",
  },
  {
    key: "geo",
    title: "Map pin",
    requirement: "Map pin required. Latitude −90…90, longitude −180…180, not null-island.",
  },
  {
    key: "ru_location_id",
    title: "Channel location",
    requirement: "Channel location must be resolved from the address / pin.",
  },
  { key: "images", title: "Photographs", requirement: "At least 10 photographs." },
  {
    key: "image_dimensions",
    title: "Photo size",
    requirement: "Every measured photo at least 1024 × 768. No watermark, logo or text overlay.",
  },
  {
    key: "hero_image",
    title: "Main photo",
    requirement: "Exactly one photo designated as the main / hero image.",
  },
  {
    key: "facilities",
    title: "Property amenities",
    requirement:
      "A meaningful amenity set on the property (channel minimum is 5; ROL'OS authors 10).",
  },
  { key: "rooms", title: "Units", requirement: "At least one unit must exist on the listing." },
  {
    key: "room_descriptions",
    title: "Unit description",
    requirement: "Each unit needs at least 700 characters of description.",
    unitOwned: true,
  },
  { key: "room_floors", title: "Unit floor", requirement: "Each unit needs its floor captured.", unitOwned: true },
  {
    key: "room_size",
    title: "Unit size",
    requirement: "Each unit needs its size in m² captured.",
    unitOwned: true,
  },
  {
    key: "room_bathrooms",
    title: "Unit bathrooms",
    requirement: "Each unit needs at least one bathroom.",
    unitOwned: true,
  },
  {
    key: "room_toilets",
    title: "Unit toilets",
    requirement: "Each unit needs at least one toilet.",
    unitOwned: true,
  },
  {
    key: "room_bedroom_composition",
    title: "Bedroom composition",
    requirement: "Each unit needs its bedrooms and the beds inside them authored.",
    unitOwned: true,
  },
  {
    key: "room_beds",
    title: "Beds cover occupancy",
    requirement: "Authored sleeping places must cover the unit's maximum guests.",
    unitOwned: true,
  },
  {
    key: "room_beds_distributed",
    title: "Beds spread across bedrooms",
    requirement: "Beds must be distributed across the unit's bedrooms, not parked in one room.",
    unitOwned: true,
  },
  {
    key: "room_kitchen",
    title: "Kitchen",
    requirement:
      "A kitchen or kitchenette must be declared when the property type expects self-catering.",
    unitOwned: true,
  },
  {
    key: "check_times",
    title: "Check-in and check-out",
    requirement: "Check-in from and check-out until, 24-hour HH:MM.",
  },
  {
    key: "arrival_instructions",
    title: "Arrival instructions",
    requirement:
      "How the guest gets in: reception hours, key collection, gate / access, late arrival.",
  },
  {
    key: "master_policy",
    title: "Cancellation policy",
    requirement: "At least one cancellation policy with a notice window and a forfeit / refund rule.",
  },
  {
    key: "payment_methods",
    title: "Payment methods",
    requirement: "At least one accepted payment method.",
  },
  {
    key: "changeover_rules",
    title: "Changeover rules",
    requirement: "Changeover / closed-to-arrival rule authored.",
  },
  {
    key: "min_stay_set",
    title: "Minimum stay",
    requirement: "Minimum stay of at least 1 night must be authored.",
    unitOwned: true,
  },
  {
    key: "max_stay_set",
    title: "Maximum stay",
    requirement: "Maximum stay authored (use 0 for no maximum).",
    unitOwned: true,
  },
  {
    key: "bookable_window",
    title: "Prices and availability",
    requirement: "Open prices and availability on the published listing.",
  },
  {
    key: "ru_currency",
    title: "Listing currency",
    requirement: "Listing currency verified on the distribution account.",
  },
  { key: "contact_email", title: "Listing email", requirement: "Reachable listing contact." },
  { key: "contact_phone", title: "Listing phone", requirement: "Reachable listing contact." },
  {
    key: "attraction_distances",
    title: "Nearby attractions",
    requirement: "Nearby attractions that carry a usable distance.",
    advisory: true,
  },
];

/* ------------------------------------------------------------------ *
 * Overlays — only what we can measure locally.
 * ------------------------------------------------------------------ */

const APARTMENT_TYPE_RE = /apartment|studio|condo|flat|loft|apart/i;

const isApartmentStyle = (subject: RequirementSubject): boolean => {
  const propertyType = normalizeChannelPropertyType(subject.property_type);
  if (APARTMENT_TYPE_RE.test(propertyType)) return true;
  return requirementRoomRows(subject).some((room) =>
    APARTMENT_TYPE_RE.test(normalizeChannelPropertyType(room.channelPropertyType ?? room.property_type)),
  );
};

/** Countries whose channels commonly demand a tourism licence number. */
export const LICENCE_COUNTRIES = ["FR", "IT", "ES", "PT", "DE"];

const countryCode = (subject: RequirementSubject): string =>
  str(subject.country).slice(0, 2).toUpperCase();

const describeFailingUnits = (
  subject: RequirementSubject,
  rule: (room: RoomRequirementRow) => boolean,
  describe: (room: RoomRequirementRow, label: string) => string,
): string => {
  const rows = requirementRoomRows(subject);
  if (rows.length === 0) return "No units captured yet.";
  const failed = rows
    .map((room, index) => ({ room, label: str(room.name) || `Unit ${index + 1}` }))
    .filter(({ room }) => !rule(room));
  if (failed.length === 0) return "";
  return failed
    .slice(0, 3)
    .map(({ room, label }) => describe(room, label))
    .join(" · ");
};

const OVERLAY_ROWS: ConnectRequirement[] = [
  {
    key: "name_length_8_50",
    channels: ["airbnb", "vrbo"],
    title: "Listing name length",
    requirement: "Listing name for this channel must be between 8 and 50 characters.",
    section: "general",
    focusKey: registryRow("channel_listing_name") ? "channel_listing_name" : "name",
    unitOwned: false,
    isSatisfied: (s) =>
      isChannelListingNameLengthOk(str(s.name)) ||
      isChannelListingNameLengthOk(str(amenityValue(s, "channel_listing_name"))),
    describeShortfall: (s) => {
      const name = str(s.name);
      return `“${name}” is ${name.length} characters — this channel allows 8–50.`;
    },
  },
  {
    key: "room_beds_match_max",
    channels: ["airbnb", "booking"],
    title: "Beds vs guests",
    requirement:
      "Sleeping places from the authored bed configuration must equal the unit's maximum guests.",
    section: "rooms",
    focusKey: "room_beds",
    unitOwned: true,
    isSatisfied: (s) =>
      requirementRoomRows(s).length > 0 && requirementRoomRows(s).every(UNIT_ROW_RULES.bedsMatchMax),
    describeShortfall: (s) =>
      describeFailingUnits(
        s,
        UNIT_ROW_RULES.bedsMatchMax,
        (room, label) =>
          `${label}: beds sleep ${authoredBedCapacity(
            room.bedConfiguration ?? room.bed_configuration,
          )}, max guests is ${Number(room.maxPeople ?? room.max_guests ?? 0)} — they must be the same number.`,
      ) || "Beds and maximum guests do not match.",
  },
  {
    key: "booking_kitchen",
    channels: ["booking"],
    title: "Kitchen on apartment-style listings",
    requirement: "Booking.com requires a kitchen or kitchenette on apartment-style listings.",
    section: registryRow("room_kitchen")?.section ?? "rooms",
    focusKey: "room_kitchen",
    unitOwned: true,
    appliesTo: isApartmentStyle,
    isSatisfied: (s) => registryRow("room_kitchen")?.isSatisfied(s) ?? true,
    describeShortfall: () => "No kitchen or kitchenette declared in the unit facilities.",
  },
  {
    key: "licence_info",
    channels: ["airbnb", "booking", "expedia", "vrbo"],
    title: "Tourism licence",
    requirement: "A tourism licence number must be captured for listings in this country.",
    section: "general",
    focusKey: "vat_registration",
    unitOwned: false,
    staffOnly: true,
    appliesTo: (s) => LICENCE_COUNTRIES.includes(countryCode(s)),
    isSatisfied: (s) =>
      !!str(amenityValue(s, "licence_number")) || !!str(amenityValue(s, "tourism_licence_number")),
    describeShortfall: () =>
      "This country may require a tourism licence on the channel — capture is not in ROL'OS yet.",
  },
  {
    key: "vat_registration",
    channels: ["booking", "expedia"],
    title: "Business registration / VAT",
    requirement: "Booking.com and Expedia ask for a business registration or VAT number.",
    section: registryRow("vat_registration")?.section ?? "general",
    focusKey: "vat_registration",
    unitOwned: false,
    advisory: true,
    isSatisfied: (s) => registryRow("vat_registration")?.isSatisfied(s) ?? true,
    describeShortfall: () => "No business registration or VAT number captured.",
  },
  {
    key: "listing_published",
    channels: ["all"],
    title: "Listing published",
    requirement:
      "At least one listing must already be published on this distribution account before a sales channel can be connected.",
    section: "integrations",
    focusKey: "listing_published",
    unitOwned: false,
    isSatisfied: (s) =>
      !!str(s.rentalsunited_property_id) || !!str(s.rentalsunited_building_id),
    describeShortfall: () => "This listing has not been published to the Channel Manager yet.",
  },
  {
    key: "pms_profile_certified",
    channels: ["all"],
    title: "Channel Manager profile certified",
    requirement: "The Channel Manager PMS profile must be certified before live sales-channel connect.",
    section: "integrations",
    focusKey: "listing_published",
    unitOwned: false,
    staffOnly: true,
    // Unknown never blocks: only an explicit `false` from the platform is a miss.
    isSatisfied: (s) => (s as Record<string, unknown>).pms_profile_certified !== false,
    describeShortfall: () => "The PMS profile is not certified yet — partner certification is a staff action.",
  },
  {
    key: "channel_enabled_on_account",
    channels: ["all"],
    title: "Channel enabled on the account",
    requirement:
      "This sales channel is not enabled on the distribution account. That is a partner / staff action.",
    section: "integrations",
    focusKey: "listing_published",
    unitOwned: false,
    staffOnly: true,
    isSatisfied: (s) => (s as Record<string, unknown>).channel_enabled_on_account !== false,
    describeShortfall: () => "The channel is not enabled on the distribution account.",
  },
];

/** Every row in the catalogue: shared layer first, then overlays. */
export const CONNECT_REQUIREMENTS: ConnectRequirement[] = [
  ...SHARED_SPECS.map(sharedRow).filter((r): r is ConnectRequirement => r !== null),
  ...OVERLAY_ROWS,
];

export interface ConnectFailure {
  key: string;
  title: string;
  requirement: string;
  shortfall: string;
  section: string;
  focusKey: string;
  unit?: string;
  staffOnly: boolean;
  advisory: boolean;
}

export interface ConnectGrade {
  /** True when no mandatory owner row fails. */
  passed: boolean;
  failing: ConnectFailure[];
}

const unitFromDetail = (
  subject: RequirementSubject,
  detail: string,
): string | undefined => {
  const prefix = detail.split(":")[0]?.trim();
  if (!prefix || prefix.length > 60) return undefined;
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const rows = requirementRoomRows(subject);
  const match = rows.find((room, index) => norm(str(room.name) || `Unit ${index + 1}`) === norm(prefix));
  if (match) return str(match.name) || prefix;
  return /^unit \d+$/i.test(prefix) ? prefix : undefined;
};

const rowApplies = (row: ConnectRequirement, channel: ConnectChannelId): boolean => {
  if (channel === "all") return true;
  return row.channels.includes("all") || row.channels.includes(channel);
};

/**
 * Grade the listing for one channel chip.
 *
 * `all` grades the shared layer plus every overlay that applies to this listing, so one
 * pass is enough before the operator opens any channel wizard.
 */
export function gradeConnectEligibility(
  channel: ConnectChannelId,
  subject: RequirementSubject | null | undefined,
  opts: { includeStaff?: boolean } = {},
): ConnectGrade {
  if (!subject) return { passed: false, failing: [] };
  const failing: ConnectFailure[] = [];

  for (const row of CONNECT_REQUIREMENTS) {
    if (!rowApplies(row, channel)) continue;
    if (row.staffOnly && !opts.includeStaff) continue;
    if (row.appliesTo && !row.appliesTo(subject)) continue;

    let satisfied = true;
    try {
      satisfied = row.isSatisfied(subject);
    } catch {
      satisfied = true; // a broken predicate must never invent a blocker
    }
    if (satisfied) continue;

    let shortfall = row.requirement;
    try {
      shortfall = row.describeShortfall(subject) || row.requirement;
    } catch {
      /* keep the requirement as the fallback */
    }

    failing.push({
      key: row.key,
      title: row.title,
      requirement: row.requirement,
      shortfall,
      section: row.section,
      focusKey: row.focusKey,
      unit: row.unitOwned ? unitFromDetail(subject, shortfall) : undefined,
      staffOnly: !!row.staffOnly,
      advisory: !!row.advisory,
    });
  }

  const blocking = failing.filter((f) => !f.advisory && !f.staffOnly);
  return { passed: blocking.length === 0, failing };
}
