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
  { path: "owner_name", label: "owner name", section: "company" },
  { path: "owner_email", label: "owner email", section: "company" },

  // ── Listing content ──
  { path: "name", label: "property name", section: "content" },
  { path: "property_type", label: "property type", section: "content" },
  { path: "description", label: "description", section: "content" },
  { path: "short_description", label: "short description", section: "content" },
  { path: "images", label: "photos", section: "content" },
  { path: "hero_listing", label: "hero image", section: "content" },
  { path: "ru_image_tags", label: "photo tags", section: "content" },
  { path: "address", label: "street address", section: "content" },
  { path: "city", label: "town", section: "content" },
  { path: "country", label: "country", section: "content" },
  { path: "postal_code", label: "postal code", section: "content" },
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

  // ── Rates & availability ──
  { path: "amenities.seasons", label: "seasons", section: "rates" },
  { path: "amenities.season_rates", label: "season rates", section: "rates" },
  { path: "amenities.pms_rate_types", label: "rate types", section: "rates" },
  { path: "amenities.charges", label: "charges", section: "rates" },
  { path: "amenities.banking.security_deposit", label: "security deposit", section: "rates" },
  { path: "amenities.policies", label: "policies", section: "rates" },
  { path: "amenities.currency", label: "currency", section: "rates" },
  { path: "cancellation_master_mode", label: "cancellation policy", section: "rates" },
];

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
