import { CADENCE_LABEL, type ReportCadence } from "@/hooks/useReportRuns";

/** `Bi-Monthly Revenue Review – 20 Aug 2026` — the default title for a run. */
export const defaultRunTitle = (dateIso: string, cadence: ReportCadence): string => {
  const prefix = `${CADENCE_LABEL[cadence]} Revenue Review`;
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
): boolean => {
  const current = (title ?? "").trim();
  if (!current) return true;
  return (["monthly", "bimonthly"] as ReportCadence[]).some(
    (cadence) => defaultRunTitle(dateIso, cadence) === current,
  );
};
