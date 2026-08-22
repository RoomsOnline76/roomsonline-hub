// Hand-rolled inline SVG charts for the branded draft revenue report.
// No chart dependency: deterministic markup that prints cleanly and can also be
// shipped as standalone .svg files inside the Canva asset pack.

export interface ChartTheme {
  primary: string;
  secondary: string;
  ink: string;
  muted: string;
  grid: string;
  surface: string;
}

export interface ChartSeriesPoint {
  label: string;
  value: number;
}

export interface Chart {
  id: string;
  title: string;
  svg: string;
}

const FONT =
  "'Instrument Sans', 'Helvetica Neue', Arial, sans-serif";

export const DEFAULT_THEME: ChartTheme = {
  primary: "#E91E8C",
  secondary: "#1A1A2E",
  ink: "#1A1A2E",
  muted: "#6B7280",
  grid: "#E5E7EB",
  surface: "#FFFFFF",
};

const esc = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const round = (value: number, dp = 2): number => {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

/** Compact ZAR label used on axes and bar tops (R1.2k / R340k / R1.4m). */
export const compactMoney = (value: number): string => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}R${round(abs / 1_000_000, 1)}m`;
  // Keep one decimal below R10k so ADR bars read R1.8k / R2.3k, not a flat R2k.
  if (abs >= 10_000) return `${sign}R${Math.round(abs / 1_000)}k`;
  if (abs >= 1_000) return `${sign}R${round(abs / 1_000, 1)}k`;
  return `${sign}R${Math.round(abs)}`;
};

export const money = (value: number): string => {
  const abs = Math.round(Math.abs(value));
  const grouped = abs.toLocaleString("en-ZA");
  return value < 0 ? `(R${grouped})` : `R${grouped}`;
};

export const percent = (value: number, dp = 1): string =>
  `${round(value * 100, dp).toFixed(dp)}%`;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** `2026-08` → `Aug 26`. */
export const monthLabel = (key: string): string => {
  const [year, month] = key.split("-");
  const index = Number(month) - 1;
  if (!MONTH_LABELS[index]) return key;
  return `${MONTH_LABELS[index]} ${year.slice(2)}`;
};

/** Rounded "nice" axis maximum so gridlines land on readable numbers. */
const niceMax = (raw: number): number => {
  if (raw <= 0) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const magnitude = 10 ** exponent;
  const normalised = raw / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
};

const wrap = (width: number, height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${FONT}" role="img">${body}</svg>`;

const axisLabel = (x: number, y: number, text: string, theme: ChartTheme, anchor = "middle") =>
  `<text x="${round(x)}" y="${round(y)}" fill="${theme.muted}" font-size="10" text-anchor="${anchor}">${esc(text)}</text>`;

/**
 * Grouped vertical bars — the report's signature chart (revenue, occupancy, ADR).
 * Supports any number of series, signed values around a real zero line, an
 * optional axis formatter and optional value labels above each bar.
 * Series with no non-zero values are dropped so the chart never prints blank bars.
 */
