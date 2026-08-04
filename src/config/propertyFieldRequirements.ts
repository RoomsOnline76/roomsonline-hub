import type { PropertySectionKey } from "@/config/propertySectionOrder";

/**
 * Field-level readiness registry.
 *
 * Single source of truth for WHICH fields the activation readiness score counts,
 * WHERE they live, and HOW to tell whether they are satisfied.
 *
 * Mirrors the checks in `supabase/functions/check-activation-readiness/index.ts`:
 *   severity 'blocker'  -> tier 'mandatory'   (pink border)
 *   severity 'warning'  -> tier 'recommended' (blue border)
 *
 * The DOM `target` is a CSS selector resolved inside the property editor. Most
 * controls already carry an `id`; anything nested (amenities.*) is matched via a
 * `data-field="<path>"` attribute added to that control.
 */

export type RequirementTier = "mandatory" | "recommended";

/** Shape we evaluate against — the raw `properties` row plus its amenities blob. */
export interface RequirementSubject {
  name?: string | null;
  property_type?: string | null;
  description?: string | null;
  short_description?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  owner_email?: string | null;
  images?: unknown;
  amenities?: Record<string, unknown> | null;
  external_system?: string | null;
  rentalsunited_property_id?: string | number | null;
  rentalsunited_building_id?: string | number | null;
  [key: string]: unknown;
}

