import { nightsbridgeAdapter } from "./nightsbridge";
import { operaAdapter } from "./opera";
import { protelAdapter } from "./protel";
import { roomraccoonAdapter } from "./roomraccoon";
import type { ReportSourceAdapter, ReportSourceKey } from "./types";

export type {
  AdditionalFieldConfig,
  AdditionalFieldDescriptor,
  ReportSourceAdapter,
  ReportSourceKey,
  ReportSourceStatus,
  ReportTemplate,
} from "./types";

export const DEFAULT_REPORT_SOURCE: ReportSourceKey = "nightsbridge";

export const REPORT_ADAPTERS: Record<ReportSourceKey, ReportSourceAdapter> = {
  nightsbridge: nightsbridgeAdapter,
  opera: operaAdapter,
  protel: protelAdapter,
  roomraccoon: roomraccoonAdapter,
};

/** All adapters, ready ones first, for pickers. */
export const listAdapters = (): ReportSourceAdapter[] =>
  Object.values(REPORT_ADAPTERS).sort((a, b) =>
    a.status === b.status ? a.label.localeCompare(b.label) : a.status === "ready" ? -1 : 1,
  );

export const isReportSourceKey = (value: unknown): value is ReportSourceKey =>
  typeof value === "string" && value in REPORT_ADAPTERS;

/** Adapter for a stored `source_type`; unknown values fall back to the default. */
export const getAdapter = (key: string | null | undefined): ReportSourceAdapter =>
  REPORT_ADAPTERS[isReportSourceKey(key) ? key : DEFAULT_REPORT_SOURCE];

export const isSourceReady = (key: string | null | undefined): boolean =>
  getAdapter(key).status === "ready";

/** Human label for a stored `source_type`. */
export const sourceLabel = (key: string | null | undefined): string => getAdapter(key).label;

/** Message shown when a run cannot be processed because its source is a stub. */
export const unsupportedSourceMessage = (key: string | null | undefined): string => {
  const adapter = getAdapter(key);
  return adapter.notes ?? `${adapter.label} parsing is not available yet.`;
};
