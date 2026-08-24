/**
 * Queue scores for the two separate onboarding wizards.
 *
 * Website = 9-step listing wizard (min 70% to appear on RoomsOnline).
 * Channels = RU channel wizard (12 macros). Connecting one channel finishes it.
 */

import { getCompletionStateDetails } from "@/config/onboardingFieldSchema";

export const WEBSITE_LIST_MINIMUM = 70;

export type ChannelQueueStage = "na" | "ready" | "publish" | "connect" | "live";

export interface WebsiteQueueProgress {
  percent: number;
  meetsMinimum: boolean;
  bandLabel: string;
  /** Short label under the bar. */
  label: string;
  hint: string;
}

export interface ChannelQueueProgress {
  percent: number;
  stage: ChannelQueueStage;
  label: string;
  hint: string;
}

export interface ChannelQueueSignals {
  isRolos: boolean;
  channelsConnected: number;
  propertyListingId: string | null;
  activeUnits: number;
  publishedUnits: number;
  hasDistributionIdentity?: boolean;
  /**
   * Live RU mandatory checks. Listing IDs alone must never mark a property
   * ready to connect — Tidal can be published and still fail onboarding tests.
   * `null` / omitted = checks not confirmed yet.
   */
  ruMandatoryPass?: boolean | null;
  /** 0-100 pass rate of live RU mandatory checks, when known. */
  ruMandatoryPercent?: number | null;
}

export interface RuReadinessSignals {
  blocked?: boolean;
  blocking_gaps?: string[];
  mandatory_total?: number;
  mandatory_passed?: number;
  checks_total?: number;
  checks_passed?: number;
  score?: number;
  groups?: { group?: string; total: number; passed: number; failed?: { mandatory?: boolean }[] }[];
}

/** Groups that can only be judged against the live channel calendar. */
const LIVE_PROBE_GROUPS = /365d|availability|pricing/i;

/**
 * Collapse a phase_status / property_readiness payload into a pass + percent.
 *
 * `liveProbeDegraded` = the scorer could not read the live channel calendar and
 * fell back to the local one. In that case a failure that lives only in the
 * live-probe groups is *not* a verdict — reporting it as "RU checks failing"
 * contradicts the wizard, which treats unresolvable checks as advisory.
 */
export function ruMandatoryCheckSummary(
  readiness: RuReadinessSignals | null | undefined,
  opts?: { liveProbeDegraded?: boolean },
): { known: boolean; pass: boolean; percent: number } {
  if (!readiness) return { known: false, pass: false, percent: 0 };

  const groups = readiness.groups ?? [];
  const gaps = Array.isArray(readiness.blocking_gaps) ? readiness.blocking_gaps : [];
  const failingGroups = groups.filter((g) => (g.failed ?? []).some((f) => f.mandatory !== false));
  const groupMandatoryFail = failingGroups.length > 0;
  // When groups are reported they are the authority: `blocked` / `blocking_gaps`
  // can also carry advisory or unresolvable items.
  const blocked = groups.length > 0
    ? groupMandatoryFail
    : readiness.blocked === true || gaps.length > 0;

  let percent = 0;
  if (
    typeof readiness.mandatory_total === "number" &&
    readiness.mandatory_total > 0 &&
    typeof readiness.mandatory_passed === "number"
  ) {
    percent = Math.round((readiness.mandatory_passed / readiness.mandatory_total) * 100);
  } else if (typeof readiness.score === "number") {
    percent = Math.max(0, Math.min(100, Math.round(readiness.score)));
  } else if (groups.length > 0) {
    const total = groups.reduce((sum, g) => sum + (g.total || 0), 0);
    const passed = groups.reduce((sum, g) => sum + (g.passed || 0), 0);
    percent = total > 0 ? Math.round((passed / total) * 100) : 0;
  } else if (
    typeof readiness.checks_total === "number" &&
    readiness.checks_total > 0 &&
    typeof readiness.checks_passed === "number"
  ) {
    percent = Math.round((readiness.checks_passed / readiness.checks_total) * 100);
  }

  if (
    blocked &&
    opts?.liveProbeDegraded &&
    failingGroups.length > 0 &&
    failingGroups.every((g) => LIVE_PROBE_GROUPS.test(String(g.group ?? "")))
  ) {
    // Nothing about the property's own content is failing — the live verdict is
    // simply unavailable right now.
    return { known: false, pass: false, percent };
  }

  return { known: true, pass: !blocked, percent };
}


