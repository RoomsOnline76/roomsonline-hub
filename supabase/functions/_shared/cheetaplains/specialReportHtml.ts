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

function shell(
  context: SpecialReportContext,
  title: string,
  notes: string[],
  tableHtml: string,
): string {
  const primary = hex(context.branding.brandPrimary, HOUSE_PRIMARY);
  const rowTint = context.branding.brandPrimary ? tint(primary, 0.78) : HOUSE_TINT;
  const ink = HOUSE_INK;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(pdfDocumentTitle(context.propertyName, title.replace(/\n/g, " "), context.asOfDate ?? ""))}</title>
<style>
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
  .rail { width: 46mm; flex: 0 0 46mm; padding-top: 8mm; }
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
  .board { flex: 1 1 auto; }
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
  td {
    font-size: 7.5pt;
    padding: 1.6mm 3mm;
    text-align: center;
    border-right: 0.6mm solid #FFFFFF;
  }
  td:last-child { border-right: 0; }
  tbody tr:nth-child(odd) td { background: ${rowTint}; }
  tbody tr:nth-child(even) td { background: #FBF8F7; }
  td.name { text-align: center; font-weight: 500; }
  .empty { color: #9A8F8A; }
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
  @media screen { .slide { box-shadow: 0 2px 18px rgba(0,0,0,.14); margin: 8mm auto; } }
</style>
</head>
<body>
  <section class="slide">
    <aside class="rail">
      <h1>${esc(title)}</h1>
      <ul>${notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul>
    </aside>
    <div class="board">${tableHtml}</div>
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
