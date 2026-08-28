/**
 * Per-property report layout template.
 *
 * Stored on `property_report_settings.report_layout_template` so the slide
 * order, hidden pages and the reviewer's renamed / custom slide sections carry
 * over from one run to the next for the same property.
 */

export interface ReportTemplateSlot {
  slot_key: string;
  section: string;
  title: string;
  layout: "full" | "half";
  sort_order: number;
}

export interface ReportLayoutTemplate {
  order: string[];
  hidden: string[];
  slots: ReportTemplateSlot[];
}

export const EMPTY_LAYOUT_TEMPLATE: ReportLayoutTemplate = { order: [], hidden: [], slots: [] };

const stringList = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];

/** Per-image slide keys are run specific and never carried between runs. */
const isPortableKey = (key: string): boolean => !key.startsWith("media_img_");

export const parseReportLayoutTemplate = (raw: unknown): ReportLayoutTemplate => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_LAYOUT_TEMPLATE;
  const value = raw as { order?: unknown; hidden?: unknown; slots?: unknown };
  const slots: ReportTemplateSlot[] = Array.isArray(value.slots)
    ? value.slots
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry, index) => ({
          slot_key: String(entry.slot_key ?? ""),
          section: String(entry.section ?? entry.title ?? "Additional slides"),
          title: String(entry.title ?? entry.section ?? "Additional slides"),
          layout: entry.layout === "half" ? "half" : "full",
          sort_order: Number(entry.sort_order ?? index) || 0,
        }))
        .filter((slot) => slot.slot_key.length > 0)
    : [];

  return {
    order: stringList(value.order).filter(isPortableKey),
    hidden: stringList(value.hidden).filter(isPortableKey),
    slots,
  };
};

/** Trims run-specific keys before the template is written back. */
export const portableLayout = (order: string[], hidden: string[]) => ({
  order: order.filter(isPortableKey),
  hidden: hidden.filter(isPortableKey),
});
