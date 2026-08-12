/**
 * Channel Manager property types (ObjectTypeID).
 *
 * These are the ONLY values the channel can map. Anything else used to publish
 * silently as "Chalet", so the readiness gate now blocks an unmapped value —
 * which means the editor must offer a closed list instead of free text.
 *
 * Keys mirror `PROPERTY_TYPE_MAP` in `supabase/functions/push-property-to-ru/index.ts`.
 */
export interface ChannelPropertyTypeOption {
  /** Stored value (also what the push normalises and maps). */
  value: string;
  label: string;
}

export const CHANNEL_PROPERTY_TYPES: ChannelPropertyTypeOption[] = [
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "villa", label: "Villa" },
  { value: "cottage", label: "Cottage" },
  { value: "cabin", label: "Cabin" },
  { value: "chalet", label: "Chalet" },
  { value: "bungalow", label: "Bungalow" },
  { value: "townhouse", label: "Townhouse" },
  { value: "studio", label: "Studio" },
  { value: "loft", label: "Loft" },
  { value: "hotel", label: "Hotel" },
  { value: "boutique_hotel", label: "Boutique hotel" },
  { value: "guest_house", label: "Guest house" },
  { value: "bed_and_breakfast", label: "Bed & breakfast" },
  { value: "lodge", label: "Lodge" },
  { value: "resort", label: "Resort" },
  { value: "self_catering", label: "Self-catering unit" },
  { value: "farm_stay", label: "Farm stay" },
];

/** Built-in fallback list used until the live channel dictionary has been pulled. */
export const FALLBACK_CHANNEL_PROPERTY_TYPES = CHANNEL_PROPERTY_TYPES;

/** Extra aliases the push also maps, accepted on load but not offered as new choices. */
const CHANNEL_TYPE_ALIASES = new Set(["guesthouse", "bnb"]);

/** Normalise a stored/typed value to the push's lookup key. */
export function normalizeChannelPropertyType(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Does this value map to a channel property type (i.e. will the push not guess)? */
export function isMappedChannelPropertyType(value: unknown): boolean {
  const key = normalizeChannelPropertyType(value);
  if (!key) return false;
  return CHANNEL_PROPERTY_TYPES.some((o) => o.value === key) || CHANNEL_TYPE_ALIASES.has(key);
}

/** Label for a stored value, falling back to the raw value. */
export function channelPropertyTypeLabel(value: unknown): string {
  const key = normalizeChannelPropertyType(value);
  return CHANNEL_PROPERTY_TYPES.find((o) => o.value === key)?.label ?? String(value ?? "");
}

/**
 * Channel changeover codes: which days a stay may start / end.
 * 0 = no arrival or departure, 1 = arrival only, 2 = departure only, 3 = both.
 */
export const CHANGEOVER_CODES = [
  { value: 3, label: "Arrival and departure allowed" },
  { value: 1, label: "Arrival only" },
  { value: 2, label: "Departure only" },
  { value: 0, label: "No arrival or departure" },
] as const;

export const CHANGEOVER_DOW_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type ChangeoverDowKey = (typeof CHANGEOVER_DOW_KEYS)[number];

export const CHANGEOVER_DOW_LABELS: Record<ChangeoverDowKey, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

export function changeoverCodeLabel(code: unknown): string {
  const found = CHANGEOVER_CODES.find((c) => c.value === Number(code));
  return found?.label ?? "Not set";
}

/** Is a changeover rule authored (master code or any per-day rule)? Mirrors the gate. */
export function isChangeoverAuthored(
  changeover: unknown,
  changeoverRules: unknown,
): boolean {
  if (changeover != null && changeover !== "" && !Number.isNaN(Number(changeover))) return true;
  if (changeoverRules && typeof changeoverRules === "object" && !Array.isArray(changeoverRules)) {
    const rules = changeoverRules as Record<string, unknown>;
    return CHANGEOVER_DOW_KEYS.some(
      (k) => rules[k] != null && rules[k] !== "" && !Number.isNaN(Number(rules[k])),
    );
  }
  return false;
}

/**
 * Resolve the channel type actually published for a unit.
 *
 * The property type authored in Identity & Location is the master: a unit with no
 * explicit type of its own inherits it (this mirrors the push, which resolves
 * `unit.property_type || property.property_type`).
 *
 * `isMapped` may be swapped for the live-dictionary check so a type RU added after
 * this build still counts as explicit.
 */
export function resolveUnitChannelType(
  unitValue: unknown,
  propertyValue: unknown,
  isMapped: (value: unknown) => boolean = isMappedChannelPropertyType,
): { value: string; inherited: boolean; isMapped: boolean } {
  const unit = normalizeChannelPropertyType(unitValue);
  if (unit && isMapped(unit)) return { value: unit, inherited: false, isMapped: true };
  const master = normalizeChannelPropertyType(propertyValue);
  return { value: master, inherited: true, isMapped: !!master && isMapped(master) };
}
