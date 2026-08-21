/**
 * protel "Company / Travel agent / Source Production" normalisation.
 *
 * The export lists, per profile, one row per business date with the rate code,
 * market code, distribution channel, room nights and the accommodation / F&B /
 * extras split, followed by a per-profile subtotal, a grand total and a
 * parameter footer.
 *
 * Important: the report runs in "Linked Guests" mode, so a single reservation is
 * listed under every profile linked to it (company *and* travel agent *and*
 * source). Per-profile figures therefore double count and must never be summed
 * into revenue. They are only used for *proportional* splits — market-code and
 * distribution-channel mix — which is unaffected by the duplication.
 */

export interface ProtelProductionRow {
  profile: string;
  date: string; // YYYY-MM-DD
  marketCode: string;
  distributionChannel: string;
  rateCode: string;
  nights: number;
  accommodation: number;
  total: number;
}

export interface ProtelProductionMix {
  label: string;
  nights: number;
  revenue: number;
}

export interface ProtelProductionResult {
  rows: ProtelProductionRow[];
  /** Revenue mix by market code, ordered by revenue (descending). */
  markets: ProtelProductionMix[];
  /** Revenue mix by distribution channel, ordered by revenue (descending). */
  channels: ProtelProductionMix[];
  period: { from: string; to: string } | null;
  errors: string[];
  warnings: string[];
}

type Grid = unknown[][];

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);

const numeric = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const cleaned = text(value).replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-") return NaN;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
};

/** `01.03.2026` / `01-03-2026` → `2026-03-01`; two-digit years assume 2000s. */
export function protelShortDateToIso(raw: string): string | null {
  const match = raw.trim().match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{2}|\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yy] = match;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  return `${year}-${mm}-${dd}`;
}

const HEADER_LABELS = {
  profile: /^name$/i,
  rateCode: /^rate code$/i,
  marketCode: /^market code$/i,
  distributionChannel: /^distr\.? channel$/i,
  date: /^date$/i,
  nights: /^room nights$/i,
  accommodation: /^accommodation$/i,
  total: /^total$/i,
} as const;

type HeaderKey = keyof typeof HEADER_LABELS;

/** Locates the production report's header columns. */
function findColumns(grid: Grid): Partial<Record<HeaderKey, number>> {
  const columns: Partial<Record<HeaderKey, number>> = {};
  for (let r = 0; r < Math.min(grid.length, 30); r += 1) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c += 1) {
      const label = text(row[c]);
      if (!label) continue;
      for (const [key, pattern] of Object.entries(HEADER_LABELS) as [HeaderKey, RegExp][]) {
        if (columns[key] === undefined && pattern.test(label)) columns[key] = c;
      }
    }
    if (columns.date !== undefined && columns.nights !== undefined && columns.total !== undefined) {
      break;
    }
  }
  return columns;
}

export function isProductionGrid(grid: Grid): boolean {
  const columns = findColumns(grid);
  return (
    columns.date !== undefined &&
    columns.nights !== undefined &&
    columns.total !== undefined &&
    columns.marketCode !== undefined
  );
}

const mix = (rows: ProtelProductionRow[], pick: (row: ProtelProductionRow) => string) => {
  const buckets = new Map<string, ProtelProductionMix>();
  for (const row of rows) {
    const label = pick(row) || "Unspecified";
    const bucket = buckets.get(label) ?? { label, nights: 0, revenue: 0 };
    bucket.nights += row.nights;
    bucket.revenue += row.accommodation;
    buckets.set(label, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.revenue - a.revenue);
};

export function parseProtelProduction(grid: Grid, filename: string): ProtelProductionResult {
  const columns = findColumns(grid);
  if (!isProductionGrid(grid)) {
    return {
      rows: [],
      markets: [],
      channels: [],
      period: null,
      errors: [`${filename}: not a protel Production report (header columns not found)`],
      warnings: [],
    };
  }

  const rows: ProtelProductionRow[] = [];
  let period: ProtelProductionResult["period"] = null;
  let profile = "";

  for (const raw of grid) {
    const row = raw ?? [];
    const nameCell = text(row[columns.profile ?? 0]);
    const dateIso = protelShortDateToIso(text(row[columns.date!]));

    if (/^period:?$/i.test(nameCell)) {
      const dates = row.map((cell) => protelShortDateToIso(text(cell))).filter(Boolean) as string[];
      if (dates.length >= 2) period = { from: dates[0], to: dates[dates.length - 1] };
      continue;
    }

    if (!dateIso) {
      // A bare name cell starts a new profile block; footer labels end with ":".
      if (nameCell && !nameCell.endsWith(":") && !/^parameter$/i.test(nameCell)) profile = nameCell;
      continue;
    }

    const nights = numeric(row[columns.nights!]);
    rows.push({
      profile,
      date: dateIso,
      marketCode: text(row[columns.marketCode!]),
      distributionChannel: text(row[columns.distributionChannel ?? -1]),
      rateCode: text(row[columns.rateCode ?? -1]),
      nights: Number.isFinite(nights) ? nights : 0,
      accommodation: Number.isFinite(numeric(row[columns.accommodation ?? -1]))
        ? numeric(row[columns.accommodation!])
        : 0,
      total: Number.isFinite(numeric(row[columns.total!])) ? numeric(row[columns.total!]) : 0,
    });
  }

  const warnings: string[] = [];
  if (!rows.length) warnings.push(`${filename}: no production detail rows found`);

  return {
    rows,
    markets: mix(rows, (row) => row.marketCode),
    channels: mix(rows, (row) => row.distributionChannel),
    period,
    errors: [],
    warnings,
  };
}

/**
 * Turns a revenue mix into normalised shares (summing to 1). Buckets under
 * `minShare` are folded into the largest bucket so the report is not littered
 * with slivers.
 */
export function mixToShares(
  entries: ProtelProductionMix[],
  minShare = 0.02,
): { label: string; share: number }[] {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.revenue), 0);
  if (total <= 0) return [];
  const kept = entries
    .map((entry) => ({ label: entry.label, share: Math.max(0, entry.revenue) / total }))
    .filter((entry) => entry.share >= minShare);
  if (!kept.length) return [];
  const keptTotal = kept.reduce((sum, entry) => sum + entry.share, 0);
  return kept.map((entry) => ({ label: entry.label, share: entry.share / keptTotal }));
}
