// Builds the branded, print-ready draft revenue report (A4 pages) plus the
// designer asset payload (chart SVGs, table CSVs, JSON manifest).
import {
  DEFAULT_THEME,
  type Chart,
  type ChartTheme,
  compactMoney,
  donutChart,
  groupedBarChart,
  lineChart,
  money,
  monthLabel,
  occupancyStrip,
  percent,
  varianceBarChart,
} from "./revenueReportCharts.ts";

export interface DraftSnapshot {
  months: string[];
  otb_revenue: Record<string, number>;
  previous_otb_revenue: Record<string, number>;
  last_year_actual: Record<string, number>;
  room_nights: Record<string, number>;
  previous_room_nights: Record<string, number>;
  last_year_room_nights: Record<string, number>;
  capacity_days: Record<string, number>;
  additional_revenue: Record<string, number>;
  adr: Record<string, number>;
  occupancy: Record<string, number>;
  source_breakdown: Record<string, { revenue?: number; nights?: number }>;
  room_count: number;
  totals: Record<string, number | undefined>;
}

export interface DraftInputs {
  dinner_by_month: Record<string, number>;
  room0_by_month: Record<string, number>;
  comp_rns_by_month: Record<string, number>;
  min_stay_notes: string | null;
  promotions_notes: string | null;
  rate_override_notes: string | null;
  free_commentary: string | null;
}

export interface DraftBranding {
  logoUrl: string | null;
  coverArtworkUrl: string | null;
  brandPrimary: string | null;
  brandSecondary: string | null;
}

export interface DraftMediaImage {
  url: string;
  caption: string | null;
  /** Optional heading entered by the revenue team for this image's block. */
  sectionTitle?: string | null;
}

export interface DraftMediaSlot {
  key: string;
  section: string;
  title: string;
  layout: "full" | "half";
  images: DraftMediaImage[];
}

export interface DraftOptions {
  propertyName: string;
  asOfDate: string;
  previousAsOfDate: string | null;
  branding: DraftBranding;
  snapshot: DraftSnapshot;
  inputs: DraftInputs;
  /** Screenshots pasted in by the revenue team, already signed for rendering. */
  media?: DraftMediaSlot[];
  /** TOBI lines the reviewer ticked for inclusion, in final (possibly edited) wording. */
  tobiCommentary?: string[];
}



export interface DraftTable {
  name: string;
  csv: string;
}

export interface DraftResult {
  html: string;
  charts: Chart[];
  tables: DraftTable[];
  manifest: Record<string, unknown>;
}

const CONTACT_SITE = "www.roomsonline.co.za";

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

const formatLongDate = (iso: string): string => {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  });
};

const csvCell = (value: string | number): string => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (rows: (string | number)[][]): string =>
  rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

const sum = (map: Record<string, number>, keys: string[]): number =>
  keys.reduce((total, key) => total + (Number(map[key]) || 0), 0);

const notesBlock = (title: string, body: string | null): string => {

  if (!body || !body.trim()) return "";
  return `<div class="note"><h4>${esc(title)}</h4><p>${esc(body.trim()).replace(/\n/g, "<br />")}</p></div>`;
};