export interface FieldRequirement {
  /** Stable key, also used as the deep-link `focus` value. */
  key: string;
  /** Human label used in the stepper and tooltips. */
  label: string;
  tier: RequirementTier;
  /** Section (tab) key that owns the field. */
  section: PropertySectionKey;
  /** CSS selector(s) for the control, first match wins. */
  target: string[];
  /** Short hint shown when the stepper lands on the field. */
  hint?: string;
  /** True when the requirement is met. */
  isSatisfied: (subject: RequirementSubject) => boolean;
  /** Only evaluate/paint when this returns true (e.g. RU-only fields). */
  appliesTo?: (subject: RequirementSubject) => boolean;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const filled = (v: unknown): boolean => str(v).length > 0;

const amenity = (subject: RequirementSubject, path: string): unknown => {
  let cursor: unknown = subject.amenities ?? {};
  for (const part of path.split(".")) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
};

const imageList = (subject: RequirementSubject): unknown[] =>
  Array.isArray(subject.images) ? subject.images : [];

const isRuDistributed = (subject: RequirementSubject): boolean =>
  filled(subject.rentalsunited_property_id) || filled(subject.rentalsunited_building_id);

export const PROPERTY_FIELD_REQUIREMENTS: FieldRequirement[] = [
  /* ---------- Identity & Location (general) ---------- */
  {
    key: "name",
    label: "Property name",
    tier: "mandatory",
    section: "general",
    target: ["#name"],
    isSatisfied: (s) => filled(s.name),
  },
  {
    key: "property_type",
    label: "Property type",
    tier: "mandatory",
    section: "general",
    target: ["#property_type"],
    isSatisfied: (s) => filled(s.property_type),
  },
  {
    key: "description",
    label: "Description (min 100 characters)",
    tier: "mandatory",
    section: "general",
    target: ["#description", '[data-field="description"]'],
    hint: "Must be at least 100 characters to pass the content check.",
    isSatisfied: (s) => str(s.description).length >= 100,
  },
  {
    key: "address",
    label: "Street address",
    tier: "mandatory",
    section: "general",
    target: ["#address"],
    isSatisfied: (s) => filled(s.address),
  },
  {
    key: "city",
    label: "City / town",
    tier: "mandatory",
    section: "general",
    target: ["#city"],
    isSatisfied: (s) => filled(s.city),
  },
  {
    key: "country",
    label: "Country",
    tier: "mandatory",
    section: "general",
    target: ["#country", '[data-field="country"]'],
    isSatisfied: (s) => filled(s.country),
  },
  {
    key: "geo",
    label: "Map pin (latitude & longitude)",
    tier: "mandatory",
    section: "general",
    target: ['[data-field="geo"]', "#latitude", "#longitude"],
    hint: "Drop the map pin or geocode the address.",
    isSatisfied: (s) => filled(s.latitude) && filled(s.longitude),
  },
  {
    key: "owner_email",
    label: "Owner email (contract holder)",
    tier: "mandatory",
    section: "general",
    target: ["#owner_email", '[data-field="owner_email"]'],
    hint: "The signed contract is matched on this email.",
    isSatisfied: (s) => filled(s.owner_email),
  },
  {
    key: "banking",
    label: "Banking details",
    tier: "recommended",
    section: "general",
    target: [
      '[data-field="amenities.bank_name"]',
      "#bank_name",
      '[data-field="banking"]',
    ],
    hint: "Needed for commission and payout remittance.",
    isSatisfied: (s) =>
      filled(amenity(s, "bank_name")) ||
      filled(amenity(s, "bank_account_number")) ||
      filled(amenity(s, "bank_confirmation_letter_url")) ||
      filled(amenity(s, "banking.bank_name")) ||
      filled(amenity(s, "banking.account_number")),
  },
  {
    key: "vat_registration",
    label: "Business registration / VAT",
    tier: "recommended",
    section: "general",
    target: ['[data-field="property_registration"]', "#property_registration", "#vat_number"],
    isSatisfied: (s) =>
      filled(amenity(s, "property_registration")) ||
      filled(amenity(s, "vat_number")) ||
      filled(s.property_registration) ||
      filled(s.vat_number),
  },

  /* ---------- Media (images) ---------- */
  {
    key: "images",
    label: "At least 3 gallery images",
    tier: "mandatory",
    section: "images",
    target: ['[data-field="images"]', "#property-images"],
    hint: "Upload 3 or more images (min 1024×683).",
    isSatisfied: (s) => imageList(s).length >= 3,
  },
  {
    key: "hero_image",
    label: "Hero image designated",
    tier: "recommended",
    section: "images",
    target: ['[data-field="images"]', "#property-images"],
    hint: "Mark one image as the hero / featured image.",
    isSatisfied: (s) => {
      const imgs = imageList(s);
      if (imgs.length === 0) return false;
      return imgs.some(
        (img) =>
          typeof img === "string" ||
          (img as Record<string, unknown>)?.type === "hero" ||
          (img as Record<string, unknown>)?.is_main === true ||
          (img as Record<string, unknown>)?.is_hero === true,
      );
    },
  },

  /* ---------- Contacts ---------- */
  {
    key: "contact_email",
    label: "Reservations email",
    tier: "mandatory",
    section: "contacts",
    target: [
      '[data-field="amenities.reservations_email"]',
      '[data-field="contact_email"]',
      "#contact_email",
    ],
    isSatisfied: (s) =>
      filled(amenity(s, "reservations_email")) ||
      filled(amenity(s, "contact_email")) ||
      filled(amenity(s, "public_email")) ||
      filled(s.contact_email),
  },
  {
    key: "contact_phone",
    label: "Reception / reservations phone",
    tier: "mandatory",
    section: "contacts",
    target: ['[data-field="amenities.reception_phone"]', '[data-field="telephone"]', "#telephone"],
    isSatisfied: (s) =>
      filled(amenity(s, "reception_phone")) ||
      filled(amenity(s, "telephone")) ||
      filled(amenity(s, "public_phone")) ||
      filled(s.telephone),
  },
  {
    key: "emergency_contact",
    label: "Emergency contact",
    tier: "recommended",
    section: "contacts",
    target: ['[data-field="amenities.emergency_phone"]', '[data-field="emergency_contact"]'],
    isSatisfied: (s) =>
      filled(amenity(s, "emergency_phone")) || filled(amenity(s, "emergency_contact")),
  },

  /* ---------- Facilities ---------- */
  {
    key: "facilities",
    label: "Facilities checklist",
    tier: "recommended",
    section: "info-facilities",
    target: ['[data-field="facilities"]', "#facilities"],
    hint: "Channels rank listings with 10+ amenities much higher.",
    isSatisfied: (s) => {
      const list = amenity(s, "facilities");
      return Array.isArray(list) ? list.length >= 10 : false;
    },
  },
  {
    key: "star_rating",
    label: "Star rating",
    tier: "recommended",
    section: "info-facilities",
    target: ['[data-field="star_rating"]', "#star_rating"],
    isSatisfied: (s) => Number(amenity(s, "star_rating") ?? 0) > 0,
  },

  /* ---------- Rooms ---------- */
  {
    key: "rooms",
    label: "At least one room type",
    tier: "mandatory",
    section: "rooms",
    target: ['[data-field="rooms"]', "#room-types"],
    isSatisfied: (s) => {
      const rooms = amenity(s, "room_types");
      return Array.isArray(rooms) ? rooms.length > 0 : false;
    },
  },

  /* ---------- Rates & Policies ---------- */
  {
    key: "master_policy",
    label: "Master cancellation policy",
    tier: "mandatory",
    section: "rates",
    target: ['[data-field="master_policy"]', "#master_policy"],
    hint: "Pick a policy from the library, or explicitly select “None”.",
    isSatisfied: (s) =>
      filled(amenity(s, "master_cancellation_policy_id")) ||
      filled(amenity(s, "cancellation_policy")) ||
      amenity(s, "master_cancellation_policy_id") === "none",
  },
  {
    key: "check_times",
    label: "Check-in / check-out times",
    tier: "recommended",
    section: "rates",
    target: ['[data-field="check_in_from"]', "#check_in_from"],
    isSatisfied: (s) => filled(amenity(s, "check_in_from")) && filled(amenity(s, "check_out_to")),
  },

  /* ---------- Integrations / distribution ---------- */
  {
    key: "ru_currency",
    label: "Rentals United currency",
    tier: "mandatory",
    section: "integrations",
    target: ['[data-field="amenities.banking.currency"]', '[data-field="ru_currency"]'],
    hint: "Channels silently reject listings without a resolvable currency.",
    appliesTo: isRuDistributed,
    isSatisfied: (s) =>
      filled(amenity(s, "banking.currency")) || filled(amenity(s, "currency")),
  },
];

/** All requirements that apply to the given property. */
export function applicableRequirements(subject: RequirementSubject): FieldRequirement[] {
  return PROPERTY_FIELD_REQUIREMENTS.filter((r) => !r.appliesTo || r.appliesTo(subject));
}

export interface RequirementStatus extends FieldRequirement {
  satisfied: boolean;
}

export function evaluateRequirements(subject: RequirementSubject): RequirementStatus[] {
  return applicableRequirements(subject).map((r) => ({ ...r, satisfied: r.isSatisfied(subject) }));
}

export interface SectionRequirementCounts {
  mandatory: number;
  recommended: number;
}

/** Outstanding (unsatisfied) counts per section key. */
export function countOutstandingBySection(
  statuses: RequirementStatus[],
): Record<string, SectionRequirementCounts> {
  const out: Record<string, SectionRequirementCounts> = {};
  for (const s of statuses) {
    if (s.satisfied) continue;
    const bucket = (out[s.section] ??= { mandatory: 0, recommended: 0 });
    if (s.tier === "mandatory") bucket.mandatory += 1;
    else bucket.recommended += 1;
  }
  return out;
}

/** Maps a readiness check id (edge function) → the field requirement keys it covers. */
export const CHECK_TO_FIELD_KEYS: Record<string, string[]> = {
  contract: ["owner_email"],
  content: ["name", "property_type", "description"],
  media: ["images", "hero_image"],
  commercial: ["banking"],
  location: ["address", "city", "country", "geo"],
  contact: ["contact_email", "contact_phone", "emergency_contact"],
  rooms: ["rooms"],
  policies: ["master_policy"],
  rentalsunited_geo: ["geo"],
  rentalsunited_location_currency: ["ru_currency"],
};
