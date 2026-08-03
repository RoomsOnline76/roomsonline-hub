/**
 * Rentals United company push — time zone vocabulary.
 *
 * RU's `CompanyInfo/TimeZone` node rejects free text such as "UTC+02:00" or
 * "SAST": it expects a canonical IANA zone identifier ("Africa/Johannesburg").
 * This module is the single source of truth for the values offered in the UI and
 * for normalising anything already captured in the old free-text field.
 */

export interface RuTimeZoneOption {
  /** Canonical IANA identifier sent to RU. */
  value: string;
  /** UTC offset label shown to the operator (standard time). */
  offset: string;
  /** Human label, e.g. "Johannesburg · South Africa". */
  label: string;
  /** Grouping used in the dropdown. */
  group: string;
}

export const RU_TIME_ZONES: RuTimeZoneOption[] = [
  // Africa (primary market first)
  { value: "Africa/Johannesburg", offset: "UTC+02:00", label: "Johannesburg · South Africa", group: "Africa" },
  { value: "Africa/Windhoek", offset: "UTC+02:00", label: "Windhoek · Namibia", group: "Africa" },
  { value: "Africa/Gaborone", offset: "UTC+02:00", label: "Gaborone · Botswana", group: "Africa" },
  { value: "Africa/Harare", offset: "UTC+02:00", label: "Harare · Zimbabwe", group: "Africa" },
  { value: "Africa/Maputo", offset: "UTC+02:00", label: "Maputo · Mozambique", group: "Africa" },
  { value: "Africa/Lusaka", offset: "UTC+02:00", label: "Lusaka · Zambia", group: "Africa" },
  { value: "Africa/Maseru", offset: "UTC+02:00", label: "Maseru · Lesotho", group: "Africa" },
  { value: "Africa/Mbabane", offset: "UTC+02:00", label: "Mbabane · Eswatini", group: "Africa" },
  { value: "Africa/Nairobi", offset: "UTC+03:00", label: "Nairobi · Kenya", group: "Africa" },
  { value: "Africa/Dar_es_Salaam", offset: "UTC+03:00", label: "Dar es Salaam · Tanzania", group: "Africa" },
  { value: "Africa/Kampala", offset: "UTC+03:00", label: "Kampala · Uganda", group: "Africa" },
  { value: "Africa/Cairo", offset: "UTC+02:00", label: "Cairo · Egypt", group: "Africa" },
  { value: "Africa/Lagos", offset: "UTC+01:00", label: "Lagos · Nigeria", group: "Africa" },
  { value: "Africa/Casablanca", offset: "UTC+01:00", label: "Casablanca · Morocco", group: "Africa" },
  { value: "Indian/Mauritius", offset: "UTC+04:00", label: "Port Louis · Mauritius", group: "Africa" },
  { value: "Indian/Mahe", offset: "UTC+04:00", label: "Victoria · Seychelles", group: "Africa" },

  // Europe
  { value: "Europe/London", offset: "UTC+00:00", label: "London · United Kingdom", group: "Europe" },
  { value: "Europe/Lisbon", offset: "UTC+00:00", label: "Lisbon · Portugal", group: "Europe" },
  { value: "Europe/Dublin", offset: "UTC+00:00", label: "Dublin · Ireland", group: "Europe" },
  { value: "Europe/Amsterdam", offset: "UTC+01:00", label: "Amsterdam · Netherlands", group: "Europe" },
  { value: "Europe/Berlin", offset: "UTC+01:00", label: "Berlin · Germany", group: "Europe" },
  { value: "Europe/Paris", offset: "UTC+01:00", label: "Paris · France", group: "Europe" },
  { value: "Europe/Madrid", offset: "UTC+01:00", label: "Madrid · Spain", group: "Europe" },
  { value: "Europe/Rome", offset: "UTC+01:00", label: "Rome · Italy", group: "Europe" },
  { value: "Europe/Zurich", offset: "UTC+01:00", label: "Zurich · Switzerland", group: "Europe" },
  { value: "Europe/Vienna", offset: "UTC+01:00", label: "Vienna · Austria", group: "Europe" },
  { value: "Europe/Warsaw", offset: "UTC+01:00", label: "Warsaw · Poland", group: "Europe" },
  { value: "Europe/Athens", offset: "UTC+02:00", label: "Athens · Greece", group: "Europe" },
  { value: "Europe/Istanbul", offset: "UTC+03:00", label: "Istanbul · Türkiye", group: "Europe" },

  // Americas
  { value: "America/New_York", offset: "UTC-05:00", label: "New York · United States (Eastern)", group: "Americas" },
  { value: "America/Chicago", offset: "UTC-06:00", label: "Chicago · United States (Central)", group: "Americas" },
  { value: "America/Denver", offset: "UTC-07:00", label: "Denver · United States (Mountain)", group: "Americas" },
  { value: "America/Los_Angeles", offset: "UTC-08:00", label: "Los Angeles · United States (Pacific)", group: "Americas" },
  { value: "America/Toronto", offset: "UTC-05:00", label: "Toronto · Canada", group: "Americas" },
  { value: "America/Mexico_City", offset: "UTC-06:00", label: "Mexico City · Mexico", group: "Americas" },
  { value: "America/Sao_Paulo", offset: "UTC-03:00", label: "São Paulo · Brazil", group: "Americas" },
  { value: "America/Argentina/Buenos_Aires", offset: "UTC-03:00", label: "Buenos Aires · Argentina", group: "Americas" },

  // Asia / Middle East
  { value: "Asia/Dubai", offset: "UTC+04:00", label: "Dubai · United Arab Emirates", group: "Asia & Middle East" },
  { value: "Asia/Riyadh", offset: "UTC+03:00", label: "Riyadh · Saudi Arabia", group: "Asia & Middle East" },
  { value: "Asia/Jerusalem", offset: "UTC+02:00", label: "Jerusalem · Israel", group: "Asia & Middle East" },
  { value: "Asia/Karachi", offset: "UTC+05:00", label: "Karachi · Pakistan", group: "Asia & Middle East" },
  { value: "Asia/Kolkata", offset: "UTC+05:30", label: "Kolkata · India", group: "Asia & Middle East" },
  { value: "Asia/Bangkok", offset: "UTC+07:00", label: "Bangkok · Thailand", group: "Asia & Middle East" },
  { value: "Asia/Singapore", offset: "UTC+08:00", label: "Singapore", group: "Asia & Middle East" },
  { value: "Asia/Hong_Kong", offset: "UTC+08:00", label: "Hong Kong", group: "Asia & Middle East" },
  { value: "Asia/Shanghai", offset: "UTC+08:00", label: "Shanghai · China", group: "Asia & Middle East" },
  { value: "Asia/Tokyo", offset: "UTC+09:00", label: "Tokyo · Japan", group: "Asia & Middle East" },

  // Oceania
  { value: "Australia/Perth", offset: "UTC+08:00", label: "Perth · Australia", group: "Oceania" },
  { value: "Australia/Sydney", offset: "UTC+10:00", label: "Sydney · Australia", group: "Oceania" },
  { value: "Pacific/Auckland", offset: "UTC+12:00", label: "Auckland · New Zealand", group: "Oceania" },

  { value: "UTC", offset: "UTC+00:00", label: "Coordinated Universal Time", group: "Other" },
];