const pageChrome = (
  propertyName: string,
  asOf: string,
  logoUrl: string | null,
  sectionTitle: string,
  pageNumber: number,
): { header: string; footer: string } => ({
  header: `
    <header class="page-head">
      <div class="brand">
        ${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="" />` : `<span class="wreath">ROL</span>`}
        <span class="brandline">roomsonline <span class="divider">|</span> ${esc(propertyName)}</span>
      </div>
      <span class="asof">As at ${esc(asOf)}</span>
    </header>
    <h2 class="section-title">${esc(sectionTitle)}</h2>`,
  footer: `
    <footer class="page-foot">
      <span>${esc(propertyName)} · Bi-monthly revenue review</span>
      <span>${CONTACT_SITE}</span>
      <span>${pageNumber}</span>
    </footer>`,
});

export function buildDraftReport(options: DraftOptions): DraftResult {
  const { propertyName, snapshot, inputs, branding } = options;
  const asOfIso = options.asOfDate.slice(0, 10);
  const asOfLabel = formatLongDate(asOfIso);
  const months = snapshot.months.filter(Boolean);
  const labels = months.map(monthLabel);

  const primary = hex(branding.brandPrimary, DEFAULT_THEME.primary);
  const secondary = hex(branding.brandSecondary, DEFAULT_THEME.secondary);
  const theme: ChartTheme = { ...DEFAULT_THEME, primary, secondary, ink: secondary };

  const additionalByMonth: Record<string, number> = {};
  const combinedByMonth: Record<string, number> = {};
  for (const key of months) {
    const additional =
      (Number(inputs.dinner_by_month[key]) || 0) + (Number(inputs.room0_by_month[key]) || 0);
    additionalByMonth[key] = additional;
    combinedByMonth[key] = (Number(snapshot.otb_revenue[key]) || 0) + additional;
  }

  const totalOtb = sum(snapshot.otb_revenue, months);
  const totalPrevious = sum(snapshot.previous_otb_revenue, months);
  const totalLastYear = sum(snapshot.last_year_actual, months);
  const totalAdditional = sum(additionalByMonth, months);
  const totalCombined = sum(combinedByMonth, months);
  const totalNights = sum(snapshot.room_nights, months);
  const totalCapacity = sum(snapshot.capacity_days, months);
  const blendedAdr = totalNights > 0 ? totalOtb / totalNights : 0;
  const blendedOccupancy = totalCapacity > 0 ? totalNights / totalCapacity : 0;

  // ── Charts ────────────────────────────────────────────────────────────
  const charts: Chart[] = [];
  const pushChart = (chart: Chart | null) => {
    if (chart) charts.push(chart);
  };

  // Per-month derived series shared by the charts and the metric grids.
  const num = (map: Record<string, number> | undefined, key: string) => Number(map?.[key]) || 0;
  const otbNow = months.map((key) => num(snapshot.otb_revenue, key));
  const otbPrev = months.map((key) => num(snapshot.previous_otb_revenue, key));
  const otbLy = months.map((key) => num(snapshot.last_year_actual, key));
  const nightsNow = months.map((key) => num(snapshot.room_nights, key));
  const nightsPrev = months.map((key) => num(snapshot.previous_room_nights, key));
  const nightsLy = months.map((key) => num(snapshot.last_year_room_nights, key));
  const capacity = months.map((key) => num(snapshot.capacity_days, key));
  const dinner = months.map((key) => num(inputs.dinner_by_month, key));
  const room0 = months.map((key) => num(inputs.room0_by_month, key));
  const compRns = months.map((key) => num(inputs.comp_rns_by_month, key));
  const additional = months.map((key) => additionalByMonth[key] || 0);
  const combined = months.map((key) => combinedByMonth[key] || 0);

  const ratio = (top: number, bottom: number) => (bottom > 0 ? top / bottom : 0);
  const occNow = months.map((_, i) =>
    (Number(snapshot.occupancy[months[i]]) || ratio(nightsNow[i], capacity[i])) * 100,
  );
  const occPrev = months.map((_, i) => ratio(nightsPrev[i], capacity[i]) * 100);
  const occLy = months.map((_, i) => ratio(nightsLy[i], capacity[i]) * 100);
  const adrNow = months.map((_, i) => Number(snapshot.adr[months[i]]) || ratio(otbNow[i], nightsNow[i]));
  const adrPrev = months.map((_, i) => ratio(otbPrev[i], nightsPrev[i]));
  const adrLy = months.map((_, i) => ratio(otbLy[i], nightsLy[i]));

  const prevLabel = options.previousAsOfDate
    ? `OTB ${formatLongDate(options.previousAsOfDate)}`
    : "Previous OTB";

  // Signed comparison series — the same units as their parent chart.
  const diff = (a: number[], b: number[]) => a.map((value, i) => value - (b[i] ?? 0));
  const VARIANCE_COLOUR = "#7C3AED";
  const VS_LY_COLOUR = "#0EA5A4";

  pushChart(
    groupedBarChart({
      id: "revenue-grouped",
      title: "Revenue — on the books, previous review, last year, variance and combined",
      labels,
      series: [
        { name: `OTB ${asOfLabel}`, colour: primary, values: otbNow },
        { name: prevLabel, colour: "#F5A3D0", values: otbPrev },
        { name: "Last year actual", colour: secondary, values: otbLy },
        { name: "Variance", colour: VARIANCE_COLOUR, values: diff(otbNow, otbPrev) },
        { name: "OTB vs LY", colour: VS_LY_COLOUR, values: diff(otbNow, otbLy) },
        { name: "Additional revenue", colour: "#9CA3AF", values: additional },
        { name: "Total combined", colour: "#4B5563", values: combined },
      ],
      theme,
      height: 340,
    }),
  );

  pushChart(
    groupedBarChart({
      id: "occupancy-grouped",
      title: "Occupancy % — on the books, previous review, last year, variance and OTB vs LY",
      labels,
      series: [
        { name: `OTB ${asOfLabel}`, colour: primary, values: occNow },
        { name: prevLabel, colour: "#F5A3D0", values: occPrev },
        { name: "Last year actual", colour: secondary, values: occLy },
        { name: "Variance (pts)", colour: VARIANCE_COLOUR, values: diff(occNow, occPrev) },
        { name: "OTB vs LY (pts)", colour: VS_LY_COLOUR, values: diff(occNow, occLy) },
      ],
      theme,
      height: 290,
      format: (value) => `${Math.round(value)}%`,
      valueLabels: months.length <= 6,
    }),
  );

  pushChart(
    groupedBarChart({
      id: "adr-grouped",
      title: "Average daily rate — on the books, previous review, last year, variance and OTB vs LY",
      labels,
      series: [
        { name: `OTB ${asOfLabel}`, colour: primary, values: adrNow },
        { name: prevLabel, colour: "#F5A3D0", values: adrPrev },
        { name: "Last year actual", colour: secondary, values: adrLy },
        { name: "Variance", colour: VARIANCE_COLOUR, values: diff(adrNow, adrPrev) },
        { name: "OTB vs LY", colour: VS_LY_COLOUR, values: diff(adrNow, adrLy) },
      ],
      theme,
      height: 290,
      valueLabels: months.length <= 6,
    }),
  );


  pushChart(
    varianceBarChart({
      id: "pickup-variance",
      title: options.previousAsOfDate
        ? `Pickup since ${formatLongDate(options.previousAsOfDate)}`
        : "Pickup since previous review",
      points: months.map((key, i) => ({ label: monthLabel(key), value: otbNow[i] - otbPrev[i] })),
      theme,
    }),
  );

  pushChart(
    lineChart({
      id: "adr-trend",
      title: "Average daily rate trend",
      points: months.map((key, i) => ({ label: monthLabel(key), value: adrNow[i] })),
      theme,
    }),
  );

  pushChart(
    occupancyStrip({
      id: "occupancy",
      title: "Occupancy on the books",
      points: months.map((key, i) => ({ label: monthLabel(key), value: occNow[i] / 100 })),
      theme,
    }),
  );



  const sourceEntries = Object.entries(snapshot.source_breakdown ?? {})
    .map(([name, value]) => ({
      label: name,
      revenue: Number(value?.revenue) || 0,
      nights: Number(value?.nights) || 0,
    }))
    .filter((entry) => entry.revenue > 0 || entry.nights > 0)
    .sort((a, b) => b.revenue - a.revenue);

  pushChart(
    donutChart({
      id: "source-mix",
      title: "Source mix by revenue",
      points: sourceEntries.map((entry) => ({ label: entry.label, value: entry.revenue })),
      palette: [primary, secondary, "#F5A3D0", "#4B5563", "#9CA3AF", "#C084B8"],
      theme,
    }),
  );

  const chartById = new Map(charts.map((chart) => [chart.id, chart]));
  const figure = (id: string, caption?: string): string => {
    const chart = chartById.get(id);
    if (!chart) return "";
    return `<figure class="chart"><figcaption>${esc(caption ?? chart.title)}</figcaption>${chart.svg}</figure>`;
  };

  // ── Totals for the derived series ─────────────────────────────────────
  const add = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const totalDinner = add(dinner);
  const totalRoom0 = add(room0);
  const totalCompRns = add(compRns);
  const totalNightsPrev = add(nightsPrev);
  const totalNightsLy = add(nightsLy);
  const totalOccPrev = totalCapacity > 0 ? (totalNightsPrev / totalCapacity) * 100 : 0;
  const totalOccLy = totalCapacity > 0 ? (totalNightsLy / totalCapacity) * 100 : 0;
  const totalAdrPrev = totalNightsPrev > 0 ? totalPrevious / totalNightsPrev : 0;
  const totalAdrLy = totalNightsLy > 0 ? totalLastYear / totalNightsLy : 0;

  // ── Tables (CSV for the designer pack) ────────────────────────────────
  const revenueRows: (string | number)[][] = [
    [
      "Month",
      "OTB revenue",
      "Previous OTB",
      "Variance",
      "Last year actual",
      "OTB vs last year",
      "Dinner",
      "Room 0",
      "Comp room nights",
      "Additional revenue",
      "Total combined",
    ],
    ...months.map((key, i) => [
      monthLabel(key),
      Math.round(otbNow[i]),
      Math.round(otbPrev[i]),
      Math.round(otbNow[i] - otbPrev[i]),
      Math.round(otbLy[i]),
      Math.round(otbNow[i] - otbLy[i]),
      Math.round(dinner[i]),
      Math.round(room0[i]),
      Math.round(compRns[i]),
      Math.round(additional[i]),
      Math.round(combined[i]),
    ]),
    [
      "Total",
      Math.round(totalOtb),
      Math.round(totalPrevious),
      Math.round(totalOtb - totalPrevious),
      Math.round(totalLastYear),
      Math.round(totalOtb - totalLastYear),
      Math.round(totalDinner),
      Math.round(totalRoom0),
      Math.round(totalCompRns),
      Math.round(totalAdditional),
      Math.round(totalCombined),
    ],
  ];

  const metricCsv = (
    header: string,
    now: number[],
    prev: number[],
    ly: number[],
    totals: { now: number; prev: number; ly: number },
    dp = 0,
  ): (string | number)[][] => {
    const fix = (value: number) => Number(value.toFixed(dp));
    return [
      ["Month", `${header} OTB`, `${header} previous`, "Variance", `${header} last year`, "OTB vs last year"],
      ...months.map((key, i) => [
        monthLabel(key),
        fix(now[i]),
        fix(prev[i]),
        fix(now[i] - prev[i]),
        fix(ly[i]),
        fix(now[i] - ly[i]),
      ]),
      [
        "Total",
        fix(totals.now),
        fix(totals.prev),
        fix(totals.now - totals.prev),
        fix(totals.ly),
        fix(totals.now - totals.ly),
      ],
    ];
  };

  const performanceRows = metricCsv("Room nights", nightsNow, nightsPrev, nightsLy, {
    now: totalNights,
    prev: totalNightsPrev,
    ly: totalNightsLy,
  });
  const occupancyRows = metricCsv(
    "Occupancy %",
    occNow,
    occPrev,
    occLy,
    { now: blendedOccupancy * 100, prev: totalOccPrev, ly: totalOccLy },
    1,
  );
  const adrRows = metricCsv("ADR", adrNow, adrPrev, adrLy, {
    now: blendedAdr,
    prev: totalAdrPrev,
    ly: totalAdrLy,
  });

  const sourceRows: (string | number)[][] = [
    ["Source", "Revenue", "Room nights", "ADR", "Share of revenue %"],
    ...sourceEntries.map((entry) => [
      entry.label,
      Math.round(entry.revenue),
      Math.round(entry.nights),
      Math.round(entry.nights > 0 ? entry.revenue / entry.nights : 0),
      Number(((totalOtb > 0 ? entry.revenue / totalOtb : 0) * 100).toFixed(1)),
    ]),
  ];

  const tables: DraftTable[] = [
    { name: "revenue-performance", csv: toCsv(revenueRows) },
    { name: "room-nights", csv: toCsv(performanceRows) },
    { name: "occupancy", csv: toCsv(occupancyRows) },
    { name: "adr", csv: toCsv(adrRows) },
  ];
  if (sourceEntries.length > 0) {
    tables.push({ name: "source-mix", csv: toCsv(sourceRows) });
  }

  // ── HTML ──────────────────────────────────────────────────────────────
  const kpi = (label: string, value: string, hint?: string): string => `
    <div class="kpi">
      <span class="kpi-label">${esc(label)}</span>
      <span class="kpi-value">${esc(value)}</span>
      ${hint ? `<span class="kpi-hint">${esc(hint)}</span>` : ""}
    </div>`;

  /** Signed delta with a percentage, formatted for the metric in question. */
  const deltaCell = (
    current: number,
    base: number,
    format: (value: number) => string,
    withPct = true,
  ): string => {
    const delta = current - base;
    if (!base && !current) return `<span class="muted">—</span>`;
    const colour = delta >= 0 ? primary : secondary;
    const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
    const pct = base ? Math.abs(delta / base) : 0;
    return `<span style="color:${colour}">${sign}${esc(format(Math.abs(delta)))}${
      withPct && base ? ` <span class="pct">(${sign}${esc(percent(pct, 1))})</span>` : ""
    }</span>`;
  };

  const zar = (value: number) => money(value);
  const nightsFmt = (value: number) => Math.round(value).toLocaleString("en-ZA");
  const pctFmt = (value: number) => `${value.toFixed(1)}%`;

  const revenueTableHtml = `
    <table class="grid tight">
      <thead>
        <tr>
          <th class="left">Month</th>
          <th>OTB ${esc(asOfLabel)}</th>
          <th>${esc(options.previousAsOfDate ? `OTB ${formatLongDate(options.previousAsOfDate)}` : "Previous OTB")}</th>
          <th>Variance</th>
          <th>Last year actual</th>
          <th>OTB vs LY</th>
          <th>Dinner</th>
          <th>Room 0</th>
          <th>Comp RNs</th>
          <th>Additional</th>
          <th>Total combined</th>
        </tr>
      </thead>
      <tbody>
        ${months
          .map(
            (key, i) => `
        <tr>
          <td class="left">${esc(monthLabel(key))}</td>
          <td>${esc(zar(otbNow[i]))}</td>
          <td class="muted">${esc(zar(otbPrev[i]))}</td>
          <td>${deltaCell(otbNow[i], otbPrev[i], compactMoney)}</td>
          <td class="muted">${esc(zar(otbLy[i]))}</td>
          <td>${deltaCell(otbNow[i], otbLy[i], compactMoney)}</td>
          <td class="muted">${dinner[i] ? esc(zar(dinner[i])) : "—"}</td>
          <td class="muted">${room0[i] ? esc(zar(room0[i])) : "—"}</td>
          <td class="muted">${compRns[i] ? nightsFmt(compRns[i]) : "—"}</td>
          <td class="muted">${additional[i] ? esc(zar(additional[i])) : "—"}</td>
          <td class="strong">${esc(zar(combined[i]))}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td class="left">Total</td>
          <td>${esc(zar(totalOtb))}</td>
          <td>${esc(zar(totalPrevious))}</td>
          <td>${deltaCell(totalOtb, totalPrevious, compactMoney)}</td>
          <td>${esc(zar(totalLastYear))}</td>
          <td>${deltaCell(totalOtb, totalLastYear, compactMoney)}</td>
          <td>${totalDinner ? esc(zar(totalDinner)) : "—"}</td>
          <td>${totalRoom0 ? esc(zar(totalRoom0)) : "—"}</td>
          <td>${totalCompRns ? nightsFmt(totalCompRns) : "—"}</td>
          <td>${esc(zar(totalAdditional))}</td>
          <td class="strong">${esc(zar(totalCombined))}</td>
        </tr>
      </tfoot>
    </table>`;

  /** Month × (OTB / previous / variance / last year / OTB vs LY) block. */
  const metricGrid = (
    caption: string,
    now: number[],
    prev: number[],
    ly: number[],
    totals: { now: number; prev: number; ly: number },
    format: (value: number) => string,
  ): string => `
    <div class="block">
      <h3 class="block-title">${esc(caption)}</h3>
      <table class="grid tight">
        <thead>
          <tr>
            <th class="left">Month</th>
            <th>OTB ${esc(asOfLabel)}</th>
            <th>${esc(options.previousAsOfDate ? formatLongDate(options.previousAsOfDate) : "Previous")}</th>
            <th>Variance</th>
            <th>Last year</th>
            <th>OTB vs LY</th>
          </tr>
        </thead>
        <tbody>
          ${months
            .map(
              (key, i) => `
          <tr>
            <td class="left">${esc(monthLabel(key))}</td>
            <td>${esc(format(now[i]))}</td>
            <td class="muted">${esc(format(prev[i]))}</td>
            <td>${deltaCell(now[i], prev[i], format)}</td>
            <td class="muted">${esc(format(ly[i]))}</td>
            <td>${deltaCell(now[i], ly[i], format)}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            <td class="left">${caption === "Occupancy" || caption === "Average daily rate" ? "Blended" : "Total"}</td>
            <td>${esc(format(totals.now))}</td>
            <td>${esc(format(totals.prev))}</td>
            <td>${deltaCell(totals.now, totals.prev, format)}</td>
            <td>${esc(format(totals.ly))}</td>
            <td>${deltaCell(totals.now, totals.ly, format)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  const nightsTableHtml = metricGrid(
    "Room nights",
    nightsNow,
    nightsPrev,
    nightsLy,
    { now: totalNights, prev: totalNightsPrev, ly: totalNightsLy },
    nightsFmt,
  );
  const occupancyTableHtml = metricGrid(
    "Occupancy",
    occNow,
    occPrev,
    occLy,
    { now: blendedOccupancy * 100, prev: totalOccPrev, ly: totalOccLy },
    pctFmt,
  );
  const adrTableHtml = metricGrid(
    "Average daily rate",
    adrNow,
    adrPrev,
    adrLy,
    { now: blendedAdr, prev: totalAdrPrev, ly: totalAdrLy },
    zar,
  );

  /** Revenue Comparison Review — OTB vs last year on revenue and ADR. */
  const comparisonReviewHtml = `
    <div class="block">
      <h3 class="block-title">Revenue comparison review</h3>
      <table class="grid tight">
        <thead>
          <tr>
            <th class="left">Month</th>
            <th>Revenue OTB</th>
            <th>Revenue last year</th>
            <th>Revenue %</th>
            <th>ADR OTB</th>
            <th>ADR last year</th>
            <th>ADR %</th>
            <th>Occupancy OTB</th>
            <th>Occupancy last year</th>
          </tr>
        </thead>
        <tbody>
          ${months
            .map(
              (key, i) => `
          <tr>
            <td class="left">${esc(monthLabel(key))}</td>
            <td>${esc(zar(otbNow[i]))}</td>
            <td class="muted">${esc(zar(otbLy[i]))}</td>
            <td>${otbLy[i] ? deltaCell(otbNow[i], otbLy[i], compactMoney) : `<span class="muted">—</span>`}</td>
            <td>${esc(zar(adrNow[i]))}</td>
            <td class="muted">${esc(zar(adrLy[i]))}</td>
            <td>${adrLy[i] ? deltaCell(adrNow[i], adrLy[i], zar) : `<span class="muted">—</span>`}</td>
            <td>${esc(pctFmt(occNow[i]))}</td>
            <td class="muted">${esc(pctFmt(occLy[i]))}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            <td class="left">Total</td>
            <td>${esc(zar(totalOtb))}</td>
            <td>${esc(zar(totalLastYear))}</td>
            <td>${totalLastYear ? deltaCell(totalOtb, totalLastYear, compactMoney) : `<span class="muted">—</span>`}</td>
            <td>${esc(zar(blendedAdr))}</td>
            <td>${esc(zar(totalAdrLy))}</td>
            <td>${totalAdrLy ? deltaCell(blendedAdr, totalAdrLy, zar) : `<span class="muted">—</span>`}</td>
            <td>${esc(pctFmt(blendedOccupancy * 100))}</td>
            <td>${esc(pctFmt(totalOccLy))}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  const legendHtml = `
    <ul class="legend">
      <li><span class="swatch" style="background:${primary}"></span> OTB as at ${esc(asOfLabel)}</li>
      <li><span class="swatch" style="background:#F5A3D0"></span> ${esc(options.previousAsOfDate ? `OTB as at ${formatLongDate(options.previousAsOfDate)}` : "Previous review")}</li>
      <li><span class="swatch" style="background:${secondary}"></span> Last year actual</li>
      <li class="legend-note">All provisional bookings are included in these figures.</li>
    </ul>`;


  const sourceTableHtml =
    sourceEntries.length === 0
      ? ""
      : `
    <table class="grid">
      <thead>
        <tr>
          <th class="left">Source</th>
          <th>Revenue</th>
          <th>Room nights</th>
          <th>ADR</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>
        ${sourceEntries
          .map(
            (entry) => `
        <tr>
          <td class="left">${esc(entry.label)}</td>
          <td>${esc(money(entry.revenue))}</td>
          <td class="muted">${Math.round(entry.nights).toLocaleString("en-ZA")}</td>
          <td class="muted">${esc(money(entry.nights > 0 ? entry.revenue / entry.nights : 0))}</td>
          <td>${esc(percent(totalOtb > 0 ? entry.revenue / totalOtb : 0, 1))}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;

  const commentary = [
    notesBlock("Minimum stay", inputs.min_stay_notes),
    notesBlock("Promotions", inputs.promotions_notes),
    notesBlock("Rate overrides", inputs.rate_override_notes),
    notesBlock("Commentary", inputs.free_commentary),
  ]
    .filter(Boolean)
    .join("");

  const chrome = (title: string, page: number) =>
    pageChrome(propertyName, asOfLabel, branding.logoUrl, title, page);

  // ── Pasted media (revenue-team screenshots) ───────────────────────────
  const mediaSlots = (options.media ?? []).filter((slot) => slot.images.length > 0);
  const mediaSections: { section: string; slots: DraftMediaSlot[] }[] = [];
  for (const slot of mediaSlots) {
    const existing = mediaSections.find((entry) => entry.section === slot.section);
    if (existing) existing.slots.push(slot);
    else mediaSections.push({ section: slot.section, slots: [slot] });
  }

  // Images within a slot are grouped by the title the reviewer typed, so each
  // named section prints under its own heading; untitled images keep the slot name.
  const mediaSlotHtml = (slot: DraftMediaSlot): string => {
    const groups: { heading: string; images: DraftMediaImage[] }[] = [];
    for (const image of slot.images) {
      const heading = (image.sectionTitle ?? "").trim() || slot.title;
      const existing = groups.find((group) => group.heading === heading);
      if (existing) existing.images.push(image);
      else groups.push({ heading, images: [image] });
    }
    return groups
      .map(
        (group) => `
    <div class="block">
      <h3 class="block-title">${esc(group.heading)}</h3>
      <div class="shots ${slot.layout === "half" ? "two-up" : "one-up"}">
        ${group.images
          .map(
            (image) => `
        <figure class="shot">
          <img src="${esc(image.url)}" alt="${esc(group.heading)}" />
          ${image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : ""}
        </figure>`,
          )
          .join("")}
      </div>
    </div>`,
      )
      .join("");
  };

  // ── TOBI commentary the reviewer ticked for inclusion ─────────────────
  const tobiLines = (options.tobiCommentary ?? [])
    .flatMap((entry) => String(entry ?? "").split(/\n+/))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const tobiHtml =
    tobiLines.length > 0
      ? `
    <div class="notes">
      <div class="note">
        <h4>Revenue Commentary</h4>
        <ul class="tobi">${tobiLines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      </div>
    </div>`
      : "";


  const notesPageBody = `
    ${commentary ? `<div class="notes">${commentary}</div>` : ""}
    <ul class="fineprint">
      <li><strong>OTB</strong> — On The Books: confirmed and provisional reservations captured at the as-of date.</li>
      <li>All provisional bookings are included in the figures above, in line with the standard revenue review.</li>
      <li>Revenue and room nights are allocated to the month of arrival.</li>
      <li>Occupancy uses ${snapshot.room_count} sellable room${snapshot.room_count === 1 ? "" : "s"}; Room 0, events and holding-in-credit rows are excluded from the denominator.</li>
      <li>Additional revenue covers dinner and Room 0 as captured by the reviewer, and is shown separately from accommodation revenue.</li>
      <li>This is a draft for the revenue team — screenshots and commentary can be added before it is issued.</li>
    </ul>
    <div class="contact">
      <div>
        <h4>Prepared by</h4>
        Rooms Online Revenue Team
      </div>
      <div>
        <h4>Property</h4>
        ${esc(propertyName)}
      </div>
      <div>
        <h4>Online</h4>
        ${CONTACT_SITE}
      </div>
    </div>`;

  const revenueKpis = `
    <div class="kpis">
      ${kpi("OTB revenue", money(totalOtb), `${months.length} month window`)}
      ${kpi(
        "vs previous review",
        `${totalOtb - totalPrevious >= 0 ? "+" : "-"}${compactMoney(Math.abs(totalOtb - totalPrevious))}`,
        options.previousAsOfDate
          ? `since ${formatLongDate(options.previousAsOfDate)}`
          : "no previous review",
      )}
      ${kpi(
        "vs last year",
        totalLastYear > 0
          ? `${totalOtb - totalLastYear >= 0 ? "+" : "-"}${compactMoney(Math.abs(totalOtb - totalLastYear))}`
          : "—",
        totalLastYear > 0 ? `LY ${compactMoney(totalLastYear)}` : "no baseline captured",
      )}
      ${kpi("Total combined", money(totalCombined), `incl. ${compactMoney(totalAdditional)} additional`)}
    </div>`;

  const performanceKpis = `
    <div class="kpis">
      ${kpi("Room nights", nightsFmt(totalNights), `of ${nightsFmt(totalCapacity)} available`)}
      ${kpi("Occupancy", pctFmt(blendedOccupancy * 100), "on the books")}
      ${kpi("Blended ADR", money(blendedAdr), "OTB revenue / room nights")}
      ${kpi("Additional revenue", money(totalAdditional), "dinner + room 0")}
    </div>`;

  const pageDefs: { title: string; body: string }[] = [
    {
      title: "Revenue Performance",
      body: `${revenueKpis}${revenueTableHtml}${tobiHtml}${legendHtml}`,
    },
    { title: "Room Nights & Occupancy", body: `${performanceKpis}${nightsTableHtml}${occupancyTableHtml}` },
    { title: "Rate & Comparison Review", body: `${adrTableHtml}${comparisonReviewHtml}${legendHtml}` },
    {
      title: "Revenue Review",
      body: `${figure("revenue-grouped")}${figure("occupancy-grouped")}${figure("adr-grouped")}`,
    },
    { title: "Pickup & Rate Trend", body: `${figure("pickup-variance")}${figure("adr-trend")}` },
    ...(sourceEntries.length > 0
      ? [
          {
            title: "Traveller Trends",
            body: `${figure("source-mix")}${sourceTableHtml}${figure("occupancy")}`,
          },
        ]
      : []),
    ...mediaSections.map((entry) => ({
      title: entry.section,
      body: entry.slots.map(mediaSlotHtml).join(""),
    })),
    { title: "Process Notes", body: notesPageBody },
  ].filter((def) => def.body.trim().length > 0);


  const pagesHtml = pageDefs
    .map((def, index) => {
      const page = chrome(def.title, index + 2);
      return `<section class="page">
  ${page.header}
  <div class="body">${def.body}</div>
  ${page.footer}
</section>`;
    })
    .join("\n\n");


  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(propertyName)} · Revenue Review ${esc(asOfLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Italiana&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    --primary: ${primary};
    --secondary: ${secondary};
    --ink: ${secondary};
    --muted: #6B7280;
    --line: #E5E7EB;
    --page-w: 210mm;
    --page-h: 297mm;
    --pad: 14mm;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #F3F4F6;
    color: var(--ink);
    font-family: 'Instrument Sans', 'Helvetica Neue', Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    position: relative;
    width: var(--page-w);
    min-height: var(--page-h);
    margin: 8mm auto;
    padding: var(--pad);
    background: #fff;
    box-shadow: 0 1px 12px rgba(15, 23, 42, 0.12);
    display: flex;
    flex-direction: column;
  }
  /* Only break between pages — never inside one, and never on an empty page. */
  .page + .page { break-before: page; page-break-before: always; }
  .page:empty { display: none; }

  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8mm;
    padding-bottom: 4mm;
    border-bottom: 1px solid var(--line);
  }
  .brand { display: flex; align-items: center; gap: 3mm; min-width: 0; }
  .logo { height: 12mm; width: auto; max-width: 40mm; object-fit: contain; }
  .wreath {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 11mm; height: 11mm;
    border: 1.5px solid var(--primary);
    border-radius: 50%;
    color: var(--primary);
    font-size: 8pt;
    letter-spacing: 0.06em;
  }
  .brandline { font-size: 10pt; letter-spacing: 0.02em; }
  .brandline .divider { color: var(--muted); margin: 0 1mm; }
  .asof { font-size: 9pt; color: var(--muted); white-space: nowrap; }
  .section-title {
    font-family: 'Italiana', Georgia, serif;
    font-size: 26pt;
    font-weight: 400;
    letter-spacing: 0.01em;
    margin: 7mm 0 4mm;
  }
  .page-foot {
    margin-top: auto;
    padding-top: 4mm;
    border-top: 1px solid var(--line);
    display: flex;
    justify-content: space-between;
    gap: 4mm;
    font-size: 8pt;
    color: var(--muted);
  }
  .body { flex: 1; display: flex; flex-direction: column; gap: 5mm; }

  /* Cover */
  .cover { padding: 0; }
  .cover-art {
    height: 128mm;
    background: linear-gradient(160deg, var(--secondary), color-mix(in srgb, var(--secondary) 65%, #000));
    background-size: cover;
    background-position: center;
    position: relative;
  }
  .cover-body { padding: 14mm; display: flex; flex-direction: column; flex: 1; gap: 6mm; }
  .cover-kicker {
    font-size: 9pt;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--primary);
  }
  .cover-title {
    font-family: 'Italiana', Georgia, serif;
    font-size: 40pt;
    line-height: 1.05;
    margin: 0;
    font-weight: 400;
  }
  .cover-property { font-size: 15pt; letter-spacing: 0.01em; }
  .cover-meta { font-size: 10pt; color: var(--muted); }
  .cover-rule { height: 2px; width: 34mm; background: var(--primary); }

  /* KPI band */
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
  .kpi {
    border: 1px solid var(--line);
    border-top: 2px solid var(--primary);
    border-radius: 2mm;
    padding: 3.5mm;
    display: flex;
    flex-direction: column;
    gap: 1mm;
  }
  .kpi-label { font-size: 7.5pt; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .kpi-value { font-size: 15pt; font-weight: 600; }
  .kpi-hint { font-size: 8pt; color: var(--muted); }

  /* Charts */
  figure.chart { margin: 0; }
  figure.chart figcaption {
    font-size: 8.5pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 2mm;
  }
  figure.chart svg { width: 100%; height: auto; display: block; }

  /* Tables */
  table.grid { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.grid th, table.grid td {
    padding: 2mm 2.5mm;
    text-align: right;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  table.grid th {
    font-size: 7.5pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 500;
    border-bottom: 1.5px solid var(--primary);
  }
  table.grid td.left, table.grid th.left { text-align: left; }
  table.grid tbody tr:nth-child(even) { background: #FAFAFB; }
  table.grid tfoot td {
    font-weight: 600;
    border-top: 1.5px solid var(--secondary);
    border-bottom: none;
  }
  table.grid .muted { color: var(--muted); }
  table.grid .strong { font-weight: 600; }
  .pct { font-size: 8pt; }
  /* Wide 9-11 column grids — tighter type so nothing wraps or clips. */
  table.grid.tight { font-size: 7.2pt; table-layout: fixed; }
  table.grid.tight th {
    font-size: 6.2pt;
    letter-spacing: 0.03em;
    white-space: normal;
    line-height: 1.2;
    vertical-align: bottom;
  }
  table.grid.tight th, table.grid.tight td { padding: 1.1mm 1mm; }
  table.grid.tight td { white-space: normal; }
  /* Variance percentage drops under the amount so wide grids never clip. */
  table.grid.tight .pct { display: block; font-size: 6.2pt; }

  /* Titled content blocks */
  .block { display: flex; flex-direction: column; gap: 2mm; break-inside: avoid; }
  .block-title {
    margin: 0;
    font-size: 8.5pt;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 500;
  }

  /* Legend under the grids */
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 2mm 6mm;
    font-size: 8pt;
    color: var(--muted);
  }
  .legend li { display: flex; align-items: center; gap: 1.5mm; }
  .legend .swatch { width: 3mm; height: 3mm; border-radius: 0.6mm; display: inline-block; }
  .legend .legend-note { font-style: italic; }

  /* Pasted screenshots */
  .shots { display: grid; gap: 3mm; }
  .shots.one-up { grid-template-columns: 1fr; }
  .shots.two-up { grid-template-columns: 1fr 1fr; }
  figure.shot { margin: 0; break-inside: avoid; }
  figure.shot img {
    width: 100%;
    height: auto;
    display: block;
    border: 1px solid var(--line);
    border-radius: 1.5mm;
  }
  figure.shot figcaption { margin-top: 1.5mm; font-size: 8pt; color: var(--muted); }



  /* Notes */
  .notes { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .note { border-left: 2px solid var(--primary); padding-left: 3mm; }
  .note h4 {
    margin: 0 0 1mm;
    font-size: 8pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 500;
  }
  .note p { margin: 0; font-size: 9.5pt; line-height: 1.5; }
  ul.tobi { margin: 0; padding-left: 4mm; font-size: 9.5pt; line-height: 1.55; }
  ul.tobi li { margin: 0 0 1mm; }

  .fineprint { font-size: 8.5pt; color: var(--muted); line-height: 1.6; }
  .fineprint li { margin-bottom: 1.5mm; }
  .contact { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; font-size: 9pt; }
  .contact h4 {
    margin: 0 0 1mm;
    font-size: 8pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 500;
  }

  @page { size: A4; margin: 0; }
  @media print {
    html, body { margin: 0; padding: 0; background: #fff; width: auto; }
    /* Exactly one sheet per .page: no outer margin (which triggers Chromium's
       shrink-to-fit) and a hair under 297mm so rounding never spills over. */
    .page {
      margin: 0;
      box-shadow: none;
      width: auto;
      min-height: 0;
      height: 296.6mm;
      overflow: hidden;
    }
  }

</style>
</head>
<body>

<!-- Cover -->
<section class="page cover">
  <div class="cover-art"${
    branding.coverArtworkUrl
      ? ` style="background-image:url('${esc(branding.coverArtworkUrl)}')"`
      : ""
  }></div>
  <div class="cover-body">
    <div class="brand">
      ${
        branding.logoUrl
          ? `<img class="logo" src="${esc(branding.logoUrl)}" alt="" />`
          : `<span class="wreath">ROL</span>`
      }
      <span class="brandline">roomsonline</span>
    </div>
    <span class="cover-kicker">Bi-monthly revenue review</span>
    <h1 class="cover-title">Revenue<br />Review</h1>
    <div class="cover-rule"></div>
    <div class="cover-property">${esc(propertyName)}</div>
    <div class="cover-meta">
      On the books as at ${esc(asOfLabel)}<br />
      ${months.length} month window · ${snapshot.room_count} sellable room${snapshot.room_count === 1 ? "" : "s"}
    </div>
    <div style="margin-top:auto" class="cover-meta">${CONTACT_SITE}</div>
  </div>
</section>

${pagesHtml}


</body>
</html>`;

  const manifest = {
    property: propertyName,
    as_of_date: asOfIso,
    previous_as_of_date: options.previousAsOfDate,
    generated_at: new Date().toISOString(),
    room_count: snapshot.room_count,
    branding: { primary, secondary, logo_url: branding.logoUrl, cover_url: branding.coverArtworkUrl },
    months,
    totals: {
      otb_revenue: Math.round(totalOtb),
      previous_otb_revenue: Math.round(totalPrevious),
      last_year_actual: Math.round(totalLastYear),
      additional_revenue: Math.round(totalAdditional),
      total_combined: Math.round(totalCombined),
      room_nights: Math.round(totalNights),
      capacity_nights: Math.round(totalCapacity),
      adr: Math.round(blendedAdr),
      occupancy: Number((blendedOccupancy * 100).toFixed(1)),
    },
    by_month: months.map((key) => ({
      month: key,
      label: monthLabel(key),
      otb_revenue: Math.round(Number(snapshot.otb_revenue[key]) || 0),
      previous_otb_revenue: Math.round(Number(snapshot.previous_otb_revenue[key]) || 0),
      last_year_actual: Math.round(Number(snapshot.last_year_actual[key]) || 0),
      additional_revenue: Math.round(additionalByMonth[key] || 0),
      total_combined: Math.round(combinedByMonth[key] || 0),
      room_nights: Math.round(Number(snapshot.room_nights[key]) || 0),
      previous_room_nights: Math.round(Number(snapshot.previous_room_nights?.[key]) || 0),
      last_year_room_nights: Math.round(Number(snapshot.last_year_room_nights?.[key]) || 0),
      capacity_nights: Math.round(Number(snapshot.capacity_days[key]) || 0),
      adr: Math.round(Number(snapshot.adr[key]) || 0),
      occupancy: Number(((Number(snapshot.occupancy[key]) || 0) * 100).toFixed(1)),
      dinner: Math.round(Number(inputs.dinner_by_month[key]) || 0),
      room0: Math.round(Number(inputs.room0_by_month[key]) || 0),
      comp_room_nights: Math.round(Number(inputs.comp_rns_by_month[key]) || 0),
    })),
    source_mix: sourceEntries.map((entry) => ({
      source: entry.label,
      revenue: Math.round(entry.revenue),
      room_nights: Math.round(entry.nights),
      share: Number(((totalOtb > 0 ? entry.revenue / totalOtb : 0) * 100).toFixed(1)),
    })),
    commentary: {
      min_stay: inputs.min_stay_notes,
      promotions: inputs.promotions_notes,
      rate_overrides: inputs.rate_override_notes,
      free_commentary: inputs.free_commentary,
      tobi: tobiLines,
    },
    media: mediaSlots.map((slot) => ({
      slot: slot.key,
      section: slot.section,
      title: slot.title,
      images: slot.images.length,
      section_titles: Array.from(
        new Set(slot.images.map((image) => (image.sectionTitle ?? "").trim()).filter(Boolean)),
      ),
    })),

    pages: pageDefs.map((def, index) => ({ page: index + 2, title: def.title })),
    charts: charts.map((chart) => ({ id: chart.id, title: chart.title, file: `charts/${chart.id}.svg` })),
    tables: tables.map((table) => ({ name: table.name, file: `tables/${table.name}.csv` })),

  };

  return { html, charts, tables, manifest };
}
