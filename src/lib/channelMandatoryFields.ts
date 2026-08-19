/**
 * Channel-mandatory field registry.
 *
 * Rentals United (and every other channel that inherits the same content-quality rules)
 * rejects a listing when any of these fields is empty. The property editor marks them with
 * a filled border so an owner can see, before running the onboarding wizard, exactly which
 * inputs the channel will hard-block on.
 *
 * Keys are property-editor field names, so the registry stays readable next to the form.
 */

export interface ChannelMandatoryField {
  /** Property editor field name. */
  field: string;
  /** Readiness check this field feeds, for cross-referencing wizard blockers. */
  check: string;
  /** Plain-language reason shown in tooltips / legends. */
  reason: string;
}

export const CHANNEL_MANDATORY_FIELDS: ChannelMandatoryField[] = [
  { field: "name", check: "name_clean", reason: "Listing name — no emoji, special characters or ALL CAPS" },
  { field: "description", check: "description_meets_cert", reason: "Description of at least 700 characters" },
  { field: "address", check: "has_street", reason: "Street address is required by the channel" },
  { field: "city", check: "has_detailed_location_id", reason: "City resolves the channel location ID" },
  { field: "country", check: "has_detailed_location_id", reason: "Country resolves the channel location ID" },
  { field: "postal_code", check: "has_zip_code", reason: "Postal code is required by the channel" },
  { field: "latitude", check: "has_coordinates", reason: "Coordinates are required by the channel" },
  { field: "longitude", check: "has_coordinates", reason: "Coordinates are required by the channel" },
  { field: "check_in_from", check: "check_in_from", reason: "Check-in from time is required by the channel" },
  { field: "check_out_until", check: "check_out_until", reason: "Check-out until time is required by the channel" },
  { field: "max_guests", check: "can_sleep_max", reason: "CanSleepMax must be at least 1" },
  { field: "arrival_instructions", check: "arrival_instructions", reason: "Arrival instructions must be populated" },
  { field: "cancellation_policy", check: "has_cancellation_policies", reason: "At least one cancellation policy" },
  { field: "payment_methods", check: "has_payment_methods", reason: "At least one payment method" },
  { field: "ru_location_id", check: "ru_location_selected", reason: "Channel Manager location decides the listing location and currency — it must be picked explicitly, not guessed from coordinates" },
  { field: "rep_nationality", check: "has_legal_rep", reason: "Legal representative nationality is required by the channel" },
  { field: "rep_country_of_residence", check: "has_legal_rep", reason: "Legal representative country of residence is required by the channel" },
  { field: "rep_first_name", check: "has_legal_rep", reason: "Legal representative first name is required by the channel" },
  { field: "rep_last_name", check: "has_legal_rep", reason: "Legal representative last name is required by the channel" },
  { field: "rep_email", check: "has_legal_rep", reason: "Legal representative email is required by the channel" },
  { field: "room_name", check: "unit_name_clean", reason: "Unit name — no emoji, special characters or ALL CAPS" },
  { field: "room_description", check: "unit_description", reason: "Unit description of at least 700 characters" },
  { field: "floor", check: "has_floor", reason: "Floor is required for every unit" },
  { field: "room_size", check: "has_space", reason: "Size in m² is required — blank or zero makes the channel receive an invented 50 m²" },
  { field: "property_floor", check: "has_floor", reason: "Property floor — the channel fallback used when a unit has no floor of its own" },
  { field: "property_size_sqm", check: "has_space", reason: "Property size in m² — the channel Space fallback used when a unit has no size of its own" },
  { field: "bathrooms", check: "has_bathrooms", reason: "Every unit must have at least 1 bathroom" },
  { field: "toilets", check: "has_toilets", reason: "Every unit must have at least 1 toilet; blank and zero are rejected" },
  { field: "bed_configuration", check: "beds_meet_max_guests", reason: "Authored beds per bedroom — the channel needs at least one bedroom in the composition and enough beds to sleep the unit's full maximum occupancy" },
  { field: "room_images", check: "meets_minimum_images", reason: "Each listing needs at least 10 channel-ready photos" },
  { field: "hero_image", check: "has_main_image", reason: "One photo must be flagged as the main image — the channel rejects a listing without it" },

  { field: "room_amenities", check: "meets_minimum_amenities", reason: "Each listing needs at least 10 mapped amenities" },
  { field: "channel_property_type", check: "object_type_authored", reason: "Channel property type — an unmapped value publishes as an assumed Chalet" },
  { field: "changeover_rules", check: "changeover_authored", reason: "Changeover rule — without it the channel receives an assumed arrival/departure any day" },
];

const BY_FIELD = new Map(CHANNEL_MANDATORY_FIELDS.map((f) => [f.field, f]));

export function isChannelMandatory(field: string): boolean {
  return BY_FIELD.has(field);
}

export function channelMandatoryReason(field: string): string | null {
  return BY_FIELD.get(field)?.reason ?? null;
}

/**
 * Solid-border treatment for a channel-mandatory input. Returns an empty string for fields
 * the channel does not require, so it can be spread into any `cn()` call unconditionally.
 */
export function channelMandatoryClass(field: string): string {
  return isChannelMandatory(field) ? "channel-required" : "";
}

/**
 * Props for a channel-mandatory control: the solid border plus the satisfied flag that
 * softens it once a value is captured, so an owner can tell "still outstanding" from "done".
 */
export function channelMandatoryProps(
  field: string,
  satisfied: boolean,
): { className: string; "data-channel-satisfied": "1" | "0" } | Record<string, never> {
  if (!isChannelMandatory(field)) return {};
  return { className: "channel-required", "data-channel-satisfied": satisfied ? "1" : "0" };
}

/** Legend copy for tabs that carry channel-mandatory inputs. */
export const CHANNEL_MANDATORY_LEGEND =
  "Fields with a solid pink border are mandatory for the Channel Manager — the onboarding wizard blocks the first push until they are complete. The border fades once the value is captured.";

