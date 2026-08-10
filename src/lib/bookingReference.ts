/**
 * ROL booking reference — single source of truth for the client.
 *
 * Format: ROL-<ORIGIN>-<KIND>-<PROP>-<NNNNN>
 *   ORIGIN  where the booking came from (WEB, WL, EMB, JNY, PMS, RU, HG, …)
 *   KIND    B = booking made inside the ROL ecosystem, R = reservation/lead received from outside
 *   PROP    3-character property code (properties.ref_code)
 *   NNNNN   per-property running number
 *
 * The reference is minted by the database (trigger on bookings insert) — this module
 * only formats, parses, labels and searches. Keep the origin map in sync with
 * `supabase/functions/_shared/bookingReference.ts` and `public.rol_origin_code()`.
 */

export type RolOriginCode =
  | "WEB"
  | "WL"
  | "EMB"
  | "JNY"
  | "PMS"
  | "RU"
  | "HG"
  | "HF"
  | "BEN"
  | "NB"
  | "CB"
  | "CF"
  | "OTA";

export type RolReferenceKind = "B" | "R";

/** In-ecosystem origins produce a "B" (booking); everything else is an "R" (reservation). */
export const IN_ECOSYSTEM_ORIGINS: RolOriginCode[] = ["WEB", "WL", "EMB", "JNY", "PMS"];

export const ROL_ORIGIN_LABELS: Record<RolOriginCode, string> = {
  WEB: "ROL marketplace",
  WL: "White-label site",
  EMB: "Widget / WordPress embed",
  JNY: "Journey builder",
  PMS: "Front desk (manual)",
  RU: "Channel connection",
  HG: "Channel connection",
  HF: "Property management system",
  BEN: "Property management system",
  NB: "Property management system",
  CB: "Property management system",
  CF: "Property management system",
  OTA: "External channel",
};

export const ROL_KIND_LABELS: Record<RolReferenceKind, string> = {
  B: "Booking",
  R: "Reservation",
};

/** Origin codes offered as filters, in display order. */
export const ROL_ORIGIN_FILTER_OPTIONS: RolOriginCode[] = [
  "WEB",
  "WL",
  "EMB",
  "JNY",
  "PMS",
  "RU",
  "HG",
  "HF",
  "BEN",
  "NB",
  "CB",
  "CF",
  "OTA",
];

/** Mirror of `public.rol_origin_code()` — used for previews and client-side labelling. */
export function resolveOriginCode(
  integrationType?: string | null,
  bookingChannel?: string | null,
): RolOriginCode {
  const it = (integrationType || "").toLowerCase();
  const bc = (bookingChannel || "").toLowerCase();

  if (it.startsWith("rentalsunited") || bc.startsWith("rentals_united")) return "RU";
  if (it.startsWith("hyperguest")) return "HG";
  if (it.startsWith("hostfully")) return "HF";
  if (it.startsWith("benson") || it.startsWith("bed24") || it.startsWith("beds24")) return "BEN";
  if (it.startsWith("nightsbridge")) return "NB";
  if (it.startsWith("cloudbeds")) return "CB";
  if (it.startsWith("checkfront")) return "CF";
  if (it === "wordpress" || bc === "wordpress") return "EMB";
  if (it === "embed" || it === "widget" || bc === "embed" || bc === "widget") return "EMB";
  if (bc.includes("itinerary") || bc.includes("journey") || it.includes("journey")) return "JNY";
  if (it === "rol_marketplace" || bc === "marketplace") return "WEB";
  if (bc === "white_label" || bc === "whitelabel") return "WL";
  if (["manual", "front_desk", "walk_in", "phone", "email"].includes(bc)) return "PMS";
  if (["rolos", "none", ""].includes(it) || ["direct", "legacy_direct"].includes(bc)) return "WEB";
  return "OTA";
}

export function kindForOrigin(origin: RolOriginCode): RolReferenceKind {
  return IN_ECOSYSTEM_ORIGINS.includes(origin) ? "B" : "R";
}

/**
 * Origin code for a booking row: prefers the minted reference, then the stored
 * origin column, and finally derives it from the channel/integration fields so
 * legacy rows still filter correctly.
 */
export function bookingOriginCode(booking: {
  rol_reference?: string | null;
  rol_ref_origin?: string | null;
  integration_type?: string | null;
  booking_channel?: string | null;
}): RolOriginCode {
  const parsed = parseRolReference(booking.rol_reference);
  if (parsed) return parsed.origin;
  const stored = (booking.rol_ref_origin || "").toUpperCase();
  if (ROL_ORIGIN_FILTER_OPTIONS.includes(stored as RolOriginCode)) return stored as RolOriginCode;
  return resolveOriginCode(booking.integration_type, booking.booking_channel);
}