/** Website bar uses the listing wizard only — never diluted by ROL Spec. */
export function websiteQueueProgress(
  wizardScore: number,
  fieldScore: number,
  showOnWebsite: boolean,
): WebsiteQueueProgress {
  const percent = Math.max(0, Math.min(100, Math.max(wizardScore, fieldScore)));
  const details = getCompletionStateDetails(percent);
  const meetsMinimum = percent >= WEBSITE_LIST_MINIMUM;
  if (showOnWebsite) {
    return {
      percent,
      meetsMinimum: true,
      bandLabel: details.label,
      label: "On website",
      hint: `Listed on RoomsOnline. Listing wizard is ${percent}% (${details.label}).`,
    };
  }
  if (meetsMinimum) {
    return {
      percent,
      meetsMinimum: true,
      bandLabel: details.label,
      label: `${percent}% · can list`,
      hint: `${details.label}. ${WEBSITE_LIST_MINIMUM}% is the minimum to list on RoomsOnline. ROL Spec is editorial and is not part of this bar.`,
    };
  }
  const short = WEBSITE_LIST_MINIMUM - percent;
  return {
    percent,
    meetsMinimum: false,
    bandLabel: details.label,
    label: `${percent}% · ${short} pts short`,
    hint: `${details.label}. Need ${WEBSITE_LIST_MINIMUM}% in the website listing wizard to go live on RoomsOnline (${short} points short). ROL Spec is not counted here.`,
  };
}

/**
 * Channel bar scores the Ready-to-Sell gate only (wizard steps 1–5).
 *
 * Everything between Ready to sell and a connected channel is owned by the
 * Channel Monitor's two-step "Onboard property" processor, so publish /
 * currency / sign-off signals no longer dilute this score.
 */
export function channelQueueProgress(signals: ChannelQueueSignals): ChannelQueueProgress {
  if (!signals.isRolos) {
    return {
      percent: 0,
      stage: "na",
      label: "Not ROL'OS",
      hint: "The channel wizard only applies to properties on ROL'OS.",
    };
  }

  if (signals.channelsConnected > 0) {
    const n = signals.channelsConnected;
    return {
      percent: 100,
      stage: "live",
      label: n === 1 ? "1 channel" : `${n} channels`,
      hint: "At least one sales channel is connected. Onboarding is complete.",
    };
  }

  const checksKnown = signals.ruMandatoryPass !== undefined && signals.ruMandatoryPass !== null;

  if (signals.ruMandatoryPass === true) {
    return {
      percent: 100,
      stage: "connect",
      label: "Ready to sell",
      hint: "Steps 1–5 all pass. Run Onboard property in the Channel Monitor to create the account, publish and connect.",
    };
  }

  if (checksKnown) {
    const raw = signals.ruMandatoryPercent;
    const percent =
      typeof raw === "number" && Number.isFinite(raw)
        ? Math.max(0, Math.min(99, Math.round(raw)))
        : 0;
    const outstanding =
      typeof signals.ruOutstanding === "number" && signals.ruOutstanding > 0
        ? signals.ruOutstanding
        : null;
    return {
      percent,
      stage: "ready",
      label: outstanding
        ? `${percent}% · ${outstanding} outstanding`
        : `${percent}% · steps 1–5`,
      hint: outstanding
        ? `${outstanding} mandatory item${outstanding === 1 ? "" : "s"} outstanding across steps 1–5 (identity, location, rooms, media, commercial).`
        : "Mandatory fields across steps 1–5 (identity, location, rooms, media, commercial) are not all complete yet.",
    };
  }

  return {
    percent: 0,
    stage: "ready",
    label: "Grade steps 1–5",
    hint: "Ready to sell has not been graded yet. Open the wizard to grade steps 1–5.",
  };
}