export const RU_TIME_ZONE_GROUPS: string[] = Array.from(
  new Set(RU_TIME_ZONES.map((z) => z.group)),
);

/** Label used in dropdowns and read-only summaries. */
export function ruTimeZoneLabel(value: string): string {
  const hit = RU_TIME_ZONES.find((z) => z.value === value);
  return hit ? `(${hit.offset}) ${hit.label}` : value;
}

/** Legacy free-text offsets we can safely map onto a canonical IANA zone. */
const OFFSET_FALLBACK: Record<string, string> = {
  "+00:00": "UTC",
  "+01:00": "Africa/Lagos",
  "+02:00": "Africa/Johannesburg",
  "+03:00": "Africa/Nairobi",
  "+04:00": "Asia/Dubai",
  "+05:30": "Asia/Kolkata",
  "+07:00": "Asia/Bangkok",
  "+08:00": "Asia/Singapore",
  "+09:00": "Asia/Tokyo",
  "+10:00": "Australia/Sydney",
  "+12:00": "Pacific/Auckland",
  "-03:00": "America/Sao_Paulo",
  "-05:00": "America/New_York",
  "-06:00": "America/Chicago",
  "-07:00": "America/Denver",
  "-08:00": "America/Los_Angeles",
};

/**
 * Normalise any historically captured value ("UTC+02:00", "GMT +2", "SAST",
 * "South Africa Standard Time") to a canonical IANA identifier. Returns an empty
 * string when nothing usable can be derived.
 */
export function normalizeRuTimeZone(raw?: string | null): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const exact = RU_TIME_ZONES.find((z) => z.value.toLowerCase() === value.toLowerCase());
  if (exact) return exact.value;
  if (/^[A-Za-z]+\/[A-Za-z_\/+-]+$/.test(value)) return value; // already IANA-shaped
  if (/^(sast|south africa standard time)$/i.test(value)) return "Africa/Johannesburg";
  if (/^(cat|central africa(n)? time)$/i.test(value)) return "Africa/Maputo";
  if (/^(eat|east africa(n)? time)$/i.test(value)) return "Africa/Nairobi";
  if (/^(gmt|utc|z)$/i.test(value)) return "UTC";
  const offset = value.match(/([+-])\s*(\d{1,2})(?::?(\d{2}))?/);
  if (offset) {
    const sign = offset[1];
    const hh = String(Number(offset[2])).padStart(2, "0");
    const mm = offset[3] ?? "00";
    return OFFSET_FALLBACK[`${sign}${hh}:${mm}`] ?? "";
  }
  return "";
}
