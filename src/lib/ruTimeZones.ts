/**
 * Rentals United company push — time zone vocabulary.
 *
 * RU's `CompanyInfo/TimeZone` node requires a fixed UTC offset in the exact
 * `UTC+HH:MM` / `UTC-HH:MM` format. IANA names are retained only as legacy
 * aliases so previously saved records can be corrected without manual edits.
 * This module is the single source of truth for the values offered in the UI and
 * for normalising anything already captured in the old free-text field.
 */

export interface RuTimeZoneOption {
  /** Exact offset string sent to RU. */
  value: string;
  /** UTC offset label shown to the operator (standard time). */
  offset: string;
  /** Human label, e.g. "Johannesburg · South Africa". */
  label: string;
  /** Grouping used in the dropdown. */
  group: string;
}

export const RU_TIME_ZONES: RuTimeZoneOption[] = [
  { value: "UTC+02:00", offset: "UTC+02:00", label: "South Africa · SAST", group: "Recommended" },
  { value: "UTC+00:00", offset: "UTC+00:00", label: "United Kingdom · GMT", group: "Common" },
  { value: "UTC+01:00", offset: "UTC+01:00", label: "Central Europe · CET", group: "Common" },
  { value: "UTC+03:00", offset: "UTC+03:00", label: "East Africa", group: "Common" },
  { value: "UTC+04:00", offset: "UTC+04:00", label: "Mauritius / UAE", group: "Common" },
  { value: "UTC+05:30", offset: "UTC+05:30", label: "India", group: "Common" },
  { value: "UTC+08:00", offset: "UTC+08:00", label: "Singapore / Western Australia", group: "Common" },
  { value: "UTC+10:00", offset: "UTC+10:00", label: "Eastern Australia", group: "Common" },
  { value: "UTC+12:00", offset: "UTC+12:00", label: "New Zealand standard time", group: "Common" },
  { value: "UTC-03:00", offset: "UTC-03:00", label: "Brazil / Argentina", group: "Common" },
  { value: "UTC-05:00", offset: "UTC-05:00", label: "USA Eastern standard time", group: "Common" },
  { value: "UTC-06:00", offset: "UTC-06:00", label: "USA Central standard time", group: "Common" },
  { value: "UTC-07:00", offset: "UTC-07:00", label: "USA Mountain standard time", group: "Common" },
  { value: "UTC-08:00", offset: "UTC-08:00", label: "USA Pacific standard time", group: "Common" },
];

export const RU_TIME_ZONE_GROUPS: string[] = Array.from(
  new Set(RU_TIME_ZONES.map((z) => z.group)),
);

/** Label used in dropdowns and read-only summaries. */
export function ruTimeZoneLabel(value: string): string {
  const hit = RU_TIME_ZONES.find((z) => z.value === value);
  return hit ? `(${hit.offset}) ${hit.label}` : value;
}

/** Legacy IANA zones mapped to the fixed RU offset format. */
const OFFSET_FALLBACK: Record<string, string> = {
  "Africa/Johannesburg": "UTC+02:00", "Africa/Windhoek": "UTC+02:00",
  "Africa/Maputo": "UTC+02:00", "Africa/Nairobi": "UTC+03:00",
  "Africa/Lagos": "UTC+01:00", "Europe/London": "UTC+00:00",
  "Europe/Amsterdam": "UTC+01:00", "Europe/Berlin": "UTC+01:00",
  "Asia/Dubai": "UTC+04:00", "Asia/Kolkata": "UTC+05:30",
  "Asia/Bangkok": "UTC+07:00", "Asia/Singapore": "UTC+08:00",
  "Asia/Tokyo": "UTC+09:00", "Australia/Sydney": "UTC+10:00",
  "Pacific/Auckland": "UTC+12:00", "America/Sao_Paulo": "UTC-03:00",
  "America/New_York": "UTC-05:00", "America/Chicago": "UTC-06:00",
  "America/Denver": "UTC-07:00", "America/Los_Angeles": "UTC-08:00",
};

/**
 * Normalise any historically captured value (IANA, "GMT +2", "SAST") to RU's
 * exact fixed-offset format. Returns an empty
 * string when nothing usable can be derived.
 */
export function normalizeRuTimeZone(raw?: string | null): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^UTC[+-](?:0\d|1[0-4]):[0-5]\d$/i.test(value)) return value.toUpperCase();
  if (OFFSET_FALLBACK[value]) return OFFSET_FALLBACK[value];
  if (/^(sast|south africa standard time|cat|central africa(n)? time)$/i.test(value)) return "UTC+02:00";
  if (/^(eat|east africa(n)? time)$/i.test(value)) return "UTC+03:00";
  if (/^(gmt|utc|z)$/i.test(value)) return "UTC+00:00";
  const offset = value.match(/([+-])\s*(\d{1,2})(?::?(\d{2}))?/);
  if (offset) {
    const sign = offset[1];
    const hh = String(Number(offset[2])).padStart(2, "0");
    const mm = offset[3] ?? "00";
    const hours = Number(hh);
    const minutes = Number(mm);
    if (hours > 14 || minutes > 59) return "";
    return `UTC${sign}${hh}:${mm}`;
  }
  return "";
}
