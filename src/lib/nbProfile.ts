/**
 * Per-property NightsBridge quirks.
 *
 * NightsBridge exports are not uniform per client: one BBID can carry several
 * properties' history, one workbook can hold a sheet per property, siblings can
 * share a combined report, and some owners compare against the report that was
 * sent same-time-last-year rather than a stored run.
 *
 * All of that is configuration on `property_report_settings.nb_profile` — never a
 * new report source key and never a property name special-case in the parser.
 */

export interface NbRouteToken {
  /** Substring matched against room name, guest, company and source. */
  match: string;
  /** The ROL property this row really belongs to. */
  property_id: string;
}

export interface NbProfile {
  /** Rows matching any of these never enter the snapshot. */
  exclude_patterns: string[];
  /** Zero-revenue rows that still count as sold nights. */
  keep_patterns: string[];
  /** One bookingsummary holding several properties. */
  route_tokens: NbRouteToken[];
  /** One workbook with a sheet per property: sheet name → property id. */
  sheet_map: Record<string, string>;
  /** Siblings that share a combination / group report. */
  group_property_ids: string[];
  group_label: string | null;
  /** Use the imported prior owner workbook as same-time-last-year OTB. */
  stly_from_prior_workbook: boolean;
  /** Last-year nights live in the current ledger (BBID never split in NB). */
  historical_from_current_ledger: boolean;
}

export const EMPTY_NB_PROFILE: NbProfile = {
  exclude_patterns: [],
  keep_patterns: [],
  route_tokens: [],
  sheet_map: {},
  group_property_ids: [],
  group_label: null,
  stly_from_prior_workbook: false,
  historical_from_current_ledger: false,
};

const stringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    const text = String(entry ?? "").trim();
    if (text) seen.add(text);
  }
  return [...seen];
};

const tokenList = (value: unknown): NbRouteToken[] => {
  if (!Array.isArray(value)) return [];
  const out: NbRouteToken[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const match = String((entry as NbRouteToken).match ?? "").trim();
    const propertyId = String((entry as NbRouteToken).property_id ?? "").trim();
    if (match && propertyId) out.push({ match, property_id: propertyId });
  }
  return out;
};

const stringMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = key.trim();
    const propertyId = String(raw ?? "").trim();
    if (name && propertyId) out[name] = propertyId;
  }
  return out;
};

/** Tolerant read of whatever is stored on the settings row. */
export function parseNbProfile(value: unknown): NbProfile {
  if (!value || typeof value !== "object") return { ...EMPTY_NB_PROFILE };
  const raw = value as Record<string, unknown>;
  const label = String(raw.group_label ?? "").trim();
  return {
    exclude_patterns: stringList(raw.exclude_patterns),
    keep_patterns: stringList(raw.keep_patterns),
    route_tokens: tokenList(raw.route_tokens),
    sheet_map: stringMap(raw.sheet_map),
    group_property_ids: stringList(raw.group_property_ids),
    group_label: label || null,
    stly_from_prior_workbook: Boolean(raw.stly_from_prior_workbook),
    historical_from_current_ledger: Boolean(raw.historical_from_current_ledger),
  };
}

/** True when nothing on the profile would change the parse. */
export function isEmptyNbProfile(profile: NbProfile): boolean {
  return (
    profile.exclude_patterns.length === 0 &&
    profile.keep_patterns.length === 0 &&
    profile.route_tokens.length === 0 &&
    Object.keys(profile.sheet_map).length === 0 &&
    profile.group_property_ids.length === 0 &&
    !profile.stly_from_prior_workbook &&
    !profile.historical_from_current_ledger
  );
}
