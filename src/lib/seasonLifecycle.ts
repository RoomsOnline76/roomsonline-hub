/**
 * Season lifecycle helpers.
 *
 * Seasons are authored in the Calendar and consumed by Rate Plans. Once every window
 * of a season is in the past it can no longer be sold, so both surfaces hide it — the
 * data is never deleted, so historical rates and bookings stay intact.
 */

/** Anything with date windows: `periods`, or a flat `from`/`to` pair (legacy shape). */
export interface SeasonLike {
  periods?: { from?: string | null; to?: string | null }[] | null;
  from?: string | null;
  to?: string | null;
}

const todayISO = (): string => {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

/** Every window of the season, ignoring incomplete ones. */
export const seasonWindows = (season: SeasonLike): { from: string; to: string }[] => {
  const raw = Array.isArray(season.periods) && season.periods.length > 0
    ? season.periods
    : [{ from: season.from, to: season.to }];
  const out: { from: string; to: string }[] = [];
  for (const period of raw) {
    if (period?.from && period?.to) out.push({ from: String(period.from), to: String(period.to) });
  }
  return out;
};

/**
 * True when every window ended before today. A season with one future (or current)
 * window is still live, even if it also carries old windows.
 */
export const isSeasonExpired = (season: SeasonLike, today: string = todayISO()): boolean => {
  const windows = seasonWindows(season);
  if (windows.length === 0) return false;
  return windows.every((w) => w.to < today);
};

/** Only the seasons that can still be sold. */
export const filterLiveSeasons = <T extends SeasonLike>(seasons: T[], today: string = todayISO()): T[] =>
  seasons.filter((s) => !isSeasonExpired(s, today));
