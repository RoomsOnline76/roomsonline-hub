/**
 * Which mandatory channel fields did this property save change?
 *
 * `PropertyForm` writes one big `properties` row (plus nested `amenities`), so the only
 * honest way to know what the channel owes is to diff the submitted payload against the
 * row that was loaded. The labels here are operator language — they end up in the
 * "sent to the Channel Manager" toast, so they must read as field names, not columns.
 */

export type ChannelPushSection = "company" | "content" | "rates";

export interface ChangedChannelField {
  /** Dot path into the property payload (supports `amenities.*`). */
  path: string;
  /** Human-readable field name for toasts. */
  label: string;
  section: ChannelPushSection;
}

interface FieldSpec {
  path: string;
  label: string;
  section: ChannelPushSection;
}

const FIELD_SPECS: readonly FieldSpec[] = [
  // ── Company / distribution account profile ──
  { path: "amenities.registered_business_name", label: "business name", section: "company" },
  { path: "amenities.registration_number", label: "registration number", section: "company" },
  { path: "amenities.vat_number", label: "VAT number", section: "company" },
  { path: "amenities.key_representative", label: "primary contact", section: "company" },
  { path: "amenities.contact.owner", label: "contact person", section: "company" },
  { path: "amenities.contact.email", label: "contact email", section: "company" },
  { path: "amenities.contact.telephone", label: "telephone", section: "company" },
  { path: "amenities.telephone", label: "telephone", section: "company" },
  { path: "amenities.mobile_number", label: "mobile number", section: "company" },
  { path: "amenities.postal_address", label: "postal address", section: "company" },
  { path: "amenities.ru_company_profile", label: "distribution company profile", section: "company" },
  // The representative's nationality and country of residence are mandatory channel
  // locations; name them explicitly so the toast says what moved.
  {
    path: "amenities.ru_company_profile.legal_rep.nationality_id",
    label: "representative nationality",
    section: "company",
  },
  {
    path: "amenities.ru_company_profile.legal_rep.country_of_residence_id",
    label: "representative country of residence",
    section: "company",
  },
  { path: "owner_name", label: "owner name", section: "company" },
  { path: "owner_email", label: "owner email", section: "company" },

  // ── Listing content ──
  { path: "name", label: "property name", section: "content" },
  { path: "property_type", label: "property type", section: "content" },
  { path: "description", label: "description", section: "content" },
  { path: "short_description", label: "short description", section: "content" },
  { path: "images", label: "property photos", section: "content" },
  { path: "main_image", label: "main photo", section: "content" },
  { path: "hero_listing", label: "hero image", section: "content" },
  { path: "ru_image_tags", label: "photo tags", section: "content" },
  { path: "address", label: "street address", section: "content" },
  { path: "city", label: "town", section: "content" },
  { path: "country", label: "country", section: "content" },
  { path: "postal_code", label: "postal code", section: "content" },
  { path: "ru_location_id", label: "Channel Manager location", section: "content" },
  { path: "latitude", label: "map position", section: "content" },
  { path: "longitude", label: "map position", section: "content" },
  { path: "max_guests", label: "maximum guests", section: "content" },
  { path: "bedrooms", label: "bedrooms", section: "content" },
  { path: "bathrooms", label: "bathrooms", section: "content" },
  { path: "amenities.address_details", label: "address details", section: "content" },
  { path: "amenities.attraction_distances", label: "attraction distances", section: "content" },
  { path: "amenities.facilities", label: "amenities", section: "content" },
  { path: "amenities.breakfast_options", label: "breakfast options", section: "content" },
  { path: "amenities.house_rules", label: "house rules", section: "content" },
  { path: "amenities.room_types", label: "units", section: "content" },
  // Mandatory composition / space values the channel review checks. Without these the
  // save-time diff said "nothing changed" while the wizard still failed on them.
  { path: "toilets", label: "toilets", section: "content" },
  { path: "separate_kitchen", label: "kitchen", section: "content" },
  { path: "amenities.property_floor", label: "floor", section: "content" },
  { path: "amenities.property_size_sqm", label: "property size", section: "content" },

  // ── Rates & availability ──
  { path: "amenities.seasons", label: "seasons", section: "rates" },
  { path: "amenities.season_rates", label: "season rates", section: "rates" },
  { path: "amenities.pms_rate_types", label: "rate types", section: "rates" },
  { path: "amenities.charges", label: "charges", section: "rates" },
  { path: "amenities.banking.security_deposit", label: "security deposit", section: "rates" },
  { path: "amenities.policies", label: "policies", section: "rates" },
  { path: "amenities.currency", label: "currency", section: "rates" },
  { path: "cancellation_master_mode", label: "cancellation policy", section: "rates" },
  { path: "amenities.cancellation_policies", label: "cancellation policy", section: "rates" },
  { path: "amenities.payment_methods", label: "payment methods", section: "rates" },
  // Changeover decides which days guests may arrive or depart; it ships with availability.
  { path: "amenities.changeover", label: "changeover rule", section: "rates" },
  { path: "amenities.changeover_rules", label: "changeover rule", section: "rates" },
  { path: "amenities.changeover_by_unit", label: "changeover rule", section: "rates" },
];

/**
 * Mandatory readiness check (`_shared/ruReadiness` keys) → the payload path(s) whose change
 * must be reported at save time. This is the single audit table: a mandatory check with no
 * path here would be a requirement the operator can edit without the channel hearing about it.
 */
