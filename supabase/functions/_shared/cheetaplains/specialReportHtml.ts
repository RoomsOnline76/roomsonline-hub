/**
 * CheetaPlains specialised owner-report slides (Design Brief §11 — source
 * adapters own their own final layout).
 *
 * Two landscape A4 slides that mirror the signed-off owner pack: a left-hand
 * title column with the reading notes, and a ranked table with a terracotta
 * header band and alternating blush rows. Colours default to the CheetaPlains
 * house palette and are overridden by the property's report branding when it is
 * configured.
 */

import { pdfDocumentTitle } from "../revenueReportHtml.ts";

export interface SpecialReportBranding {
  logoUrl: string | null;
  brandPrimary: string | null;
  brandSecondary: string | null;
}

export interface SpecialReportContext {
  propertyName: string;
  /** ISO as-of date — drives the PDF filename. */
  asOfDate?: string;
  /** Footer stamp, e.g. `OWNER'S REPORT AUGUST 26`. */
  footerLabel: string;
  branding: SpecialReportBranding;
}

export interface NationalitySlideRow {
  country: string;
  currentNights: number;
  currentRevenue: number;
  priorNights: number;
  priorRevenue: number;
}

export interface PartnerSlideRow {
  partner: string;
  nights: number;
  revenue: number;
}

const HOUSE_PRIMARY = "#9C6B58";
const HOUSE_TINT = "#F3DAD1";
const HOUSE_INK = "#332A26";

