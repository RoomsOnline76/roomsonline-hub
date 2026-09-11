/**
 * One-page branded PDF for the Daily Detailed Report.
 *
 * Same visual language as the monthly ROL'OS pack (Italiana headings,
 * Instrument Sans body, brand rule, logo bottom right) but a single A4 page:
 * the day, where the month stands, and the movement since the last pack.
 * Figures without a source print as a dash.
 */

import { pdfDocumentTitle } from "../revenueReportHtml.ts";
import type { DailyFigures } from "./dailyDetailed.ts";
import type { DailyGridRow, DailyYearGrid } from "./daySheetGrid.ts";

export interface DailyReportBranding {
  primary: string;
  secondary: string;
  logoUrl: string | null;
}

export interface DailyReportOptions {
  propertyName: string;
  figures: DailyFigures;
  branding: DailyReportBranding;
  /** Optional reviewer note printed under the movement block. */
  note?: string | null;
  /** Text pasted from the day's email, printed verbatim when present. */
  emailNotes?: string | null;
  /**
   * The financial form as it stands on the day's sheet in the workbook — one
   * entry per financial year. Omitted when the run has no running workbook, in
   * which case the report stays a single page.
   */
  yearGrids?: DailyYearGrid[];
}


const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const longDate = (iso: string): string => {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[(month || 1) - 1]} ${year}`;
};

const monthLabel = (iso: string): string => {
  const [year, month] = iso.split("-").map(Number);
  return `${MONTHS[(month || 1) - 1]} ${year}`;
};

const rand = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `R${Math.round(value).toLocaleString("en-ZA")}`;

const pct = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${(value * 100).toFixed(1)}%`;

const num = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value) ? "—" : String(value);

const stat = (label: string, value: string, hint = ""): string =>
  `<div class="stat"><span class="stat-label">${esc(label)}</span><span class="stat-value">${esc(value)}</span>${
    hint ? `<span class="stat-hint">${esc(hint)}</span>` : ""
  }</div>`;

const row = (cells: string[], head = false): string =>
  `<tr>${cells.map((cell) => `<${head ? "th" : "td"}>${cell}</${head ? "th" : "td"}>`).join("")}</tr>`;

/** Short money for chart axes and dense grids: R1.2m, R840k. */
const shortRand = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `R${Math.round(value / 1_000)}k`;
  return `R${Math.round(value)}`;
};

const variance = (row: DailyGridRow): number | null =>
  row.bob === null || row.budget === null ? null : row.bob - row.budget;

