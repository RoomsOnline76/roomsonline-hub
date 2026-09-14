import { CADENCE_LABEL, type ReportCadence, type ReportKind } from "@/hooks/useReportRuns";

/** `Bi-Monthly Revenue Review – 20 Aug 2026` — the default title for a run. */
export const defaultRunTitle = (
  dateIso: string,
  cadence: ReportCadence,
  reportKind: ReportKind = "revenue_review",
): string => {
  const prefix = reportKind === "daily_detailed"
    ? "Daily Detailed Report"
    : `${CADENCE_LABEL[cadence]} Revenue Review`;
  const parsed = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return prefix;
  const formatted = parsed.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${prefix} – ${formatted}`;
};

/**
 * A title the reviewer never customised — it still matches the generated wording
 * for one of the cadences, so switching cadence may safely rewrite it.
 */
export const isGeneratedRunTitle = (
  title: string | null | undefined,
  dateIso: string,
  reportKind: ReportKind = "revenue_review",
): boolean => {
  const current = (title ?? "").trim();
  if (!current) return true;
  const generated = (["monthly", "bimonthly"] as ReportCadence[]).flatMap((cadence) => [
    defaultRunTitle(dateIso, cadence, "revenue_review"),
    defaultRunTitle(dateIso, cadence, "daily_detailed"),
  ]);
  return generated.includes(current) || defaultRunTitle(dateIso, "bimonthly", reportKind) === current;
};
