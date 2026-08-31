/**
 * Shared restriction line markers.
 *
 * The week and month calendar grids draw restrictions as thin coloured lines under
 * each night. The Room Plan reads the same markers from here so the colour language
 * (and the hover explanation) can never drift between the views.
 */

export interface RestrictionLike {
  minimum_stay?: number | null;
  maximum_stay?: number | null;
  lead_days_advance?: number | null;
  lead_days_post?: number | null;
  is_available?: boolean | null;
  available_units?: number | null;
  block_reason?: string | null;
}

export type RestrictionMarkerKind =
  | "stop_sell"
  | "min_stay"
  | "max_stay"
  | "lead_advance"
  | "lead_post";

export interface RestrictionMarker {
  kind: RestrictionMarkerKind;
  /** Tailwind background class for the line. */
  colorClass: string;
  /** Tiny label rendered inside the line (nights count), when meaningful. */
  value?: string;
  /** Multi-line hover explanation. */
  tooltip: string;
  /** Whether the same marker continues on the previous / next night (rounded caps). */
  continuesLeft: boolean;
  continuesRight: boolean;
}

const MARKER_STYLE: Record<RestrictionMarkerKind, { color: string; label: string }> = {
  stop_sell: { color: "bg-red-500", label: "Blocked" },
  min_stay: { color: "bg-blue-500", label: "Min stay" },
  max_stay: { color: "bg-pink-500", label: "Max stay" },
  lead_advance: { color: "bg-yellow-500", label: "Lead advance" },
  lead_post: { color: "bg-orange-500", label: "Lead post" },
};

export function restrictionMarkerColor(kind: RestrictionMarkerKind): string {
  return MARKER_STYLE[kind].color;
}

export function restrictionMarkerLabel(kind: RestrictionMarkerKind): string {
  return MARKER_STYLE[kind].label;
}

const isStopSell = (r?: RestrictionLike | null): boolean =>
  !!r && (r.is_available === false || (r.available_units != null && Number(r.available_units) <= 0));

/**
 * Build the ordered marker list for one night. `prev`/`next` are the same room type's
 * neighbouring nights and only affect the rounded caps of a continuous run.
 */
export function buildRestrictionMarkers(
  restriction: RestrictionLike | null | undefined,
  prev: RestrictionLike | null | undefined,
  next: RestrictionLike | null | undefined,
  blockedTooltip?: string,
): RestrictionMarker[] {
  if (!restriction) return [];
  const markers: RestrictionMarker[] = [];

  if (isStopSell(restriction)) {
    markers.push({
      kind: "stop_sell",
      colorClass: MARKER_STYLE.stop_sell.color,
      tooltip: blockedTooltip || "Blocked — not sellable on this night",
      continuesLeft: isStopSell(prev),
      continuesRight: isStopSell(next),
    });
  }

  type NumericField = "minimum_stay" | "maximum_stay" | "lead_days_advance" | "lead_days_post";
  const numeric: Array<{ kind: RestrictionMarkerKind; field: NumericField; unit: string; showValue: boolean }> = [
    { kind: "min_stay", field: "minimum_stay", unit: "nights", showValue: true },
    { kind: "max_stay", field: "maximum_stay", unit: "nights", showValue: true },
    { kind: "lead_advance", field: "lead_days_advance", unit: "days", showValue: false },
    { kind: "lead_post", field: "lead_days_post", unit: "days", showValue: false },
  ];

  for (const spec of numeric) {
    const value = restriction[spec.field];
    if (value == null) continue;
    const same = (r?: RestrictionLike | null) => !!r && r[spec.field] === value;
    markers.push({
      kind: spec.kind,
      colorClass: MARKER_STYLE[spec.kind].color,
      value: spec.showValue ? String(value) : undefined,
      tooltip: `${MARKER_STYLE[spec.kind].label}: ${value} ${spec.unit}`,
      continuesLeft: same(prev),
      continuesRight: same(next),
    });
  }

  return markers;
}

/** Rounded-cap classes for a marker inside a continuous run. */
export function restrictionMarkerRounding(marker: RestrictionMarker): string {
  if (marker.continuesLeft && marker.continuesRight) return "";
  if (marker.continuesLeft) return "rounded-r-full";
  if (marker.continuesRight) return "rounded-l-full";
  return "rounded-full";
}