export interface ParsedRolReference {
  /** Origin is only present on legacy long-form references. */
  origin: RolOriginCode | null;
  /** Kind is only present on legacy long-form references. */
  kind: RolReferenceKind | null;
  propertyCode: string;
  sequence: number;
}

/** Current compact guest-facing form: ROL-JON-1042 */
const COMPACT_REFERENCE_RE = /^ROL-([A-Z0-9]{2,4})-(\d{3,})$/;
/** Legacy long form kept for lookups: ROL-EMB-B-TID-00005 */
const LEGACY_REFERENCE_RE = /^ROL-([A-Z]{2,4})-([BR])-([A-Z0-9]{2,4})-(\d{4,})$/;

/** Journey / itinerary form: ROL-TRIP-0014 */
const TRIP_REFERENCE_RE = /^ROL-TRIP-(\d{3,})$/;

/** Build a compact reference from a property code and running number. */
export function formatRolBookingReference(propertyCode: string | null | undefined, sequence: number): string {
  const code = (propertyCode || "PRP").toUpperCase();
  return `ROL-${code}-${String(sequence).padStart(4, "0")}`;
}

export function formatRolItineraryReference(sequence: number): string {
  return `ROL-TRIP-${String(sequence).padStart(4, "0")}`;
}

export function isItineraryReference(reference?: string | null): boolean {
  return !!reference && TRIP_REFERENCE_RE.test(reference.trim().toUpperCase());
}

export function parseRolReference(reference?: string | null): ParsedRolReference | null {
  if (!reference) return null;
  const value = reference.trim().toUpperCase();

  const compact = COMPACT_REFERENCE_RE.exec(value);
  if (compact) {
    return { origin: null, kind: null, propertyCode: compact[1], sequence: Number(compact[2]) };
  }

  const legacy = LEGACY_REFERENCE_RE.exec(value);
  if (legacy) {
    return {
      origin: legacy[1] as RolOriginCode,
      kind: legacy[2] as RolReferenceKind,
      propertyCode: legacy[3],
      sequence: Number(legacy[4]),
    };
  }
  return null;
}

/**
 * The reference to show a guest or an owner. Never exposes the internal record id —
 * falls back to the legacy ROL code, then the channel's own reference.
 */
export function displayBookingReference(booking: {
  rol_reference?: string | null;
  rol_reference_legacy?: string | null;
  external_reservation_id?: string | null;
  id?: string | null;
}): string {
  return (
    booking.rol_reference ||
    booking.rol_reference_legacy ||
    booking.external_reservation_id ||
    "—"
  );
}

/** Human sentence describing the reference, e.g. "Reservation · Channel connection". */
export function describeRolReference(
  reference?: string | null,
  fallback?: { rol_ref_origin?: string | null; rol_ref_kind?: string | null } | null,
): string | null {
  const parsed = parseRolReference(reference);
  const origin = (parsed?.origin || fallback?.rol_ref_origin?.toUpperCase() || null) as RolOriginCode | null;
  const kind = (parsed?.kind || fallback?.rol_ref_kind?.toUpperCase() || null) as RolReferenceKind | null;
  if (!origin && !kind) return null;
  const kindLabel = kind ? ROL_KIND_LABELS[kind] : "Booking";
  const originLabel = origin ? (ROL_ORIGIN_LABELS[origin] ?? origin) : null;
  return originLabel ? `${kindLabel} · ${originLabel}` : kindLabel;
}

/**
 * Partial-match search: `1042`, `jon-1042`, `ROL-JON-1042` and the legacy
 * `ROL-WL-B-FON-00087` all match. Ignores separators so users can type with or
 * without dashes. Accepts several candidate references (current, legacy, channel).
 */
export function matchesReferenceSearch(
  reference: string | null | undefined | Array<string | null | undefined>,
  term: string,
): boolean {
  const needle = term.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!needle) return false;
  const candidates = Array.isArray(reference) ? reference : [reference];
  return candidates.some((candidate) =>
    !!candidate && candidate.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(needle),
  );
}



/** Suggest a 3-character property code from a property name (mirror of the DB helper). */
export function suggestPropertyRefCode(name?: string | null): string {
  const base = (name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!base) return "PRP";
  return base.slice(0, 3).padEnd(3, "X");
}
