import { describe, expect, it } from 'vitest';
import { changeoverIsUniform, collapseAvbRanges, type RuAvbEntry } from './ruAvbCollapse.ts';

const day = (iso: string, over: Partial<RuAvbEntry> = {}): RuAvbEntry => ({
  date_from: iso,
  date_to: iso,
  units: 1,
  min_stay: 1,
  changeover: 4,
  ...over,
});

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const year = (from: string, count: number, over: (iso: string) => Partial<RuAvbEntry> = () => ({})) =>
  Array.from({ length: count }, (_, i) => day(addDays(from, i), over(addDays(from, i))));

describe('collapseAvbRanges', () => {
  it('collapses 365 identical open days into one range', () => {
    const out = collapseAvbRanges(year('2026-09-01', 365));
    expect(out).toHaveLength(1);
    expect(out[0].date_from).toBe('2026-09-01');
    expect(out[0].date_to).toBe(addDays('2026-09-01', 364));
  });

  it('ignores internal-only fields such as seasonId', () => {
    const entries = year('2026-09-01', 10).map((e, i) => ({ ...e, seasonId: i < 5 ? 'a' : 'b' }));
    expect(collapseAvbRanges(entries)).toHaveLength(1);
  });

  it('yields three ranges when five nights mid-year are closed', () => {
    const closedFrom = addDays('2026-09-01', 100);
    const closed = new Set(Array.from({ length: 5 }, (_, i) => addDays(closedFrom, i)));
    const out = collapseAvbRanges(year('2026-09-01', 365, (iso) => (closed.has(iso) ? { units: 0 } : {})));
    expect(out).toHaveLength(3);
    expect(out[1]).toMatchObject({ date_from: closedFrom, date_to: addDays(closedFrom, 4), units: 0 });
  });

  it('splits on min stay and max stay changes', () => {
    const out = collapseAvbRanges([
      day('2026-09-01'),
      day('2026-09-02', { min_stay: 3 }),
      day('2026-09-03', { min_stay: 3 }),
      day('2026-09-04', { min_stay: 3, max_stay: 14 }),
    ]);
    expect(out.map((e) => [e.date_from, e.date_to])).toEqual([
      ['2026-09-01', '2026-09-01'],
      ['2026-09-02', '2026-09-03'],
      ['2026-09-04', '2026-09-04'],
    ]);
  });

  it('keeps already-ranged multi-unit entries ranged and merges contiguous ones', () => {
    const out = collapseAvbRanges([
      { date_from: '2026-09-01', date_to: '2026-09-30', units: 3, min_stay: 2, changeover: 4 },
      { date_from: '2026-10-01', date_to: '2026-10-31', units: 3, min_stay: 2, changeover: 4 },
      { date_from: '2026-11-01', date_to: '2026-11-30', units: 2, min_stay: 2, changeover: 4 },
    ]);
    expect(out).toEqual([
      { date_from: '2026-09-01', date_to: '2026-10-31', units: 3, min_stay: 2, changeover: 4 },
      { date_from: '2026-11-01', date_to: '2026-11-30', units: 2, min_stay: 2, changeover: 4 },
    ]);
  });

  it('is a no-op for empty and single-entry payloads', () => {
    expect(collapseAvbRanges([])).toEqual([]);
    expect(collapseAvbRanges([day('2026-09-01')])).toHaveLength(1);
  });
});

describe('changeoverIsUniform', () => {
  it('treats absent or all-default weekday rules as uniform', () => {
    expect(changeoverIsUniform(null, 4)).toBe(true);
    expect(changeoverIsUniform({}, 4)).toBe(true);
    expect(changeoverIsUniform({ 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 }, 4)).toBe(true);
  });

  it('detects a genuine per-weekday rule', () => {
    expect(changeoverIsUniform({ 0: 4, 6: 1 }, 4)).toBe(false);
  });
});
