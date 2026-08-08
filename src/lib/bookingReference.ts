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

export interface ParsedRolReference {
  origin: RolOriginCode;
  kind: RolReferenceKind;
  propertyCode: string;
  sequence: number;
}

const REFERENCE_RE = /^ROL-([A-Z]{2,4})-([BR])-([A-Z0-9]{2,4})-(\d{4,})$/;

export function parseRolReference(reference?: string | null): ParsedRolReference | null {
  if (!reference) return null;
  const match = REFERENCE_RE.exec(reference.trim().toUpperCase());
  if (!match) return null;
  return {
    origin: match[1] as RolOriginCode,
    kind: match[2] as RolReferenceKind,
    propertyCode: match[3],
    sequence: Number(match[4]),
  };
}

/**
 * The reference to show a guest or an owner. Falls back to the channel reference and
 * finally to a short form of the internal id for legacy rows.
 */
export function displayBookingReference(booking: {
  rol_reference?: string | null;
  external_reservation_id?: string | null;
  id?: string | null;
}): string {
  return (
    booking.rol_reference ||
    booking.external_reservation_id ||
    (booking.id ? booking.id.slice(0, 8).toUpperCase() : "—")
  );
}

/** Human sentence describing the reference, e.g. "Reservation · Channel connection". */
export function describeRolReference(reference?: string | null): string | null {
  const parsed = parseRolReference(reference);
  if (!parsed) return null;
  return `${ROL_KIND_LABELS[parsed.kind]} · ${ROL_ORIGIN_LABELS[parsed.origin] ?? parsed.origin}`;
}

/**
 * Partial-match search: `00142`, `jon-003`, `rol-wl` and `ROL-WL-B-FON-00087` all match.
 * Ignores separators so users can type with or without dashes.
 */
export function matchesReferenceSearch(reference: string | null | undefined, term: string): boolean {
  if (!reference) return false;
  const needle = term.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!needle) return false;
  return reference.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(needle);
}

/** Suggest a 3-character property code from a property name (mirror of the DB helper). */
export function suggestPropertyRefCode(name?: string | null): string {
  const base = (name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!base) return "PRP";
  return base.slice(0, 3).padEnd(3, "X");
}