export function groupedBarChart(options: {
  id: string;
  title: string;
  labels: string[];
  series: { name: string; colour: string; values: number[] }[];
  theme: ChartTheme;
  width?: number;
  height?: number;
  /** Axis + label formatter. Defaults to compact ZAR. */
  format?: (value: number) => string;
  /** Print a small value label above each bar (skip for dense charts). */
  valueLabels?: boolean;
}): Chart | null {
  const { id, title, labels, theme } = options;
  const format = options.format ?? compactMoney;
  const series = options.series.filter((entry) =>
    entry.values.some((value) => Number.isFinite(value) && value !== 0),
  );
  if (labels.length === 0 || series.length === 0) return null;

  const width = options.width ?? 720;
  const legendRows = Math.ceil(series.length / 3);
  const height = options.height ?? 300;
  const padding = { top: 22 + legendRows * 16, right: 16, bottom: 46, left: 62 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const flat = series.flatMap((entry) =>
    entry.values.filter((value) => Number.isFinite(value)),
  );
  const rawMax = Math.max(0, ...flat);
  const rawMin = Math.min(0, ...flat);
  const max = niceMax(rawMax);
  const min = rawMin < 0 ? -niceMax(Math.abs(rawMin)) : 0;
  const span = max - min || 1;
  const yFor = (value: number) => padding.top + plotHeight - ((value - min) / span) * plotHeight;
  const zeroY = yFor(0);

  const groupWidth = plotWidth / labels.length;
  const barGap = series.length > 3 ? 1.5 : 3;
  const barWidth = Math.max(
    3,
    (groupWidth * 0.74 - barGap * (series.length - 1)) / series.length,
  );

  const parts: string[] = [];

  // Gridlines + value axis
  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const value = min + (span / ticks) * i;
    const y = yFor(value);
    parts.push(
      `<line x1="${padding.left}" y1="${round(y)}" x2="${padding.left + plotWidth}" y2="${round(y)}" stroke="${theme.grid}" stroke-width="1" />`,
    );
    parts.push(axisLabel(padding.left - 8, y + 3.5, format(value), theme, "end"));
  }
  // Emphasised zero baseline when the chart crosses it.
  if (min < 0) {
    parts.push(
      `<line x1="${padding.left}" y1="${round(zeroY)}" x2="${padding.left + plotWidth}" y2="${round(zeroY)}" stroke="${theme.ink}" stroke-width="1.2" />`,
    );
  }

  labels.forEach((label, index) => {
    const groupStart =
      padding.left + groupWidth * index + (groupWidth - (barWidth * series.length + barGap * (series.length - 1))) / 2;
    series.forEach((entry, seriesIndex) => {
      const raw = Number(entry.values[index]);
      const value = Number.isFinite(raw) ? raw : 0;
      const top = yFor(Math.max(value, 0));
      const bottom = yFor(Math.min(value, 0));
      const barHeight = Math.max(bottom - top, value !== 0 ? 1.5 : 0);
      const x = groupStart + seriesIndex * (barWidth + barGap);
      if (barHeight <= 0) return;
      parts.push(
        `<rect x="${round(x)}" y="${round(top)}" width="${round(barWidth)}" height="${round(barHeight)}" rx="1.5" fill="${entry.colour}" />`,
      );
      if (options.valueLabels && value !== 0) {
        parts.push(
          `<text x="${round(x + barWidth / 2)}" y="${round(value >= 0 ? top - 4 : bottom + 9)}" fill="${theme.muted}" font-size="7.5" text-anchor="middle">${esc(format(value))}</text>`,
        );
      }
    });
    parts.push(axisLabel(padding.left + groupWidth * (index + 0.5), height - 24, label, theme));
  });

  // Legend — wraps onto extra rows for 4+ series.
  const perRow = Math.ceil(series.length / legendRows);
  series.forEach((entry, index) => {
    const row = Math.floor(index / perRow);
    const column = index % perRow;
    const legendY = 14 + row * 16;
    const legendX = padding.left + column * (plotWidth / perRow);
    parts.push(
      `<rect x="${round(legendX)}" y="${legendY - 8}" width="9" height="9" rx="2" fill="${entry.colour}" />`,
      `<text x="${round(legendX + 14)}" y="${legendY}" fill="${theme.ink}" font-size="10">${esc(entry.name)}</text>`,
    );
  });

  return { id, title, svg: wrap(width, height, parts.join("")) };
}


