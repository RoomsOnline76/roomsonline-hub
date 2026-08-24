/**
 * Deterministic channel-onboarding gate — shared vocabulary.
 *
 * The onboarding flow is two operator steps in the Channel Monitor, guarded by one
 * durable readiness flag:
 *
 *   ready_to_sell     — mandatory ROL'OS content steps 1–5 are complete (local only)
 *   monitor_step_a    — the distribution sub-account exists, is bound and its keys verify
 *   monitor_step_b    — the property + ARI reached the channel
 *   ready_to_connect  — both monitor steps green: the property is live and sellable
 *
 * `ready_to_sell` is graded from the readiness scorer WITHOUT any channel call, so a
 * channel outage can never block onboarding preparation. Channel-class groups
 * (publishing, currency) are deliberately excluded — those are Step A/B outcomes.
 */

/** Ledger step keys this gate owns. */
export const ONBOARD_STEP_KEYS = [
  "ready_to_sell",
  "monitor_step_a",
  "monitor_step_b",
  "ready_to_connect",
] as const;

export type OnboardStepKey = (typeof ONBOARD_STEP_KEYS)[number];

/**
 * Readiness check groups that make up mandatory steps 1–5. Every group here is
 * decided entirely from ROL'OS data.
 */
export const READY_TO_SELL_GROUPS = [
  "Content",
  "Address & geo",
  "Rooms & beds",
  "Photos",
  "Policies & payments",
  "Availability 365d",
  "Pricing 365d",
] as const;

/** Check keys that belong to a channel-class step even when they render in a local group. */
const EXCLUDED_CHECK_KEYS = new Set(["currency_verified"]);

interface ReadinessCheck {
  key?: string;
  group?: string;
  label?: string;
  mandatory?: boolean;
  passed?: boolean;
  detail?: string;
  unit?: string;
}

interface ReadinessReport {
  error?: string | null;
  checks?: ReadinessCheck[];
}

export interface ReadyToSellGrade {
  /** Did the scorer actually answer? A silent failure must never be recorded as a pass. */
  answered: boolean;
  passed: boolean;
  total: number;
  failing: Array<{ key: string; group: string; label: string; unit: string | null; detail: string | null }>;
  summary: string;
  fingerprint: string;
}

function fingerprint(input: unknown): string {
  const text = (() => {
    try {
      return JSON.stringify(input) ?? "";
    } catch {
      return String(input);
    }
  })();
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(16);
}

/** Grade steps 1–5 from a readiness report. Pure — safe to unit test and to reuse client-side. */
export function gradeReadyToSell(report: ReadinessReport | null | undefined): ReadyToSellGrade {
  const groups = new Set<string>(READY_TO_SELL_GROUPS as readonly string[]);
  const all = Array.isArray(report?.checks) ? report!.checks! : [];
  const scoped = all.filter(
    (check) => groups.has(String(check.group ?? "")) && !EXCLUDED_CHECK_KEYS.has(String(check.key ?? "")),
  );
  const answered = !report?.error && all.length > 0;

  const failing = scoped
    .filter((check) => check.mandatory === true && check.passed !== true)
    .map((check) => ({
      key: String(check.key ?? check.label ?? "check"),
      group: String(check.group ?? ""),
      label: String(check.label ?? check.key ?? "check"),
      unit: check.unit ? String(check.unit) : null,
      detail: check.detail ? String(check.detail) : null,
    }));

  return {
    answered,
    passed: answered && failing.length === 0,
    total: scoped.length,
    failing,
    summary: failing
      .map((f) => [f.unit, f.detail || f.label].filter(Boolean).join(": "))
      .join(" · "),
    fingerprint: fingerprint(
      scoped.map((c) => [c.key ?? c.label, c.unit ?? "", c.passed === true]).sort(),
    ),
  };
}
