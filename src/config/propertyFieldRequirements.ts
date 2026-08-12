import type { PropertySectionKey } from "@/config/propertySectionOrder";
import { calculateBedCapacity, parseBedConfiguration } from "@/lib/bedConfig";

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

type ContactRow = { role?: string | null; name?: string | null; email?: string | null; phone?: string | null };

const contactRows = (subject: RequirementSubject): ContactRow[] =>
  Array.isArray(subject.contact_rows) ? (subject.contact_rows as ContactRow[]) : [];

/** True when any saved contact row (optionally of the given roles) has the field filled. */
const contactHas = (
  subject: RequirementSubject,
  field: "email" | "phone",
  roles?: string[],
): boolean =>
  contactRows(subject).some((row) => {
    if (roles && roles.length > 0 && !roles.includes(String(row.role ?? ""))) return false;
    const value = row[field];
    return typeof value === "string" && value.trim().length > 0;
  });

const amenity = (subject: RequirementSubject, path: string): unknown => {
  let cursor: unknown = subject.amenities ?? {};
  for (const part of path.split(".")) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
};

/**
 * Check-in / check-out times are written by the property form into
 * `amenities.house_rules.*`; older records keep them at the amenities root.
 */
const checkTime = (subject: RequirementSubject, edge: "in" | "out"): unknown => {
  const keys =
    edge === "in"
      ? ["check_in_from", "check_in_time"]
      : ["check_out_to", "check_out_until", "check_out_time", "check_out_from"];
  for (const key of keys) {
    const nested = amenity(subject, `house_rules.${key}`);
    if (filled(nested)) return nested;
    const flat = amenity(subject, key);
    if (filled(flat)) return flat;
  }
  return undefined;
};

const imageList = (subject: RequirementSubject): unknown[] =>
  Array.isArray(subject.images) ? subject.images : [];

type RoomRequirementRow = {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  floor?: number | null;
  bathrooms?: number | null;
  toilets?: number | null;
  maxPeople?: number | null;
  max_guests?: number | null;
  bedConfiguration?: unknown;
  bed_configuration?: unknown;
  images?: unknown;
  amenities?: unknown;
};

const roomRows = (subject: RequirementSubject): RoomRequirementRow[] => {
  const rooms = amenity(subject, "room_types");
  return Array.isArray(rooms) ? (rooms as RoomRequirementRow[]) : [];
};

const numericAtLeast = (value: unknown, minimum: number): boolean => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum;
};

