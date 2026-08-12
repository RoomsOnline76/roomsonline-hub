/**
 * Season coverage over the rolling 365-day selling window.
 *
 * Purely informational: the Calendar / Seasons surface uses this to tell an owner
 * whether their authored season dates blanket the window, instead of leaving them
 * to infer it from an unrelated mandatory-field counter. Channel readiness for
 * pricing/availability coverage stays owned by the probed channel state.
 */

export interface CoveragePeriod {
  from: string;
  to: string;
}

export interface SeasonCoverage {
  /** Start of the evaluated window (today), ISO date. */
  windowStart: string;
  /** End of the evaluated window (today + 364 days), ISO date. */
  windowEnd: string;
  /** Days of the window covered by at least one season period. */
  coveredDays: number;
  /** Always 365 — the window length. */
  windowDays: number;
  /** Uncovered stretches inside the window, in chronological order. */
  gaps: CoveragePeriod[];
  /** Earliest authored season date across all periods (ISO) or null. */
  earliest: string | null;
  /** Latest authored season date across all periods (ISO) or null. */
  latest: string | null;
  fullyCovered: boolean;
}

const DAY_MS = 86_400_000;

const toUtcDay = (value: string): number | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(`${trimmed.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / DAY_MS) : null;
};

const toIso = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

/**
 * @param periods every authored season period (inclusive `from`/`to` ISO dates)
 * @param today   evaluation anchor, defaults to now
 */
export function computeSeasonCoverage(periods: CoveragePeriod[], today: Date = new Date()): SeasonCoverage {
  const windowStartDay = Math.floor(Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`) / DAY_MS);
  const windowEndDay = windowStartDay + 364;

  const ranges: Array<[number, number]> = [];
  let earliest: number | null = null;
  let latest: number | null = null;

  for (const period of periods) {
    const from = toUtcDay(period?.from ?? "");
    const to = toUtcDay(period?.to ?? "");
    if (from == null || to == null || to < from) continue;
    earliest = earliest == null ? from : Math.min(earliest, from);
    latest = latest == null ? to : Math.max(latest, to);
    const clippedFrom = Math.max(from, windowStartDay);
    const clippedTo = Math.min(to, windowEndDay);
    if (clippedTo >= clippedFrom) ranges.push([clippedFrom, clippedTo]);
  }

  ranges.sort((a, b) => a[0] - b[0]);

  // Merge overlapping / adjacent ranges so the gap walk is unambiguous.
  const merged: Array<[number, number]> = [];
  for (const [from, to] of ranges) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }

  const gaps: CoveragePeriod[] = [];
  let cursor = windowStartDay;
  for (const [from, to] of merged) {
    if (from > cursor) gaps.push({ from: toIso(cursor), to: toIso(from - 1) });
    cursor = Math.max(cursor, to + 1);
  }
  if (cursor <= windowEndDay) gaps.push({ from: toIso(cursor), to: toIso(windowEndDay) });

  const coveredDays = merged.reduce((sum, [from, to]) => sum + (to - from + 1), 0);

  return {
    windowStart: toIso(windowStartDay),
    windowEnd: toIso(windowEndDay),
    coveredDays,
    windowDays: 365,
    gaps,
    earliest: earliest == null ? null : toIso(earliest),
    latest: latest == null ? null : toIso(latest),
    fullyCovered: gaps.length === 0,
  };
}
