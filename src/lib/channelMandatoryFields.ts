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
];

const BY_FIELD = new Map(CHANNEL_MANDATORY_FIELDS.map((f) => [f.field, f]));

export function isChannelMandatory(field: string): boolean {
  return BY_FIELD.has(field);
}

export function channelMandatoryReason(field: string): string | null {
  return BY_FIELD.get(field)?.reason ?? null;
}

/**
 * Filled-border treatment for a channel-mandatory input. Returns an empty string for fields
 * the channel does not require, so it can be spread into any `cn()` call unconditionally.
 */
export function channelMandatoryClass(field: string): string {
  return isChannelMandatory(field) ? "channel-required" : "";
}

/** Legend copy for tabs that carry channel-mandatory inputs. */
export const CHANNEL_MANDATORY_LEGEND =
  "Fields with a filled border are mandatory for the Channel Manager — the onboarding wizard blocks the first push until they are complete.";
