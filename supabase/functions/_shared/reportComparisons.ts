// Resolves the profile-driven comparison column sets (calendar-year actuals and
// same-time-last-year) for one run, from figures the pipeline already stores:
// the property's historical baseline, the run's own last-year maps and the
// imported prior owner workbook.
//
// Both the workbook builder and the draft HTML call this, so a property's pack
// never disagrees with its Excel.
import { buildYearOverlay, type YearOverlay } from "./reportYearOverlay.ts";
import { parseReportProfile, type ReportProfile } from "./reportProfile.ts";

type NumberMap = Record<string, number>;

const numberMap = (value: unknown): NumberMap => {
  if (!value || typeof value !== "object") return {};
  const out: NumberMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
};

export interface ComparisonInput {
  months: string[];
  asOfDate: string;
  roomCount: number;
  capacityDays: NumberMap;
  lastYearActual: NumberMap;
  lastYearRoomNights: NumberMap;
  lastYearOccupancy: NumberMap;
  /** `property_report_settings.report_profile` and `historical_baseline`. */
  reportProfile: unknown;
  historicalBaseline: unknown;
  /** `report_runs.imported_baseline` — the prior sent workbook. */
  importedBaseline: unknown;
}

export interface ResolvedComparisons extends YearOverlay {
  profile: ReportProfile;
}

/**
 * Empty `comparisons` for a property with no profile — the default column order
 * is untouched.
 */
export function resolveComparisons(input: ComparisonInput): ResolvedComparisons {
  const profile = parseReportProfile(input.reportProfile);
  const baseline = (input.historicalBaseline ?? {}) as {
    revenue?: unknown;
    room_nights?: unknown;
    occupancy?: unknown;
  };
  const imported = (input.importedBaseline ?? {}) as {
    as_of_date?: string | null;
    current_otb_revenue?: unknown;
    current_room_nights?: unknown;
    previous_otb_revenue?: unknown;
    previous_room_nights?: unknown;
    previous_occupancy?: unknown;
    last_year_occupancy?: unknown;
  };

  if (!profile.year_columns || (profile.compare_years.length === 0 && !profile.stly_from_prior_workbook)) {
    return { profile, actuals_by_year: {}, stly: null, comparisons: [] };
  }

  // STLY comes off the OTB column of the pack that was sent a year ago: that
  // column is exactly "what was on the books at this point last year".
  const stlyRevenue = numberMap(imported.current_otb_revenue ?? imported.previous_otb_revenue);
  const stlyNights = numberMap(imported.current_room_nights ?? imported.previous_room_nights);

  const overlay = buildYearOverlay(
    {
      months: input.months,
      capacityDays: input.capacityDays,
      roomCount: input.roomCount,
      historicalRevenue: numberMap(baseline.revenue),
      historicalRoomNights: numberMap(baseline.room_nights),
      historicalOccupancy: numberMap(baseline.occupancy),
      lastYearActual: input.lastYearActual,
      lastYearRoomNights: input.lastYearRoomNights,
      lastYearOccupancy: input.lastYearOccupancy,
      storedRevenue: {},
      storedRoomNights: {},
      currentYear: Number(String(input.asOfDate).slice(0, 4)) || new Date().getUTCFullYear(),
      stlyRevenue,
      stlyRoomNights: stlyNights,
      stlyOccupancy: numberMap(imported.previous_occupancy ?? imported.last_year_occupancy),
      stlyAsOf: imported.as_of_date ? String(imported.as_of_date).slice(0, 10) : null,
    },
    profile.compare_years,
    profile.stly_from_prior_workbook,
  );

  return { profile, ...overlay };
}
