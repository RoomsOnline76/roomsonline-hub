/**
 * Channel field constraint rules (client mirror).
 *
 * The Channel Manager enforces hard constraints on a handful of listing fields
 * (name hygiene, description length, address completeness, coordinates, stay
 * times). Those rules live server-side in `_shared/ruContentQuality.ts` and
 * `_shared/ruReadiness.ts`; this module mirrors them so the property editor can
 * warn an owner *while typing*, instead of only after the onboarding wizard runs.
 *
 * Vendor naming stays out of this surface (see src/lib/channelVocabulary.ts).
 */

/** Minimum description length the channel content review requires. */
export const CHANNEL_MIN_DESCRIPTION = 700;
/** ROL'OS authoring target (comfortably above the channel minimum). */
export const CHANNEL_TARGET_DESCRIPTION = 800;
/** Minimum useful arrival-instruction length. */
export const CHANNEL_MIN_ARRIVAL_INSTRUCTIONS = 20;
/** Certification image dimensions. */
export const CHANNEL_MIN_IMAGE_WIDTH = 1024;
export const CHANNEL_MIN_IMAGE_HEIGHT = 768;

// Kept in sync with supabase/functions/_shared/ruContentQuality.ts
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2900}-\u{297F}]/u;
const SPECIAL_RE = /[<>{}\[\]|\\^~`*_=+#@$%;:"?!]/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const URL_RE = /(https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b)/i;

export type ChannelFieldStatus = "ok" | "warn" | "error" | "empty";

export interface ChannelFieldFeedback {
  status: ChannelFieldStatus;
  /** One-line requirement copy, always shown under the input. */
  requirement: string;
  /** What is currently wrong (only when status is warn/error). */
  issue?: string;
}

const ok = (requirement: string): ChannelFieldFeedback => ({ status: "ok", requirement });
const empty = (requirement: string): ChannelFieldFeedback => ({ status: "empty", requirement });
const bad = (requirement: string, issue: string, status: ChannelFieldStatus = "error"): ChannelFieldFeedback => ({
  status,
  requirement,
  issue,
});

/** Listing name: 3+ chars, no emoji, no rejected specials, not ALL CAPS. */
export function checkChannelName(value: string | null | undefined): ChannelFieldFeedback {
  const requirement = "Plain text, 3+ characters. No emoji, no special characters (< > [ ] | * # @ ! ?), not ALL CAPS.";
  const raw = String(value ?? "").trim();
  if (!raw) return empty(requirement);

  const issues: string[] = [];
  if (raw.length < 3) issues.push("at least 3 characters are required");
  if (EMOJI_RE.test(raw)) issues.push("remove emoji");
  if (SPECIAL_RE.test(raw)) issues.push("remove special characters");
  const letters = raw.replace(/[^A-Za-z\u00C0-\u024F]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) issues.push("use title case instead of ALL CAPS");

  return issues.length ? bad(requirement, `Channel will reject this name — ${issues.join(", ")}.`) : ok(requirement);
}

/** Description: 700 char channel gate, 800 ROL'OS target, no contact details or URLs. */
export function checkChannelDescription(value: string | null | undefined): ChannelFieldFeedback {
  const requirement = `At least ${CHANNEL_MIN_DESCRIPTION} characters of original prose (${CHANNEL_TARGET_DESCRIPTION}+ recommended). No URLs, email addresses or phone numbers.`;
  const raw = String(value ?? "").trim();
  if (!raw) return empty(requirement);

  if (raw.length < CHANNEL_MIN_DESCRIPTION) {
    return bad(requirement, `${raw.length} / ${CHANNEL_MIN_DESCRIPTION} characters — the channel blocks the listing below ${CHANNEL_MIN_DESCRIPTION}.`);
  }
  if (URL_RE.test(raw)) {
    return bad(requirement, "Remove links, email addresses or contact details — the channel strips or rejects them.", "warn");
  }
  if (raw.length < CHANNEL_TARGET_DESCRIPTION) {
    return bad(requirement, `${raw.length} characters — passes the channel gate, ${CHANNEL_TARGET_DESCRIPTION}+ reads better on listings.`, "warn");
  }
  return ok(requirement);
}

/** Street address: needs a street name, and a number to be considered complete. */
export function checkChannelStreet(value: string | null | undefined): ChannelFieldFeedback {
  const requirement = "Street name and number. A farm, suburb or complex name on its own is rejected.";
  const raw = String(value ?? "").trim();
  if (!raw) return empty(requirement);
  if (raw.length < 5) return bad(requirement, "Too short to be a full street address.");
  if (!/\d/.test(raw)) return bad(requirement, "No street number found — add it, or use “No street address?” for a rural address.", "warn");
  return ok(requirement);
}

/** City / country: needed to resolve the channel location. */
export function checkChannelPlace(value: string | null | undefined, label: string): ChannelFieldFeedback {
  const requirement = `${label} resolves the channel location ID — it must match the official ${label.toLowerCase()} name.`;
  const raw = String(value ?? "").trim();
  if (!raw) return empty(requirement);
  if (raw.length < 2) return bad(requirement, `Enter the full ${label.toLowerCase()} name.`);
  return ok(requirement);
}

/** Postal code: 3–10 alphanumeric characters. */
export function checkChannelPostalCode(value: string | null | undefined): ChannelFieldFeedback {
  const requirement = "3–10 characters, letters and digits only. Required by the channel.";
  const raw = String(value ?? "").trim();
  if (!raw) return empty(requirement);
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(raw)) return bad(requirement, "Use 3–10 letters/digits (spaces and hyphens allowed).");
  if (raw.replace(/[^A-Za-z0-9]/g, "").length < 3) return bad(requirement, "At least 3 letters/digits are required.");
  return ok(requirement);
}

/** Coordinates: valid range and not the null island. */
export function checkChannelCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): ChannelFieldFeedback {
  const requirement = "Decimal degrees — latitude −90 to 90, longitude −180 to 180. Place the pin on the property entrance.";
  if (latitude == null || longitude == null || Number.isNaN(latitude) || Number.isNaN(longitude)) return empty(requirement);
  if (Math.abs(latitude) > 90) return bad(requirement, "Latitude must be between −90 and 90.");
  if (Math.abs(longitude) > 180) return bad(requirement, "Longitude must be between −180 and 180.");
  if (Math.abs(latitude) < 0.5 && Math.abs(longitude) < 0.5) return bad(requirement, "These coordinates point at the ocean off Africa — re-place the pin.");
  return ok(requirement);
}

/** Stay times: 24-hour HH:MM, both required by the channel. */
export function checkChannelTime(value: string | null | undefined, label: string): ChannelFieldFeedback {
  const requirement = `${label} in 24-hour HH:MM format — required by the channel.`;
  const raw = String(value ?? "").trim();
  if (!raw) return empty(requirement);
  if (!TIME_RE.test(raw)) return bad(requirement, "Use a 24-hour time such as 14:00.");
  return ok(requirement);
}

/** Arrival instructions: how the guest gets in. */
export function checkChannelArrivalInstructions(value: string | null | undefined): ChannelFieldFeedback {
  const requirement = `At least ${CHANNEL_MIN_ARRIVAL_INSTRUCTIONS} characters covering reception hours, key collection, gate/access codes and late arrivals.`;
  const raw = String(value ?? "").trim();
  if (!raw) return empty(requirement);
  if (raw.length < CHANNEL_MIN_ARRIVAL_INSTRUCTIONS)
    return bad(requirement, `${raw.length} / ${CHANNEL_MIN_ARRIVAL_INSTRUCTIONS} characters — add the access detail a guest needs.`);
  return ok(requirement);
}

/** Max guests / sleeping capacity. */
export function checkChannelMaxGuests(value: number | string | null | undefined): ChannelFieldFeedback {
  const requirement = "At least 1 guest, and it must match the beds captured on the rooms/units.";
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || n === 0 || Number.isNaN(n as number)) return empty(requirement);
  if ((n as number) < 1) return bad(requirement, "Sleeping capacity must be at least 1.");
  if ((n as number) > 100) return bad(requirement, "Above 100 guests the channel expects a multi-unit listing instead.", "warn");
  return ok(requirement);
}