/** Diverging bars around a zero baseline — used for pickup variance. */
export function varianceBarChart(options: {
  id: string;
  title: string;
  points: ChartSeriesPoint[];
  theme: ChartTheme;
  width?: number;
  height?: number;
}): Chart | null {
  const { id, title, points, theme } = options;
  const usable = points.filter((point) => Number.isFinite(point.value));
  if (usable.length === 0 || usable.every((point) => point.value === 0)) return null;

  const width = options.width ?? 720;
  const height = options.height ?? 260;
  const padding = { top: 22, right: 16, bottom: 40, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = niceMax(Math.max(...usable.map((point) => Math.abs(point.value))));
  const zeroY = padding.top + plotHeight / 2;
  const half = plotHeight / 2;
  const slot = plotWidth / usable.length;
  const barWidth = Math.max(8, slot * 0.5);

  const parts: string[] = [
    `<line x1="${padding.left}" y1="${round(zeroY)}" x2="${padding.left + plotWidth}" y2="${round(zeroY)}" stroke="${theme.grid}" stroke-width="1.5" />`,
    axisLabel(padding.left - 8, padding.top + 4, compactMoney(max), theme, "end"),
    axisLabel(padding.left - 8, padding.top + plotHeight + 4, compactMoney(-max), theme, "end"),
  ];

  usable.forEach((point, index) => {
    const magnitude = max === 0 ? 0 : (Math.abs(point.value) / max) * half;
    const x = padding.left + slot * index + (slot - barWidth) / 2;
    const positive = point.value >= 0;
    const y = positive ? zeroY - magnitude : zeroY;
    parts.push(
      `<rect x="${round(x)}" y="${round(y)}" width="${round(barWidth)}" height="${round(Math.max(magnitude, 1.5))}" rx="2" fill="${positive ? theme.primary : theme.secondary}" />`,
    );
    const valueY = positive ? y - 5 : y + magnitude + 12;
    parts.push(
      `<text x="${round(x + barWidth / 2)}" y="${round(valueY)}" fill="${theme.muted}" font-size="9" text-anchor="middle">${esc(compactMoney(point.value))}</text>`,
    );
    parts.push(axisLabel(padding.left + slot * (index + 0.5), height - 18, point.label, theme));
  });

  return { id, title, svg: wrap(width, height, parts.join("")) };
}

/** Single-series line with dots — used for the ADR trend. */
export function lineChart(options: {
  id: string;
  title: string;
  points: ChartSeriesPoint[];
  theme: ChartTheme;
  width?: number;
  height?: number;
}): Chart | null {
  const { id, title, points, theme } = options;
  const usable = points.filter((point) => Number.isFinite(point.value) && point.value > 0);
  if (usable.length < 2) return null;

  const width = options.width ?? 720;
  const height = options.height ?? 250;
  const padding = { top: 24, right: 20, bottom: 40, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = niceMax(Math.max(...usable.map((point) => point.value)));
  const step = usable.length === 1 ? 0 : plotWidth / (usable.length - 1);

  const parts: string[] = [];
  for (let i = 0; i <= 4; i += 1) {
    const value = (max / 4) * i;
    const y = padding.top + plotHeight - (plotHeight * i) / 4;
    parts.push(
      `<line x1="${padding.left}" y1="${round(y)}" x2="${padding.left + plotWidth}" y2="${round(y)}" stroke="${theme.grid}" stroke-width="1" />`,
    );
    parts.push(axisLabel(padding.left - 8, y + 3.5, compactMoney(value), theme, "end"));
  }

  const coords = usable.map((point, index) => ({
    x: padding.left + step * index,
    y: padding.top + plotHeight - (point.value / max) * plotHeight,
    point,
  }));

  const path = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"}${round(coord.x)} ${round(coord.y)}`)
    .join(" ");
  const area = `${path} L${round(coords[coords.length - 1].x)} ${round(padding.top + plotHeight)} L${round(coords[0].x)} ${round(padding.top + plotHeight)} Z`;

  parts.push(`<path d="${area}" fill="${theme.primary}" fill-opacity="0.08" />`);
  parts.push(
    `<path d="${path}" fill="none" stroke="${theme.primary}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`,
  );

  coords.forEach((coord, index) => {
    parts.push(
      `<circle cx="${round(coord.x)}" cy="${round(coord.y)}" r="3.5" fill="${theme.surface}" stroke="${theme.primary}" stroke-width="2" />`,
    );
    parts.push(
      `<text x="${round(coord.x)}" y="${round(coord.y - 10)}" fill="${theme.ink}" font-size="9" text-anchor="${index === 0 ? "start" : index === coords.length - 1 ? "end" : "middle"}">${esc(compactMoney(coord.point.value))}</text>`,
    );
    parts.push(axisLabel(coord.x, height - 18, coord.point.label, theme));
  });

  return { id, title, svg: wrap(width, height, parts.join("")) };
}

/** Donut with an inline legend — used for the source mix. */
export function donutChart(options: {
  id: string;
  title: string;
  points: ChartSeriesPoint[];
  palette: string[];
  theme: ChartTheme;
  width?: number;
  height?: number;
}): Chart | null {
  const { id, title, theme, palette } = options;
  const usable = options.points.filter((point) => Number.isFinite(point.value) && point.value > 0);
  const total = usable.reduce((sum, point) => sum + point.value, 0);
  if (usable.length === 0 || total <= 0) return null;

  const width = options.width ?? 720;
  const height = options.height ?? 280;
  const cx = 150;
  const cy = height / 2;
  const outer = 96;
  const inner = 58;

  const parts: string[] = [];
  let angle = -Math.PI / 2;

  usable.forEach((point, index) => {
    const sweep = (point.value / total) * Math.PI * 2;
    const end = angle + sweep;
    const colour = palette[index % palette.length];
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = cx + outer * Math.cos(angle);
    const y1 = cy + outer * Math.sin(angle);
    const x2 = cx + outer * Math.cos(end);
    const y2 = cy + outer * Math.sin(end);
    const x3 = cx + inner * Math.cos(end);
    const y3 = cy + inner * Math.sin(end);
    const x4 = cx + inner * Math.cos(angle);
    const y4 = cy + inner * Math.sin(angle);

    // A full circle cannot be drawn as a single arc — use two rings instead.
    if (usable.length === 1) {
      parts.push(
        `<circle cx="${cx}" cy="${round(cy)}" r="${(outer + inner) / 2}" fill="none" stroke="${colour}" stroke-width="${outer - inner}" />`,
      );
    } else {
      parts.push(
        `<path d="M${round(x1)} ${round(y1)} A${outer} ${outer} 0 ${large} 1 ${round(x2)} ${round(y2)} L${round(x3)} ${round(y3)} A${inner} ${inner} 0 ${large} 0 ${round(x4)} ${round(y4)} Z" fill="${colour}" />`,
      );
    }
    angle = end;
  });

  parts.push(
    `<text x="${cx}" y="${round(cy - 4)}" fill="${theme.muted}" font-size="10" text-anchor="middle">TOTAL OTB</text>`,
    `<text x="${cx}" y="${round(cy + 14)}" fill="${theme.ink}" font-size="15" font-weight="600" text-anchor="middle">${esc(compactMoney(total))}</text>`,
  );

  // Legend column to the right of the ring.
  const legendX = 300;
  const rowHeight = Math.min(30, (height - 40) / usable.length);
  let legendY = cy - (rowHeight * usable.length) / 2 + rowHeight / 2;
  usable.forEach((point, index) => {
    const colour = palette[index % palette.length];
    parts.push(
      `<rect x="${legendX}" y="${round(legendY - 8)}" width="10" height="10" rx="2" fill="${colour}" />`,
      `<text x="${legendX + 18}" y="${round(legendY + 1)}" fill="${theme.ink}" font-size="11">${esc(point.label)}</text>`,
      `<text x="${width - 16}" y="${round(legendY + 1)}" fill="${theme.muted}" font-size="11" text-anchor="end">${esc(money(point.value))} · ${esc(percent(point.value / total, 0))}</text>`,
    );
    legendY += rowHeight;
  });

  return { id, title, svg: wrap(width, height, parts.join("")) };
}

/** Horizontal occupancy strip — one row per month. */
export function occupancyStrip(options: {
  id: string;
  title: string;
  points: ChartSeriesPoint[];
  theme: ChartTheme;
  width?: number;
}): Chart | null {
  const { id, title, theme } = options;
  const usable = options.points.filter((point) => Number.isFinite(point.value));
  if (usable.length === 0 || usable.every((point) => point.value <= 0)) return null;

  const width = options.width ?? 720;
  const rowHeight = 26;
  const height = usable.length * rowHeight + 16;
  const labelWidth = 62;
  const valueWidth = 54;
  const trackWidth = width - labelWidth - valueWidth - 16;

  const parts: string[] = [];
  usable.forEach((point, index) => {
    const y = 8 + index * rowHeight;
    const ratio = Math.max(0, Math.min(1, point.value));
    parts.push(
      `<text x="0" y="${y + 14}" fill="${theme.ink}" font-size="11">${esc(point.label)}</text>`,
      `<rect x="${labelWidth}" y="${y + 4}" width="${round(trackWidth)}" height="12" rx="6" fill="${theme.grid}" />`,
      `<rect x="${labelWidth}" y="${y + 4}" width="${round(Math.max(trackWidth * ratio, ratio > 0 ? 2 : 0))}" height="12" rx="6" fill="${theme.primary}" />`,
      `<text x="${width}" y="${y + 14}" fill="${theme.muted}" font-size="11" text-anchor="end">${esc(percent(point.value, 1))}</text>`,
    );
  });

  return { id, title, svg: wrap(width, height, parts.join("")) };
}
