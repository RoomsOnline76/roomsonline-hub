/**
 * Rentals United availability payload compaction.
 *
 * `Push_PutAvbUnits_RQ` accepts date ranges (`<DateFrom>`/`<DateTo>`), but several build steps
 * work day-by-day (per-day-of-week changeover rules, manual restriction overlays, sold-night
 * blocks). Left uncollapsed, a uniform open year is sent as hundreds of single-day siblings —
 * a 35 kB request that takes ~20s instead of ~1s.
 *
 * This helper is the single compaction point: consecutive days that agree on every field RU
 * actually receives (units, min stay, max stay, changeover) merge into one range. Internal-only
 * fields such as a season id are deliberately ignored — they never reach the wire, so keying on
 * them fragments an otherwise identical year.
 */
export type RuAvbEntry = {
  date_from: string;
  date_to: string;
  units: number;
  min_stay: number;
  max_stay?: number;
  changeover: number;
};

const addDays = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function collapseAvbRanges<T extends RuAvbEntry>(entries: T[]): T[] {
  if (!Array.isArray(entries) || entries.length < 2) return Array.isArray(entries) ? [...entries] : [];

  const sorted = [...entries].sort((a, b) =>
    a.date_from.localeCompare(b.date_from) || a.date_to.localeCompare(b.date_to),
  );

  const out: T[] = [];
  for (const e of sorted) {
    const last = out[out.length - 1];
    const sameShape =
      last &&
      last.units === e.units &&
      last.min_stay === e.min_stay &&
      (last.max_stay ?? null) === (e.max_stay ?? null) &&
      last.changeover === e.changeover;
    if (sameShape && (addDays(last.date_to, 1) === e.date_from || last.date_to >= e.date_from)) {
      // Contiguous or overlapping with identical wire values → extend.
      if (e.date_to > last.date_to) last.date_to = e.date_to;
    } else {
      out.push({ ...e });
    }
  }
  return out;
}

/** True when per-day-of-week changeover rules are indistinguishable from the default code. */
export function changeoverIsUniform(
  perDow: Record<number, number> | null | undefined,
  defaultCode: number,
): boolean {
  if (!perDow) return true;
  const values = Object.values(perDow);
  if (values.length === 0) return true;
  return values.every((v) => Number(v) === Number(defaultCode));
}