const bedCapacity = (raw: unknown): number => calculateBedCapacity(parseBedConfiguration(raw));


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
    label: "Description (min 700 characters)",
    tier: "mandatory",
    section: "general",
    target: ["#description", '[data-field="description"]'],
    hint: "Must be at least 700 characters to pass channel certification.",
    isSatisfied: (s) => str(s.description).length >= 700,
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
    label: "At least 10 gallery images",
    tier: "mandatory",
    section: "images",
    target: ['[data-field="images"]', "#property-images"],
    hint: "Upload 10 or more measured images (min 1024×768).",
    isSatisfied: (s) => imageList(s).length >= 10,
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
      filled(s.contact_email) ||
      contactHas(s, "email"),
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
      filled(s.telephone) ||
      contactHas(s, "phone"),
  },
  {
    key: "emergency_contact",
    label: "Emergency contact",
    tier: "recommended",
    section: "contacts",
    target: ['[data-field="amenities.emergency_phone"]', '[data-field="emergency_contact"]'],
    isSatisfied: (s) =>
      filled(amenity(s, "emergency_phone")) ||
      filled(amenity(s, "emergency_contact")) ||
      contactHas(s, "phone", ["emergency", "after_hours"]),
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
  {
    key: "room_descriptions",
    label: "Every unit description has 700+ characters",
    tier: "mandatory",
    section: "rooms",
    target: ['[data-field="room_description"]'],
    hint: "Open the named unit and add at least 700 characters of original description.",
    isSatisfied: (s) => roomRows(s).length > 0 && roomRows(s).every((room) => str(room.description).length >= 700),
  },
  {
    key: "room_floors",
    label: "Floor captured for every unit",
    tier: "mandatory",
    section: "rooms",
    target: ['[data-field="floor"]'],
    hint: "Choose 0 for ground floor; blank is not accepted.",
    isSatisfied: (s) => roomRows(s).length > 0 && roomRows(s).every((room) => room.floor !== null && room.floor !== undefined),
  },
  {
    key: "room_bathrooms",
    label: "At least 1 bathroom per unit",
    tier: "mandatory",
    section: "rooms",
    target: ['[data-field="bathrooms"]'],
    hint: "Each unit must explicitly capture its own bathroom count.",
    isSatisfied: (s) => roomRows(s).length > 0 && roomRows(s).every((room) => numericAtLeast(room.bathrooms, 1)),
  },
  {
    key: "room_toilets",
    label: "At least 1 toilet per unit",
    tier: "mandatory",
    section: "rooms",
    target: ['[data-field="toilets"]'],
    hint: "Blank and zero both block channel onboarding.",
    isSatisfied: (s) => roomRows(s).length > 0 && roomRows(s).every((room) => numericAtLeast(room.toilets, 1)),
  },
  {
    key: "room_beds",
    label: "Beds cover maximum occupancy",
    tier: "mandatory",
    section: "rooms",
    target: ['[data-field="bed_configuration"]'],
    hint: "Authored sleeping places must cover every guest in the unit's maximum occupancy.",
    isSatisfied: (s) => roomRows(s).length > 0 && roomRows(s).every((room) => {
      const maximum = Number(room.maxPeople ?? room.max_guests ?? 0);
      return maximum >= 1 && bedCapacity(room.bedConfiguration ?? room.bed_configuration) === maximum;
    }),
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
      // Truth lives in rolos_reservation_policies (a row flagged is_master) or an
      // explicit "no cancellation policy" decision. The amenities keys are legacy mirrors.
      (Array.isArray(s.policy_rows) &&
        (s.policy_rows as Array<{ is_master?: boolean }>).some((p) => p?.is_master)) ||
      s.cancellation_master_mode === "none" ||
      filled(amenity(s, "master_cancellation_policy_id")) ||
      filled(amenity(s, "cancellation_policy")),
  },
  {
    key: "check_times",
    label: "Check-in / check-out times",
    tier: "mandatory",
    section: "rates",
    target: [
      '[data-field="check_in_from"]',
      '[data-field="amenities.house_rules.check_in_from"]',
      "#check_in_from",
    ],
    hint: "Both times are mandatory for channel distribution (24h format, e.g. 14:00).",
    isSatisfied: (s) => filled(checkTime(s, "in")) && filled(checkTime(s, "out")),
  },
  {
    key: "arrival_instructions",
    label: "Arrival policy / how to arrive",
    tier: "mandatory",
    section: "rates",
    target: [
      '[data-field="arrival_instructions"]',
      '[data-field="amenities.house_rules.check_in_instructions"]',
      "#check_in_instructions",
    ],
    hint: "The channel requires arrival instructions (minimum 20 characters).",
    isSatisfied: (s) =>
      str(amenity(s, "house_rules.check_in_instructions")).length >= 20 ||
      str(amenity(s, "check_in_instructions")).length >= 20 ||
      str(amenity(s, "arrival_instructions")).length >= 20,
  },
  {
    key: "payment_methods",
    label: "Accepted payment methods",
    tier: "mandatory",
    section: "rates",
    target: ['[data-field="payment_methods"]', "#payment_methods"],
    hint: "At least one payment method must be captured for the listing.",
    isSatisfied: (s) => {
      const list = amenity(s, "payment_methods") ?? amenity(s, "banking.payment_methods");
      if (Array.isArray(list)) return list.length > 0;
      if (list && typeof list === "object") {
        return Object.values(list as Record<string, unknown>).some((v) => v === true || filled(v));
      }
      return filled(list) || s.payment_mode === "none";
    },
  },

  /* ---------- Company information (contract · distribution) ---------- */
  {
    key: "postal_code",
    label: "Postal / ZIP code",
    tier: "mandatory",
    section: "general",
    target: ["#postal_code", '[data-field="postal_code"]'],
    isSatisfied: (s) => filled(s.postal_code) || filled(amenity(s, "postal_code")),
  },
  {
    key: "ru_location_id",
    label: "Channel Manager location",
    tier: "mandatory",
    section: "general",
    target: ['[data-field="ru_location_id"]'],
    hint: "The location ID decides the listing location and the currency the property is locked into.",
    isSatisfied: (s) => Number(s.ru_location_id ?? 0) > 0,
  },
  {
    key: "rep_nationality",
    label: "Legal rep nationality",
    tier: "mandatory",
    section: "general",
    target: ['[data-field="rep_nationality"]'],
    isSatisfied: (s) =>
      Number(
        (amenity(s, "ru_company_profile.legal_rep.nationality_id") as number | undefined) ?? 0,
      ) > 0,
  },
  {
    key: "rep_country_of_residence",
    label: "Legal rep country of residence",
    tier: "mandatory",
    section: "general",
    target: ['[data-field="rep_country_of_residence"]'],
    isSatisfied: (s) =>
      Number(
        (amenity(s, "ru_company_profile.legal_rep.country_of_residence_id") as number | undefined) ??
          0,
      ) > 0,
  },



  /* ---------- Integrations / distribution ---------- */
  {
    key: "ru_currency",
    label: "Channel Manager currency",
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
  location: ["address", "city", "country", "geo", "postal_code"],
  contact: ["contact_email", "contact_phone", "emergency_contact"],
  rooms: ["rooms", "room_descriptions", "room_floors", "room_bathrooms", "room_toilets", "room_beds"],
  policies: ["master_policy", "payment_methods"],
  rentalsunited_geo: ["geo"],
  rentalsunited_location_currency: ["ru_currency"],
  // Channel gate check ids (see supabase/functions/_shared/ruReadiness.ts)
  name_clean: ["name"],
  description_meets_cert: ["description"],
  has_street: ["address"],
  has_zip_code: ["postal_code"],
  has_coordinates: ["geo"],
  has_detailed_location_id: ["ru_location_id", "city", "country"],
  check_in_from: ["check_times"],
  check_out_until: ["check_times"],
  arrival_instructions: ["arrival_instructions"],
  has_cancellation_policies: ["master_policy"],
  has_payment_methods: ["payment_methods"],
  has_legal_rep: ["rep_nationality", "rep_country_of_residence"],
  can_sleep_max_ok: ["room_beds"],
  has_floor: ["room_floors"],
  has_bathrooms: ["room_bathrooms"],
  has_toilets: ["room_toilets"],
  has_bedroom: ["room_beds"],
  has_bathroom_room: ["room_bathrooms"],
  beds_cover_half: ["room_beds"],
  beds_meet_max_guests: ["room_beds"],
  beds_distributed: ["room_beds"],
  unit_description: ["room_descriptions"],
  unit_name_clean: ["rooms"],
  images_meet_min_size: ["images"],
};

