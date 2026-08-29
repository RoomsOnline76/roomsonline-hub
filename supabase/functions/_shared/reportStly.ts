/**
 * Same-time-last-year (STLY) series resolution.
 *
 * Some clients (Mziki) do not compare against last year's *actuals* — they
 * compare today's on-the-books against what the on-the-books looked like when we
 * sent the report a year ago. That yardstick lives in one of three places, in
 * order of authority:
 *
 *   1. the ledger itself, when the parser could build an STLY block
 *      (`report_snapshots.stly`);
 *   2. the imported previous workbook — either its own `STLY` block (Hotel
 *      Krige, whose pack prints one), or, when the uploaded pack *is* the vintage
 *      we sent a year ago, that pack's own current-OTB column shifted forward a
 *      year (Mziki, who keep last year's sent workbook);
 *   3. a stored run of ours taken about a year before this one — the same figures
 *      we printed then, so nothing has to be uploaded at all.
 *
 * The resolved series is always keyed to the *current* run's months so every
 * builder can drop it straight into a comparison column.
 */

export interface StlySeries {
  revenue: Record<string, number>;
  room_nights: Record<string, number>;
  occupancy: Record<string, number>;
  /** As-of date of whatever produced the series, for the column heading. */
  asOfDate: string | null;
  source: "ledger" | "prior_workbook" | "stored_run" | "none";
  /** Run id when the series came from one of our own earlier runs. */
  runId?: string;
}

const EMPTY: StlySeries = {
  revenue: {},
  room_nights: {},
  occupancy: {},
  asOfDate: null,
  source: "none",
};

const numberMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
};

const pick = (value: unknown, key: string): unknown =>
  value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;

const hasValues = (map: Record<string, number>): boolean => Object.keys(map).length > 0;

/** `2025-08` → `2026-08`. Keys that are not `YYYY-MM` are dropped. */
export const shiftMapForward = (
  map: Record<string, number>,
  years = 1,
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    const match = /^(\d{4})-(\d{2})$/.exec(key);
    if (!match) continue;
    out[`${Number(match[1]) + years}-${match[2]}`] = value;
  }
  return out;
};

/** Restrict a series to the run's own months. */
const within = (map: Record<string, number>, months: string[]): Record<string, number> => {
  const wanted = new Set(months);
  return Object.fromEntries(Object.entries(map).filter(([key]) => wanted.has(key)));
};