export const MANDATORY_CHECK_PATHS: Readonly<Record<string, readonly string[]>> = {
  has_name: ["name"],
  name_clean: ["name"],
  has_object_type_id: ["property_type", "amenities.room_types"],
  object_type_authored: ["property_type", "amenities.room_types"],
  currency_authored: ["amenities.currency"],
  can_sleep_max_ok: ["max_guests", "amenities.room_types"],
  has_description: ["description"],
  description_meets_cert: ["description"],
  has_check_in_from: ["amenities.house_rules"],
  has_check_out_until: ["amenities.house_rules"],
  has_arrival_instructions: ["amenities.house_rules", "amenities.policies"],
  has_space: ["amenities.property_size_sqm", "amenities.room_types"],
  has_floor: ["amenities.property_floor", "amenities.room_types"],
  meets_minimum_amenities: ["amenities.facilities"],
  has_rooms: ["bedrooms", "amenities.room_types"],
  rooms_have_amenities: ["amenities.room_types"],
  beds_cover_half: ["amenities.room_types"],
  beds_meet_max_guests: ["amenities.room_types", "max_guests"],
  has_bedroom: ["bedrooms", "amenities.room_types"],
  has_kitchen: ["separate_kitchen", "amenities.facilities"],
  has_bathroom_room: ["bathrooms", "amenities.room_types"],
  has_bathrooms: ["bathrooms"],
  has_toilets: ["toilets"],
  beds_distributed: ["amenities.room_types"],
  beds_authored: ["amenities.room_types"],
  changeover_authored: ["amenities.changeover", "amenities.changeover_by_unit"],
  meets_minimum_images: ["images"],
  images_meet_size: ["images"],
  images_meet_cert_size: ["images"],
  has_main_image: ["images", "hero_listing"],
  has_street: ["address"],
  has_zip_code: ["postal_code"],
  has_detailed_location_id: ["ru_location_id", "latitude", "longitude"],
  ru_location_selected: ["ru_location_id"],
  has_coordinates: ["latitude", "longitude"],
  has_payment_methods: ["amenities.payment_methods"],
  payment_methods_authored: ["amenities.payment_methods"],
  has_cancellation_policies: ["amenities.cancellation_policies", "cancellation_master_mode"],
  cancellation_policies_authored: ["amenities.cancellation_policies", "cancellation_master_mode"],
};

/** Every path the changed-field diff watches — used by the coverage test. */
/**
 * The Charges tab writes to its own table (`property_charges`), not the property payload, so
 * it cannot be diffed here. It reports its own change with this field: the deposit and
 * cleaning amounts travel inside the pushed listing content.
 */
export const CHARGES_CHANGE_FIELD: ChangedChannelField = {
  path: "property_charges",
  label: "charges (deposit / cleaning)",
  section: "content",
};

export const TRACKED_PATHS: readonly string[] = FIELD_SPECS.map((spec) => spec.path);


function readPath(source: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!source) return undefined;
  let cursor: unknown = source;
  for (const key of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  if (empty(a) && empty(b)) return true;
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
}

/**
 * Photo lists per unit, keyed by the unit's stable id (falling back to its name).
 *
 * Unit photos live inside the `amenities.room_types` array, which `readPath` cannot walk.
 * Diffing them explicitly means "images added/removed on a unit" is reported — and pushed —
 * as photos rather than hiding inside the coarse "units" change.
 */
function unitPhotoMap(source: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const rooms = readPath(source, "amenities.room_types");
  if (!Array.isArray(rooms)) return {};
  const out: Record<string, unknown> = {};
  rooms.forEach((room, index) => {
    if (!room || typeof room !== "object") return;
    const r = room as Record<string, unknown>;
    const key = String(r.id ?? r.name ?? index);
    out[key] = {
      images: Array.isArray(r.images) ? r.images : [],
      tags: r.ruImageTags ?? r.ru_image_tags ?? null,
    };
  });
  return out;
}

/**
 * Fields the channel cares about that actually changed in this save.
 * A path missing from the submitted payload is never reported — the form simply did
 * not author it this time.
 */
export function deriveChangedChannelFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): ChangedChannelField[] {
  if (!before || !after) return [];
  const seen = new Set<string>();
  const changed: ChangedChannelField[] = [];
  for (const spec of FIELD_SPECS) {
    const nextValue = readPath(after, spec.path);
    if (nextValue === undefined) continue;
    if (sameValue(readPath(before, spec.path), nextValue)) continue;
    const dedupeKey = `${spec.section}:${spec.label}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    changed.push({ path: spec.path, label: spec.label, section: spec.section });
  }
  // Photos added to or removed from a unit/room.
  const nextUnitPhotos = unitPhotoMap(after);
  if (Object.keys(nextUnitPhotos).length > 0 && !sameValue(unitPhotoMap(before), nextUnitPhotos)) {
    const dedupeKey = "content:unit photos";
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      changed.push({ path: "amenities.room_types", label: "unit photos", section: "content" });
    }
  }
  return changed;
}


/** "business name, primary contact and telephone" */
export function joinFieldLabels(fields: ChangedChannelField[]): string {
  const labels = Array.from(new Set(fields.map((f) => f.label)));
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export function sectionsOf(fields: ChangedChannelField[]): ChannelPushSection[] {
  const order: ChannelPushSection[] = ["company", "content", "rates"];
  return order.filter((section) => fields.some((f) => f.section === section));
}