const esc = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const hex = (value: string | null | undefined, fallback: string): string => {
  const raw = (value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : fallback;
};

/** `57803232.4` → `57,803,232`. Owner packs print whole rand. */
export const zar = (value: number): string =>
  Math.round(Number.isFinite(value) ? value : 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const count = (value: number): string => `${Math.round(Number.isFinite(value) ? value : 0)}`;

/** Lightens a hex colour towards white by `amount` (0..1). */
function tint(color: string, amount: number): string {
  const value = color.replace("#", "");
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const mixed = channels.map((channel) =>
    Math.round(channel + (255 - channel) * Math.min(1, Math.max(0, amount))),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Shared print CSS for every slide in the pack. */
function css(primary: string, rowTint: string, ink: string): string {
  return `
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #E7E5E2; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: ${ink};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .slide {
    position: relative;
    width: 297mm;
    height: 210mm;
    margin: 0 auto;
    background: #FFFFFF;
    padding: 22mm 16mm 18mm 16mm;
    display: flex;
    gap: 10mm;
    page-break-after: always;
  }
  .slide.stack { display: block; }
  .rail { width: 46mm; flex: 0 0 46mm; padding-top: 8mm; }
  .rail.wide { width: 54mm; flex: 0 0 54mm; }
  .rail h1 {
    margin: 0 0 6mm 0;
    font-size: 11.5pt;
    line-height: 1.25;
    letter-spacing: 0.02em;
    font-weight: 700;
    text-transform: uppercase;
    white-space: pre-line;
  }
  .rail p, .rail li { font-size: 7.5pt; line-height: 1.45; margin: 0 0 2mm 0; }
  .rail ul { margin: 0; padding-left: 3.5mm; }
  .rail .callout { margin: 0 0 5mm 0; }
  .rail .callout span { display: block; font-size: 7.5pt; line-height: 1.35; }
  .rail .callout strong { display: block; font-size: 10pt; margin-top: 1mm; }
  .board { flex: 1 1 auto; min-width: 0; }
  table { width: 100%; border-collapse: separate; border-spacing: 0 0.6mm; }
  th {
    background: ${primary};
    color: #FFFFFF;
    font-size: 7pt;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2.4mm 3mm;
    text-align: center;
    border-right: 0.6mm solid #FFFFFF;
  }
  th:last-child { border-right: 0; }
  th.span { letter-spacing: 0.1em; }
  td {
    font-size: 7.5pt;
    padding: 1.6mm 3mm;
    text-align: center;
    border-right: 0.6mm solid #FFFFFF;
  }
  td:last-child { border-right: 0; }
  tbody tr:nth-child(odd) td { background: ${rowTint}; }
  tbody tr:nth-child(even) td { background: #FBF8F7; }
  tbody tr.quarter td { background: #E9E7E4; font-weight: 600; }
  tbody tr.total td { background: ${rowTint}; font-weight: 700; }
  td.name { text-align: center; font-weight: 500; }
  td.left { text-align: left; }
  .pos { color: #1F9254; }
  .neg { color: #C4302B; }
  .empty { color: #9A8F8A; }
  .grid td, .grid th { padding: 1.25mm 1.6mm; font-size: 6.4pt; }
  .prose h1 {
    margin: 0;
    font-size: 15pt;
    font-weight: 700;
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }
  .prose h2 {
    margin: 2mm 0 0 0;
    font-size: 9.5pt;
    font-weight: 400;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #5C514C;
  }
  .prose .underline { width: 34mm; border-bottom: 0.7mm solid ${primary}; margin: 4mm 0 7mm 0; }
  .prose section { margin: 0 0 5mm 0; }
  .prose h3 {
    margin: 0 0 1.5mm 0;
    font-size: 9pt;
    font-weight: 700;
  }
  .prose p { margin: 0 0 1.2mm 0; font-size: 8.2pt; line-height: 1.45; }
  .prose .columns { column-count: 2; column-gap: 10mm; }
  .chartcard { border: 0.3mm solid #D9D5D1; padding: 6mm 6mm 4mm 6mm; height: 100%; }
  .chartcard h1 {
    margin: 0 0 4mm 0;
    text-align: center;
    font-size: 13pt;
    font-weight: 600;
    color: #4A4340;
  }
  .chartcard svg { width: 100%; height: auto; display: block; }
  .legend { display: flex; justify-content: center; gap: 8mm; margin-top: 3mm; }
  .legend span { font-size: 7.5pt; display: flex; align-items: center; gap: 2mm; }
  .legend i { width: 2.4mm; height: 2.4mm; display: inline-block; }
  .foot {
    position: absolute;
    left: 16mm;
    right: 16mm;
    bottom: 9mm;
    display: flex;
    align-items: flex-end;
    gap: 4mm;
  }
  .foot span {
    font-size: 5.5pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6E635E;
    white-space: nowrap;
  }
  .foot .rule { flex: 1 1 auto; border-bottom: 0.4mm solid ${ink}; margin-bottom: 1mm; }
  .foot img { height: 9mm; width: auto; object-fit: contain; }
  @media screen { .slide { box-shadow: 0 2px 18px rgba(0,0,0,.14); margin: 8mm auto; } }`;
}

/** Palette resolved from the property's report branding. */
function palette(context: SpecialReportContext) {
  const primary = hex(context.branding.brandPrimary, HOUSE_PRIMARY);
  return {
    primary,
    rowTint: context.branding.brandPrimary ? tint(primary, 0.78) : HOUSE_TINT,
    ink: HOUSE_INK,
  };
}

/** One landscape slide: shared head, body markup and the footer stamp. */
function frame(
  context: SpecialReportContext,
  documentTitle: string,
  bodyHtml: string,
  slideClass = "",
): string {
  const { primary, rowTint, ink } = palette(context);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(pdfDocumentTitle(context.propertyName, documentTitle.replace(/\n/g, " "), context.asOfDate ?? ""))}</title>
<style>${css(primary, rowTint, ink)}
</style>
</head>
<body>
  <section class="slide${slideClass ? ` ${slideClass}` : ""}">
    ${bodyHtml}
    <div class="foot">
      <span>${esc(context.footerLabel)}</span>
      <div class="rule"></div>
      ${
        context.branding.logoUrl
          ? `<img src="${esc(context.branding.logoUrl)}" alt="${esc(context.propertyName)}" />`
          : ""
      }
    </div>
  </section>
</body>
</html>`;
}

function shell(
  context: SpecialReportContext,
  title: string,
  notes: string[],
  tableHtml: string,
  options: { railHtml?: string; boardClass?: string; wideRail?: boolean } = {},
): string {
  const rail = `<aside class="rail${options.wideRail ? " wide" : ""}">
      <h1>${esc(title)}</h1>
      ${options.railHtml ?? ""}
      ${notes.length ? `<ul>${notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul>` : ""}
    </aside>`;

  return frame(
    context,
    title,
    `${rail}
    <div class="board${options.boardClass ? ` ${options.boardClass}` : ""}">${tableHtml}</div>`,
  );
}


export interface NationalitySlideOptions extends SpecialReportContext {
  currentLabel: string; // e.g. "2026/7"
  priorLabel: string; // e.g. "2025/6"
  rows: NationalitySlideRow[];
  hasPrior: boolean;
}

export function buildNationalitySlide(options: NationalitySlideOptions): string {
  const money = (value: number, show: boolean) =>
    show ? zar(value) : `<span class="empty">—</span>`;

  const body = options.rows
    .map(
      (row) => `<tr>
        <td class="name">${esc(row.country)}</td>
        <td>${count(row.currentNights)}</td>
        <td>${zar(row.currentRevenue)}</td>
        <td>${options.hasPrior ? count(row.priorNights) : `<span class="empty">—</span>`}</td>
        <td>${money(row.priorRevenue, options.hasPrior)}</td>
      </tr>`,
    )
    .join("");

  const table = `<table>
    <thead>
      <tr>
        <th style="width:26%">Country</th>
        <th>Total villa nights ${esc(options.currentLabel)}</th>
        <th>Total revenue ${esc(options.currentLabel)}</th>
        <th>Total villa nights ${esc(options.priorLabel)}</th>
        <th>Total revenue ${esc(options.priorLabel)}</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;

  return shell(
    options,
    "Bookings by\nnationality",
    ["By revenue", "Villa nights include complimentary stays"],
    table,
  );
}

export interface PartnerSlideOptions extends SpecialReportContext {
  currentLabel: string;
  priorLabel: string;
  current: PartnerSlideRow[];
  prior: PartnerSlideRow[];
}

export function buildPartnersSlide(options: PartnerSlideOptions): string {
  const depth = Math.max(options.current.length, options.prior.length);
  const cell = (row: PartnerSlideRow | undefined, hasPrior: boolean) =>
    row
      ? `<td class="name">${esc(row.partner)}</td><td>${count(row.nights)}</td><td>${zar(row.revenue)}</td>`
      : hasPrior
        ? `<td class="empty">—</td><td class="empty">—</td><td class="empty">—</td>`
        : `<td class="empty"></td><td class="empty"></td><td class="empty"></td>`;

  const body = Array.from({ length: depth })
    .map(
      (_, index) =>
        `<tr>${cell(options.current[index], true)}${cell(options.prior[index], options.prior.length > 0)}</tr>`,
    )
    .join("");

  const table = `<table>
    <thead>
      <tr>
        <th style="width:19%">${esc(options.currentLabel)} agency</th>
        <th>${esc(options.currentLabel)} RNs</th>
        <th>${esc(options.currentLabel)} revenue (ZAR)</th>
        <th style="width:19%">${esc(options.priorLabel)} agency</th>
        <th>${esc(options.priorLabel)} RNs</th>
        <th>${esc(options.priorLabel)} revenue (ZAR)</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;

  return shell(
    options,
    "Top booking\ntravel partners",
    [
      `${options.currentLabel} and ${options.priorLabel}`,
      "By revenue",
      "Villa nights include complimentary stays",
    ],
    table,
  );
}

export interface DeclinedSlideRow {
  monthLabel: string;
  value: number;
  agents: string[];
  reason: string;
  /** 0.24 prints as "24%". */
  shareOfMonthRevenue: number | null;
}

export interface DeclinedSlideOptions extends SpecialReportContext {
  /** Period the table covers, e.g. `01 March 2026 – 28 February 2027`. */
  periodLabel: string | null;
  rows: DeclinedSlideRow[];
  total: number | null;
}

/** "Bookings declined due to no availability" — value, agents and reason. */
export function buildDeclinedSlide(options: DeclinedSlideOptions): string {
  const share = (value: number | null) =>
    value === null ? `<span class="empty">—</span>` : `${Math.round(value * 100)}%`;

  const body = options.rows
    .map(
      (row) => `<tr>
        <td class="name">${esc(row.monthLabel)}</td>
        <td>R ${zar(row.value)}</td>
        <td>${row.agents.length ? esc(row.agents.join(", ")) : `<span class="empty">—</span>`}</td>
        <td>${row.reason ? esc(row.reason) : `<span class="empty">—</span>`}</td>
        <td>${share(row.shareOfMonthRevenue)}</td>
      </tr>`,
    )
    .join("");

  const totalRow =
    options.total === null
      ? ""
      : `<tr>
          <td class="name">Total</td>
          <td>R ${zar(options.total)}</td>
          <td></td><td></td><td></td>
        </tr>`;

  const table = `<table>
    <thead>
      <tr>
        <th style="width:11%">Month</th>
        <th style="width:15%">Value of bookings</th>
        <th style="width:30%">Agent / direct</th>
        <th style="width:30%">Reason</th>
        <th>% relative to monthly revenue</th>
      </tr>
    </thead>
    <tbody>${body}${totalRow}</tbody>
  </table>`;

  return shell(
    options,
    "Declined\nbookings",
    [
      "Bookings declined due to no availability",
      ...(options.periodLabel ? [options.periodLabel] : []),
    ],
    table,
  );
}

/* ── Revenue report grid (golden pages 2 and 6) ───────────────── */

export interface RevenueGridRow {
  label: string;
  kind: "month" | "quarter" | "total";
  confirmedBob: number | null;
  budget: number | null;
  activeEnquiries: number | null;
  varianceToBudget: number | null;
  bobStly: number | null;
  lastYearActual: number | null;
  varianceToStly: number | null;
  combined: number | null;
  occupancyBob: number | null;
  occupancyStly: number | null;
  occupancyLastYear: number | null;
}

export interface RevenueGridSlideOptions extends SpecialReportContext {
  /** As printed, e.g. `2026/27`. */
  fiscalLabel: string;
  rows: RevenueGridRow[];
  /** Rail callouts — omitted when the figure could not be rolled up. */
  combinedTotal: number | null;
  varianceCombinedToBudget: number | null;
}

const dash = `<span class="empty">—</span>`;
const cellNumber = (value: number | null): string => (value === null ? dash : zar(value));
const cellSigned = (value: number | null): string =>
  value === null
    ? dash
    : `<span class="${value < 0 ? "neg" : "pos"}">${value < 0 ? "-" : ""}${zar(Math.abs(value))}</span>`;
/** Grids print occupancy either as `0.61` or as `61`. */
const cellPercent = (value: number | null): string => {
  if (value === null) return dash;
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${Math.round(percent)}%`;
};

/** "Revenue report" — the full BOB / budget / STLY / occupancy grid. */
export function buildRevenueGridSlide(options: RevenueGridSlideOptions): string {
  const body = options.rows
    .map(
      (row) => `<tr class="${row.kind}">
        <td class="name">${esc(row.label)}</td>
        <td>${cellNumber(row.confirmedBob)}</td>
        <td>${cellNumber(row.budget)}</td>
        <td>${cellNumber(row.activeEnquiries)}</td>
        <td>${cellSigned(row.varianceToBudget)}</td>
        <td>${cellNumber(row.bobStly)}</td>
        <td>${cellNumber(row.lastYearActual)}</td>
        <td>${cellSigned(row.varianceToStly)}</td>
        <td>${cellNumber(row.combined)}</td>
        <td>${cellPercent(row.occupancyBob)}</td>
        <td>${cellPercent(row.occupancyStly)}</td>
        <td>${cellPercent(row.occupancyLastYear)}</td>
      </tr>`,
    )
    .join("");

  const table = `<table class="grid">
    <thead>
      <tr><th class="span" colspan="12">${esc(options.fiscalLabel)}</th></tr>
      <tr>
        <th style="width:7%">Month</th>
        <th>Confirmed BOB</th>
        <th>Budget</th>
        <th>Active enquiries on the books</th>
        <th>Variance to budget (excl. prov.)</th>
        <th>BOB STLY</th>
        <th>BOB LY actual</th>
        <th>BOB variance to STLY</th>
        <th>Confirmed BOB + active enquiries</th>
        <th>Occupancy BOB</th>
        <th>Occupancy STLY</th>
        <th>Occupancy LY actual</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;

  const callouts = [
    options.combinedTotal === null
      ? ""
      : `<div class="callout"><span>Combined revenue:<br />BOB plus active enquiries</span><strong>R ${zar(options.combinedTotal)}</strong></div>`,
    options.varianceCombinedToBudget === null
      ? ""
      : `<div class="callout"><span>Variance BOB plus active enquiries to budget</span><strong>R ${zar(options.varianceCombinedToBudget)}</strong></div>`,
  ].join("");

  return shell(
    options,
    `Revenue report\n\n${options.fiscalLabel}`,
    ["BOB: business on the books", "STLY: same time last year", "LY: last year"],
    table,
    { railHtml: callouts, boardClass: "grid" },
  );
}

/* ── Grouped bar chart (golden pages 3 and 7) ─────────────────── */

export interface ChartSeries {
  label: string;
  color: string;
  /** One value per category; `null` prints no bar. */
  values: Array<number | null>;
}

export interface BobChartSlideOptions extends SpecialReportContext {
  chartTitle: string;
  categories: string[];
  series: ChartSeries[];
}

/** Axis ceiling rounded up to a readable step (2m, 5m, 10m …). */
function axisMax(values: number[]): { max: number; step: number } {
  const peak = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const step = magnitude * factor;
    if (peak / step <= 10) return { max: Math.ceil(peak / step) * step, step };
  }
  return { max: peak, step: peak / 5 };
}

const axisLabel = (value: number): string =>
  Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/**
 * "BOB, Budget & LY Actual" — grouped bars as inline SVG so the slide prints
 * without a chart runtime.
 */
export function buildBobChartSlide(options: BobChartSlideOptions): string {
  const width = 1000;
  const height = 520;
  const padding = { top: 20, right: 20, bottom: 60, left: 90 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const flat = options.series
    .flatMap((series) => series.values)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const { max, step } = axisMax(flat);
  const y = (value: number) => padding.top + plotHeight - (value / max) * plotHeight;

  const gridLines: string[] = [];
  for (let value = 0; value <= max + 0.001; value += step) {
    const py = y(value);
    gridLines.push(
      `<line x1="${padding.left}" y1="${py}" x2="${width - padding.right}" y2="${py}" stroke="#E2DEDA" stroke-width="1" />`,
      `<text x="${padding.left - 10}" y="${py + 4}" text-anchor="end" font-size="12" fill="#6E635E">${axisLabel(value)}</text>`,
    );
  }

  const slot = plotWidth / Math.max(1, options.categories.length);
  const barWidth = (slot * 0.62) / Math.max(1, options.series.length);
  const bars: string[] = [];
  const labels: string[] = [];
  options.categories.forEach((category, index) => {
    const groupLeft = padding.left + slot * index + slot * 0.19;
    options.series.forEach((series, seriesIndex) => {
      const value = series.values[index];
      if (value === null || !Number.isFinite(value) || value <= 0) return;
      const barHeight = padding.top + plotHeight - y(value);
      bars.push(
        `<rect x="${(groupLeft + barWidth * seriesIndex).toFixed(1)}" y="${y(value).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, barHeight).toFixed(1)}" fill="${series.color}" />`,
      );
    });
    labels.push(
      `<text x="${(padding.left + slot * index + slot / 2).toFixed(1)}" y="${height - padding.bottom + 22}" text-anchor="middle" font-size="13" fill="#4A4340">${esc(category)}</text>`,
    );
  });

  const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.chartTitle)}">
    ${gridLines.join("")}
    <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="#9A8F8A" stroke-width="1" />
    ${bars.join("")}
    ${labels.join("")}
  </svg>`;

  const legend = `<div class="legend">${options.series
    .map(
      (series) =>
        `<span><i style="background:${series.color}"></i>${esc(series.label.toUpperCase())}</span>`,
    )
    .join("")}</div>`;

  return frame(
    options,
    options.chartTitle,
    `<div class="chartcard">
      <h1>${esc(options.chartTitle)}</h1>
      ${svg}
      ${legend}
    </div>`,
    "stack",
  );
}

/* ── Narrative slides (golden pages 1 and 5) ──────────────────── */

export interface NarrativeBlock {
  heading: string | null;
  lines: string[];
}

export interface NarrativeSlideOptions extends SpecialReportContext {
  title: string;
  subtitle: string | null;
  blocks: NarrativeBlock[];
  /** Two-column flow keeps dense updates (page 5) on one slide. */
  columns?: boolean;
}

/** Prose slide — quarter blocks, key takeaways, reservations synopsis. */
export function buildNarrativeSlide(options: NarrativeSlideOptions): string {
  const blocks = options.blocks
    .map(
      (block) => `<section>
        ${block.heading ? `<h3>${esc(block.heading)}</h3>` : ""}
        ${block.lines.map((line) => `<p>${esc(line)}</p>`).join("")}
      </section>`,
    )
    .join("");

  return frame(
    options,
    options.title,
    `<div class="prose" style="width:100%">
      <h1>${esc(options.title)}</h1>
      ${options.subtitle ? `<h2>${esc(options.subtitle)}</h2>` : ""}
      <div class="underline"></div>
      <div class="${options.columns ? "columns" : ""}">${blocks}</div>
    </div>`,
    "stack",
  );
}

/* ── Multi-year partner trend (golden pages 11 and 12) ────────── */

export interface PartnerTrendSlideOptions extends SpecialReportContext {
  title: string;
  /** Year headings, in printed order. */
  columns: string[];
  rows: Array<{ partner: string; values: Array<number | null> }>;
  notes?: string[];
}

/** "Top producing partners" trend — one column per financial year. */
export function buildPartnerTrendSlide(options: PartnerTrendSlideOptions): string {
  const body = options.rows
    .map(
      (row) => `<tr>
        <td class="name left">${esc(row.partner)}</td>
        ${options.columns.map((_, index) => `<td>${cellNumber(row.values[index] ?? null)}</td>`).join("")}
      </tr>`,
    )
    .join("");

  const table = `<table>
    <thead>
      <tr>
        <th style="width:24%">Partner</th>
        ${options.columns.map((column) => `<th>${esc(column)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;

  return shell(options, options.title, options.notes ?? ["By revenue (ZAR)"], table, {
    wideRail: true,
  });
}
