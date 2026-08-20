/**
 * STAY TIMES — check-in / check-out authoring rules.
 *
 * The channel manager enforces the rule its own editor states as
 * "Check-out time must not be later than the check-in time from", i.e.
 * `check-out until <= check-in from`. It refuses the edit outright, so ROL'OS has to
 * capture valid times at author time instead of discovering the rejection on push.
 */

/** Normalise `9:00`, `9h00`, `09.00` → `09:00`. Returns null when unparseable. */
export function normaliseTimeOfDay(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\s*[:h.]?\s*(\d{2})?/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2] ?? "0");
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export interface StayTimeIssue {
  field: "check_in_to" | "check_out_to";
  message: string;
}

/**
 * Validate an authored trio. Blank values are not an error here — the readiness gate
 * reports missing times separately.
 */
export function validateStayTimes(input: {
  check_in_from?: unknown;
  check_in_to?: unknown;
  check_out_to?: unknown;
}): StayTimeIssue[] {
  const from = normaliseTimeOfDay(input.check_in_from);
  const to = normaliseTimeOfDay(input.check_in_to);
  const out = normaliseTimeOfDay(input.check_out_to);
  const issues: StayTimeIssue[] = [];

  if (from && to && minutesOfDay(to) <= minutesOfDay(from)) {
    issues.push({
      field: "check_in_to",
      message: `Check-in "to" (${to}) must be later than check-in "from" (${from}).`,
    });
  }
  if (from && out && minutesOfDay(out) > minutesOfDay(from)) {
    issues.push({
      field: "check_out_to",
      message: `Check-out (${out}) must not be later than check-in from (${from}) — the channel rejects this.`,
    });
  }
  return issues;
}

export function stayTimeIssueFor(
  input: { check_in_from?: unknown; check_in_to?: unknown; check_out_to?: unknown },
  field: StayTimeIssue["field"],
): string | null {
  return validateStayTimes(input).find((i) => i.field === field)?.message ?? null;
}