const yearsApart = (later: string, earlier: string): number => {
  const a = Date.parse(`${later}T00:00:00Z`);
  const b = Date.parse(`${earlier}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return (a - b) / (365.2425 * 24 * 3600 * 1000);
};

/** True when `candidate` sits roughly one year before `asOfDate` (± 6 weeks). */
export const isLastYearVintage = (
  asOfDate: string | null | undefined,
  candidate: string | null | undefined,
): boolean => {
  if (!asOfDate || !candidate) return false;
  const gap = yearsApart(asOfDate.slice(0, 10), candidate.slice(0, 10));
  return Number.isFinite(gap) && Math.abs(gap - 1) <= 0.115;
};

export interface StlyInput {
  months: string[];
  asOfDate: string;
  /** `report_snapshots.stly`, when the parser produced one. */
  snapshotStly?: unknown;
  /** `report_runs.imported_baseline`. */
  importedBaseline?: unknown;
  /** Candidate earlier runs of ours: `{ id, as_of_date, snapshot }`. */
  storedRuns?: {
    id: string;
    as_of_date: string;
    otb_revenue?: unknown;
    room_nights?: unknown;
    occupancy?: unknown;
  }[];
}

/** Resolves the STLY series from whichever source can supply it. */
export function resolveStlySeries(input: StlyInput): StlySeries {
  const months = input.months ?? [];
  if (months.length === 0) return { ...EMPTY };

  // 1. Ledger-derived STLY.
  const ledgerRevenue = within(numberMap(pick(input.snapshotStly, "revenue")), months);
  if (hasValues(ledgerRevenue)) {
    return {
      revenue: ledgerRevenue,
      room_nights: within(numberMap(pick(input.snapshotStly, "room_nights")), months),
      occupancy: within(numberMap(pick(input.snapshotStly, "occupancy")), months),
      asOfDate: null,
      source: "ledger",
    };
  }

  const imported = input.importedBaseline;

  // 2a. The imported pack printed its own STLY block.
  const importedStly = pick(imported, "stly");
  const importedStlyRevenue = within(numberMap(pick(importedStly, "revenue")), months);
  if (hasValues(importedStlyRevenue)) {
    return {
      revenue: importedStlyRevenue,
      room_nights: within(numberMap(pick(importedStly, "room_nights")), months),
      occupancy: within(numberMap(pick(importedStly, "occupancy")), months),
      asOfDate: (pick(imported, "as_of_date") as string | null) ?? null,
      source: "prior_workbook",
    };
  }

  // 2b. The imported pack *is* last year's sent report — its own on-the-books
  //     column, moved forward a year, is this run's STLY.
  const importedAsOf = (pick(imported, "as_of_date") as string | null) ?? null;
  if (isLastYearVintage(input.asOfDate, importedAsOf)) {
    const revenue = within(
      shiftMapForward(numberMap(pick(imported, "current_otb_revenue"))),
      months,
    );
    if (hasValues(revenue)) {
      return {
        revenue,
        room_nights: within(
          shiftMapForward(numberMap(pick(imported, "current_room_nights"))),
          months,
        ),
        occupancy: within(
          shiftMapForward(numberMap(pick(imported, "current_otb_occupancy"))),
          months,
        ),
        asOfDate: importedAsOf,
        source: "prior_workbook",
      };
    }
  }

  // 3. One of our own runs from about a year ago.
  const candidates = (input.storedRuns ?? [])
    .filter((row) => isLastYearVintage(input.asOfDate, row.as_of_date))
    .sort(
      (a, b) =>
        Math.abs(yearsApart(input.asOfDate, a.as_of_date) - 1) -
        Math.abs(yearsApart(input.asOfDate, b.as_of_date) - 1),
    );
  for (const candidate of candidates) {
    const revenue = within(shiftMapForward(numberMap(candidate.otb_revenue)), months);
    if (!hasValues(revenue)) continue;
    return {
      revenue,
      room_nights: within(shiftMapForward(numberMap(candidate.room_nights)), months),
      occupancy: within(shiftMapForward(numberMap(candidate.occupancy)), months),
      asOfDate: candidate.as_of_date.slice(0, 10),
      source: "stored_run",
      runId: candidate.id,
    };
  }

  return { ...EMPTY };
}

/** Minimal shape of the Supabase client this loader needs. */
interface StlyDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        gte(column: string, value: string): {
          lte(column: string, value: string): Promise<{ data: unknown; error: unknown }>;
        };
      };
      in(column: string, values: string[]): Promise<{ data: unknown; error: unknown }>;
    };
  };
}

const shiftDate = (asOfDate: string, days: number): string => {
  const base = Date.parse(`${asOfDate.slice(0, 10)}T00:00:00Z`);
  const moved = new Date(base - 365.2425 * 24 * 3600 * 1000 + days * 24 * 3600 * 1000);
  return moved.toISOString().slice(0, 10);
};

/**
 * Resolves the STLY series, falling back to one of our own runs from a year ago
 * when nothing was uploaded. Used by both the Excel and draft builders so the
 * column can never differ between them.
 */
export async function loadStlySeries(
  db: StlyDb,
  args: {
    propertyId: string;
    runId: string;
    asOfDate: string;
    months: string[];
    snapshotStly?: unknown;
    importedBaseline?: unknown;
  },
): Promise<StlySeries> {
  const withoutStoredRun = resolveStlySeries({
    months: args.months,
    asOfDate: args.asOfDate,
    snapshotStly: args.snapshotStly,
    importedBaseline: args.importedBaseline,
  });
  if (withoutStoredRun.source !== "none") return withoutStoredRun;

  const { data: runRows } = await db
    .from("report_runs")
    .select("id, as_of_date")
    .eq("property_id", args.propertyId)
    .gte("as_of_date", shiftDate(args.asOfDate, -45))
    .lte("as_of_date", shiftDate(args.asOfDate, 45));
  const runs = (Array.isArray(runRows) ? runRows : []).filter(
    (row): row is { id: string; as_of_date: string } =>
      Boolean(row && typeof row === "object") &&
      typeof (row as { id?: unknown }).id === "string" &&
      (row as { id?: string }).id !== args.runId &&
      typeof (row as { as_of_date?: unknown }).as_of_date === "string",
  );
  if (runs.length === 0) return withoutStoredRun;

  const { data: snapRows } = await db
    .from("report_snapshots")
    .select("run_id, otb_revenue, room_nights, occupancy")
    .in(
      "run_id",
      runs.map((row) => row.id),
    );
  const snapshots = new Map<string, Record<string, unknown>>();
  for (const row of Array.isArray(snapRows) ? snapRows : []) {
    const record = row as Record<string, unknown>;
    if (typeof record.run_id === "string") snapshots.set(record.run_id, record);
  }

  return resolveStlySeries({
    months: args.months,
    asOfDate: args.asOfDate,
    snapshotStly: args.snapshotStly,
    importedBaseline: args.importedBaseline,
    storedRuns: runs.map((row) => ({
      id: row.id,
      as_of_date: row.as_of_date,
      otb_revenue: snapshots.get(row.id)?.otb_revenue,
      room_nights: snapshots.get(row.id)?.room_nights,
      occupancy: snapshots.get(row.id)?.occupancy,
    })),
  });
}


/** `2025-08-14` → `14 Aug 2025`, for the STLY column heading. */
export const formatAsOf = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[Number(match[2]) - 1];
  if (!month) return null;
  return `${Number(match[3])} ${month} ${match[1]}`;
};