/** One financial year's month rows, quarters and total, as the workbook has it. */
const yearTable = (grid: DailyYearGrid): string => {
  const body = grid.rows
    .map((entry) => {
      const cls = entry.kind === "month" ? "" : ` class="sum"`;
      const cells = [
        esc(entry.label),
        shortRand(entry.bob),
        pct(entry.occupancy),
        shortRand(entry.budget),
        shortRand(variance(entry)),
        shortRand(entry.stly),
        pct(entry.stlyOccupancy),
        shortRand(entry.lastYear),
        pct(entry.lastYearOccupancy),
      ];
      return `<tr${cls}>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<table class="grid dense">
  ${row(["Month", "On the books", "Occ %", "Budget", "Vs budget", "STLY", "Occ STLY", "Last year", "Occ LY"], true)}
  ${body}
</table>`;
};

interface ChartSeries {
  name: string;
  colour: string;
  values: (number | null)[];
}

/**
 * The workbook's own graph for one financial year — revenue on the books
 * against budget and against the same time last year — as an inline SVG so the
 * page prints without fetching anything.
 */
const yearChart = (grid: DailyYearGrid, primary: string): string => {
  const months = grid.rows.filter((entry) => entry.kind === "month");
  if (months.length === 0) return "";
  const series: ChartSeries[] = [
    { name: "On the books", colour: primary, values: months.map((entry) => entry.bob) },
    { name: "Budget", colour: "#9CA3AF", values: months.map((entry) => entry.budget) },
    { name: "Same time last year", colour: "#0EA5A4", values: months.map((entry) => entry.stly) },
  ];

  const width = 780;
  const height = 250;
  const left = 62;
  const right = 12;
  const top = 14;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const peak = Math.max(
    1,
    ...series.flatMap((line) => line.values.map((value) => (value === null ? 0 : value))),
  );
  const step = months.length > 1 ? plotWidth / (months.length - 1) : 0;
  const x = (index: number): number => left + index * step;
  const y = (value: number): number => top + plotHeight - (value / peak) * plotHeight;

  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map((fraction) => {
      const value = peak * fraction;
      const at = y(value);
      return `<line x1="${left}" x2="${width - right}" y1="${at}" y2="${at}" stroke="#E5E7EB" />` +
        `<text x="${left - 6}" y="${at + 3}" text-anchor="end" class="axis">${shortRand(value)}</text>`;
    })
    .join("");

  const labels = months
    .map((entry, index) => {
      const short = entry.label.split(" ")[0];
      return `<text x="${x(index)}" y="${height - 12}" text-anchor="middle" class="axis">${esc(short)}</text>`;
    })
    .join("");

  const lines = series
    .map((line) => {
      const points = line.values
        .map((value, index) => (value === null ? null : `${x(index)},${y(value)}`))
        .filter((point): point is string => point !== null)
        .join(" ");
      const dots = line.values
        .map((value, index) =>
          value === null ? "" : `<circle cx="${x(index)}" cy="${y(value)}" r="2.4" fill="${line.colour}" />`,
        )
        .join("");
      return `<polyline points="${points}" fill="none" stroke="${line.colour}" stroke-width="2" />${dots}`;
    })
    .join("");

  const legend = series
    .map(
      (line) =>
        `<span class="key"><i style="background:${line.colour}"></i>${esc(line.name)}</span>`,
    )
    .join("");

  return `<div class="chart">
  <div class="chart-head"><strong>${esc(grid.label)}</strong>${legend}</div>
  <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Revenue on the books against budget and last year for ${esc(grid.label)}">
    ${ticks}${lines}${labels}
  </svg>
</div>`;
};

export interface DailyReportResult {
  html: string;
  documentTitle: string;
}


export function buildDailyReportHtml(options: DailyReportOptions): DailyReportResult {
  const { propertyName, figures, branding } = options;
  const documentTitle = pdfDocumentTitle(propertyName, "Daily Detailed Report", figures.date);

  const dayStats = [
    stat("Villas occupied", num(figures.villasOccupied), figures.villaCount ? `of ${figures.villaCount}` : ""),
    stat("Occupancy", pct(figures.occupancy)),
    stat("Accommodation", rand(figures.accommodation)),
    stat("ADR", rand(figures.adr)),
    stat("Arrivals", num(figures.arrivals)),
    stat("Departures", num(figures.departures)),
  ].join("");

  const monthTable = `<table class="grid">
  ${row(["", "Month to date", `${esc(monthLabel(figures.date))} on the books`], true)}
  ${row(["Accommodation revenue", rand(figures.monthToDate.revenue), rand(figures.monthOnBooks.revenue)])}
  ${row(["Villa nights", num(figures.monthToDate.nights), num(figures.monthOnBooks.nights)])}
  ${row(["Occupancy", pct(figures.monthToDate.occupancy), pct(figures.monthOnBooks.occupancy)])}
  ${row(["ADR", rand(figures.monthToDate.adr), rand(figures.monthOnBooks.adr)])}
</table>`;

  const revenueTable = `<table class="grid">
  ${row(["Revenue on the day", "Value"], true)}
  ${row(["Accommodation", rand(figures.accommodation)])}
  ${row(["Food &amp; beverage", rand(figures.foodAndBeverage)])}
  ${row(["Extras", rand(figures.extras)])}
  ${row(["<strong>Total</strong>", `<strong>${esc(rand(figures.total))}</strong>`])}
</table>`;

  const movementPeriod = figures.created?.period ?? figures.cancelled?.period ?? null;
  const movementTable = `<table class="grid">
  ${row([
    movementPeriod
      ? `Movement ${esc(longDate(movementPeriod.from))} – ${esc(longDate(movementPeriod.to))}`
      : "Movement since the previous pack",
    "Bookings",
    "Value / nights",
  ], true)}
  ${row([
    "Reservations created",
    num(figures.created?.count ?? null),
    figures.created?.value !== null && figures.created?.value !== undefined
      ? rand(figures.created.value)
      : num(figures.created?.nights ?? null),
  ])}
  ${row([
    "Reservations cancelled",
    num(figures.cancelled?.count ?? null),
    figures.cancelled?.value !== null && figures.cancelled?.value !== undefined
      ? rand(figures.cancelled.value)
      : `${num(figures.cancelled?.nights ?? null)} nights`,
  ])}
  ${row([
    "Active enquiries on the books",
    num(figures.enquiries?.nights ?? null),
    rand(figures.enquiries?.revenue ?? null),
  ])}
</table>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(documentTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Italiana&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    --primary: ${esc(branding.primary)};
    --ink: ${esc(branding.secondary)};
    --muted: #6B7280;
    --line: #E5E7EB;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #F3F4F6; color: var(--ink);
    font-family: 'Instrument Sans', 'Helvetica Neue', Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page {
    width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm;
    background: #fff; position: relative; display: flex; flex-direction: column;
  }
  h1 { font-family: 'Italiana', Georgia, serif; font-size: 26pt; margin: 0; font-weight: 400; }
  .sub { color: var(--muted); font-size: 10pt; margin-top: 2mm; }
  .rule { height: 2px; background: var(--primary); margin: 5mm 0 6mm; }
  h2 {
    font-size: 10pt; text-transform: uppercase; letter-spacing: .08em;
    margin: 7mm 0 3mm; color: var(--primary);
  }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .stat { border: 1px solid var(--line); border-radius: 3mm; padding: 4mm; }
  .stat-label { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .stat-value { display: block; font-size: 16pt; font-weight: 600; margin-top: 1mm; }
  .stat-hint { display: block; font-size: 8pt; color: var(--muted); }
  table.grid { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  table.grid th {
    text-align: left; background: var(--primary); color: #fff; padding: 2.4mm 3mm; font-weight: 600;
  }
  table.grid th:not(:first-child), table.grid td:not(:first-child) { text-align: right; }
  table.grid td { padding: 2.2mm 3mm; border-bottom: 1px solid var(--line); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .note { margin-top: 5mm; font-size: 9pt; color: var(--muted); }
  .email { font-size: 9pt; white-space: pre-wrap; border-left: 2px solid var(--primary); padding-left: 3mm; }
  .footer {
    margin-top: auto; padding-top: 6mm; border-top: 1px solid var(--line);
    display: flex; align-items: flex-end; justify-content: space-between;
    font-size: 8pt; color: var(--muted);
  }
  .footer img { height: 16mm; object-fit: contain; }
  @page { size: A4; margin: 0; }
  @media print { body { background: #fff; } .page { margin: 0; } }
</style>
</head>
<body>
<section class="page">
  <h1>${esc(propertyName)}</h1>
  <div class="sub">Daily Detailed Report &middot; ${esc(longDate(figures.date))}</div>
  <div class="rule"></div>

  <h2>The day</h2>
  <div class="stats">${dayStats}</div>

  <h2>${esc(monthLabel(figures.date))}</h2>
  <div class="two">${monthTable}${revenueTable}</div>

  <h2>Movement &amp; enquiries</h2>
  ${movementTable}
  ${options.emailNotes ? `<h2>From the day's email</h2><div class="email">${esc(options.emailNotes)}</div>` : ""}
  ${options.note ? `<div class="note">${esc(options.note)}</div>` : ""}
  <div class="note">Figures without a source in the day's exports print as a dash. Enquiries are provisional business and are not counted in revenue on the books.</div>

  <div class="footer">
    <span>${esc(documentTitle)}</span>
    ${branding.logoUrl ? `<img src="${esc(branding.logoUrl)}" alt="${esc(propertyName)}" />` : ""}
  </div>
</section>
</body>
</html>`;

  return { html, documentTitle };
}
