import type { ChannelOnboardTaskId } from "@/config/channelOnboard";

export type StepARemedyKind = "password" | "api_keys" | "login_choice" | "binding" | "fresh_login" | "retry";

export interface StepARemedy {
  code: string;
  title: string;
  explain: string;
  guidance: string;
  remedy: StepARemedyKind;
  taskHint?: ChannelOnboardTaskId;
}

const PASSWORD_GUIDANCE =
  "If the password works in the portal but not here, keep it saved and use the API key fields below. Portal login and XML API key creation are separate checks.";

export const CHANNEL_STEP_A_REMEDIES: Record<string, StepARemedy> = {
  RU_CREATE_KEY_FAILED: {
    code: "RU_CREATE_KEY_FAILED",
    title: "Key creation was refused",
    explain: "The portal password can be correct while the channel still refuses the API key-creation request.",
    guidance: "Verify the saved password first. If verification passes but key creation is refused, generate an AccessKey/SecretKey in the channel portal while signed in as this sub-account and paste it here.",
    remedy: "api_keys",
    taskHint: "api_keys",
  },
  RU_CHILD_LOGIN_REJECTED: {
    code: "RU_CHILD_LOGIN_REJECTED",
    title: "Sub-account login was refused",
    explain: "The channel did not accept the saved sub-account password on its XML API surface.",
    guidance: `Reset or confirm the portal password for this login, then save it here. ${PASSWORD_GUIDANCE}`,
    remedy: "password",
    taskHint: "api_keys",
  },
  NO_CHILD_CREDENTIALS: {
    code: "NO_CHILD_CREDENTIALS",
    title: "Sub-account credential needed",
    explain: "This account was adopted or created before a usable credential was stored.",
    guidance: "Save the sub-account portal password here, or create the account under a fresh login so Step A can continue.",
    remedy: "password",
    taskHint: "api_keys",
  },
  NO_STORED_PASSWORD: {
    code: "NO_STORED_PASSWORD",
    title: "Portal password needed",
    explain: "No password is stored for this sub-account.",
    guidance: "Save the current portal password here. If you do not know it, reset it in the channel portal first.",
    remedy: "password",
    taskHint: "api_keys",
  },
  RU_CHILD_KEYS_REJECTED: {
    code: "RU_CHILD_KEYS_REJECTED",
    title: "API key pair was refused",
    explain: "The channel did not accept the stored AccessKey/SecretKey pair.",
    guidance: "Generate a fresh pair while signed in as this sub-account, then paste both values here.",
    remedy: "api_keys",
    taskHint: "verify_keys",
  },
  RU_CHILD_KEYS_WRONG_ACCOUNT: {
    code: "RU_CHILD_KEYS_WRONG_ACCOUNT",
    title: "API key pair belongs to another account",
    explain: "The supplied key pair authenticates a different sub-account.",
    guidance: "Sign in as the login shown in this dialog and generate a key pair for this OwnerID only.",
    remedy: "api_keys",
    taskHint: "verify_keys",
  },
  RU_CHILD_KEYS_DUPLICATE: {
    code: "RU_CHILD_KEYS_DUPLICATE",
    title: "API key pair is already in use",
    explain: "One AccessKey cannot serve two sub-accounts.",
    guidance: "Generate a separate pair while signed in as this exact sub-account, then paste it here.",
    remedy: "api_keys",
    taskHint: "verify_keys",
  },
  RU_EMAIL_IN_USE: {
    code: "RU_EMAIL_IN_USE",
    title: "Choose another distribution login",
    explain: "That email is already registered at the channel outside our master account.",
    guidance: "Pick one of the available alternatives or enter a brand-new login email.",
    remedy: "login_choice",
    taskHint: "owner_account",
  },
  RU_OWNER_NOT_FOUND: {
    code: "RU_OWNER_NOT_FOUND",
    title: "Stored account is not on our roster",
    explain: "The stored OwnerID is not listed under the master account.",
    guidance: "Re-bind to a visible sub-account or create a fresh login before continuing.",
    remedy: "binding",
    taskHint: "owner_account",
  },
  RU_ACCOUNT_RETIRED: {
    code: "RU_ACCOUNT_RETIRED",
    title: "Sub-account is retired",
    explain: "This account cannot be used for new channel work.",
    guidance: "Create the account under a fresh login.",
    remedy: "fresh_login",
    taskHint: "owner_account",
  },
  RU_IDENTITY_INCOMPLETE: {
    code: "RU_IDENTITY_INCOMPLETE",
    title: "Account identity is incomplete",
    explain: "Step A is missing the OwnerID, login, or account binding needed to continue.",
    guidance: "Complete the owner binding details, then run Step A again.",
    remedy: "binding",
    taskHint: "owner_account",
  },
  NO_OWNER_EMAIL: {
    code: "NO_OWNER_EMAIL",
    title: "Owner email needed",
    explain: "Step A needs a login email for the distribution sub-account.",
    guidance: "Add the owner email or enter a fresh distribution login in this dialog.",
    remedy: "login_choice",
    taskHint: "owner_account",
  },
  RU_OWNER_NOT_BOUND: {
    code: "RU_OWNER_NOT_BOUND",
    title: "Owner binding needed",
    explain: "No distribution sub-account is bound yet.",
    guidance: "Confirm or create the sub-account in Step A before continuing.",
    remedy: "binding",
    taskHint: "owner_account",
  },
  RU_COMPANY_DETAILS_FAILED: {
    code: "RU_COMPANY_DETAILS_FAILED",
    title: "Company details were refused",
    explain: "The channel did not accept the company profile sent for this sub-account.",
    guidance: "Review the missing or rejected company fields below, correct them on the property record, then retry Step A.",
    remedy: "retry",
    taskHint: "company_profile",
  },
  RU_RATE_DEFERRED: {
    code: "RU_RATE_DEFERRED",
    title: "Waiting on the channel",
    explain: "The channel rate window is closed for this check.",
    guidance: "Wait for the countdown. Step A will resume automatically.",
    remedy: "retry",
  },
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    title: "Waiting on the channel",
    explain: "The channel allows one identical read per sliding window and this call arrived early.",
    guidance: "Wait for the countdown — the step resumes on its own. No input is needed.",
    remedy: "retry",
  },
  RU_CREATE_USER_FAILED: {
    code: "RU_CREATE_USER_FAILED",
    title: "The sub-account could not be created",
    explain: "The channel refused the new login — usually the email format, a password it considers weak, or a login that already exists.",
    guidance: "Enter a fresh distribution login in this dialog, or adopt the existing account if that email is already ours.",
    remedy: "login_choice",
    taskHint: "owner_account",
  },
  RU_NOT_LISTED: {
    code: "RU_NOT_LISTED",
    title: "Account is detached from the master account",
    explain: "The OwnerID exists at the channel but is no longer listed under our master account, so we cannot act on it.",
    guidance: "Re-assign this property to a visible sub-account, or create a fresh distribution login below.",
    remedy: "binding",
    taskHint: "owner_account",
  },
  RU_NO_OWNER_ID: {
    code: "RU_NO_OWNER_ID",
    title: "OwnerID is missing",
    explain: "The channel did not return an OwnerID for this login, so nothing can be bound yet.",
    guidance: "Run Step A again. If it repeats, create the account under a fresh login.",
    remedy: "fresh_login",
    taskHint: "owner_account",
  },
  NO_API_KEYS: {
    code: "NO_API_KEYS",
    title: "API key pair needed",
    explain: "No AccessKey/SecretKey pair is stored for this sub-account.",
    guidance: "Save the portal password to mint the pair automatically, or paste a pair generated in the portal for this sub-account.",
    remedy: "api_keys",
    taskHint: "api_keys",
  },
  NO_RU_LOCATION: {
    code: "NO_RU_LOCATION",
    title: "Channel location cannot be resolved",
    explain: "The property's city/country does not map to a channel location.",
    guidance: "Set the city and country on the property editor, save, then run Step A again.",
    remedy: "retry",
    taskHint: "owner_account",
  },
  PASSWORD_RETENTION_FAILED: {
    code: "PASSWORD_RETENTION_FAILED",
    title: "The password could not be stored",
    explain: "The credential store rejected the value before it reached the channel.",
    guidance: "Re-enter the password below. Avoid leading or trailing spaces.",
    remedy: "password",
    taskHint: "api_keys",
  },
  DECRYPT_FAILED: {
    code: "DECRYPT_FAILED",
    title: "Stored credential is unreadable",
    explain: "The stored password or key pair can no longer be decrypted.",
    guidance: "Save the portal password again below so a fresh credential is stored.",
    remedy: "password",
    taskHint: "api_keys",
  },
  RU_CALL_FAILED: {
    code: "RU_CALL_FAILED",
    title: "The channel did not answer",
    explain: "A transport or channel-side outage interrupted the call. Nothing was refused on our data.",
    guidance: "Retry the step. No information is needed from you.",
    remedy: "retry",
  },
};

export function getStepARemedy(code: string | null | undefined): StepARemedy | null {
  if (!code) return null;
  return CHANNEL_STEP_A_REMEDIES[code] ?? null;
}

/**
 * Always hand back guidance. An unmapped code must never surface as a bare status line, so
 * it falls back to a generic card that still says what to do next and keeps the raw detail.
 */
export function resolveStepARemedy(
  code: string | null | undefined,
  detail?: string | null,
): StepARemedy | null {
  if (!code) return null;
  const known = CHANNEL_STEP_A_REMEDIES[code];
  if (known) return known;
  return {
    code,
    title: "The channel refused this step",
    explain: detail?.trim()
      ? detail.trim()
      : "The channel rejected the request without a recognised reason code.",
    guidance:
      "Check the sub-account login and password below, confirm the company details, then retry the step. If it repeats, capture the reference code shown and review the live traffic monitor.",
    remedy: "retry",
  };
}