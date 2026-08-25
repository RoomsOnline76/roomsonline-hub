import type { ChannelOnboardTaskId } from "@/config/channelOnboard";

/**
 * Step B (publish + read-back) failures. Each entry names the input the operator must fix and,
 * where the fix lives on the property record, the editor tab that owns it.
 */
export interface StepBRemedy {
  code: string;
  title: string;
  explain: string;
  guidance: string;
  /** Deep-link section on the property editor that fixes this, when there is one. */
  editorSection?: string;
  taskHint?: ChannelOnboardTaskId;
}

export const CHANNEL_STEP_B_REMEDIES: Record<string, StepBRemedy> = {
  NOT_READY_TO_SELL: {
    code: "NOT_READY_TO_SELL",
    title: "Readiness steps are not complete",
    explain: "One of the five readiness steps is still open, so nothing may be published.",
    guidance: "Clear the outstanding readiness step on the property, save, then run Step B again.",
    editorSection: "general",
  },
  READINESS_UNANSWERED: {
    code: "READINESS_UNANSWERED",
    title: "Readiness has not been graded",
    explain: "The readiness gate has no recorded answer for this property.",
    guidance: "Open the property, save it once so the gate is graded, then return here.",
    editorSection: "general",
  },
  READINESS_UNAVAILABLE: {
    code: "READINESS_UNAVAILABLE",
    title: "Readiness could not be read",
    explain: "The gate status lookup failed — this is a read fault, not a rejection.",
    guidance: "Retry the step. No information is needed from you.",
  },
  STEP_A_INCOMPLETE: {
    code: "STEP_A_INCOMPLETE",
    title: "Step A must finish first",
    explain: "The distribution account, its key pair or the company profile is not confirmed yet.",
    guidance: "Complete Step A — use Preview account to supply the sub-account password or key pair.",
    taskHint: "owner_account",
  },
  NO_RU_PROPERTY: {
    code: "NO_RU_PROPERTY",
    title: "Nothing is published yet",
    explain: "No channel listing id exists for this property, so the read-back has nothing to verify.",
    guidance: "Run the publish task first, then retry the read-back.",
    taskHint: "push_property",
  },
  MANDATORY_FIELDS_MISSING: {
    code: "MANDATORY_FIELDS_MISSING",
    title: "Mandatory listing fields are missing",
    explain: "The channel rejects a listing without name, capacity, location, check-in/out times and a description.",
    guidance: "Fill the fields named in the detail line on the property editor, save, then run Step B again.",
    editorSection: "general",
    taskHint: "push_property",
  },
  IMAGE_TOO_SMALL: {
    code: "IMAGE_TOO_SMALL",
    title: "An image is below the channel's minimum",
    explain: "Images must be at least 1024x683 pixels to be accepted.",
    guidance: "Replace the flagged image on the property or unit gallery, then re-publish.",
    editorSection: "images",
    taskHint: "push_property",
  },
  NO_RATE_PLAN: {
    code: "NO_RATE_PLAN",
    title: "No rate covers the publish window",
    explain: "The channel refuses a listing with no priced nights in the forward window.",
    guidance: "Add or extend a season and its rate plan so the forward window is priced, then run Step B again.",
    editorSection: "rates",
    taskHint: "push_property",
  },
  UNIT_MISMATCH: {
    code: "UNIT_MISMATCH",
    title: "Unit inventory does not match the channel",
    explain: "The published unit set differs from the property's active units.",
    guidance: "Confirm the active units and their capacities on the property, save, then re-publish.",
    editorSection: "rooms",
    taskHint: "push_property",
  },
  RU_RATE_DEFERRED: {
    code: "RU_RATE_DEFERRED",
    title: "Waiting on the channel",
    explain: "The channel's read window is closed for this check.",
    guidance: "Wait for the countdown — Step B resumes on its own.",
  },
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    title: "Waiting on the channel",
    explain: "The channel throttled this read.",
    guidance: "Wait for the countdown — the step resumes automatically.",
  },
};

/** Always return guidance: an unmapped code still gets a generic, actionable card. */
export function resolveStepBRemedy(
  code: string | null | undefined,
  detail?: string | null,
): StepBRemedy | null {
  if (!code) return null;
  const known = CHANNEL_STEP_B_REMEDIES[code];
  if (known) return known;
  return {
    code,
    title: "The channel refused this task",
    explain: detail?.trim() ? detail.trim() : "The channel rejected the request without a recognised reason code.",
    guidance:
      "Review the property's mandatory fields, images and rates, then retry. If it repeats, capture the reference code shown and check the live traffic monitor.",
  };
}
