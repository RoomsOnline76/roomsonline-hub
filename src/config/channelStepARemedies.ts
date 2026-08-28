import type { ChannelOnboardTaskId } from "@/config/channelOnboard";

export type StepARemedyKind = "password" | "login_choice" | "binding" | "fresh_login" | "retry" | "api_keys";

export interface StepARemedy {
  code: string;
  title: string;
  explain: string;
  guidance: string;
  remedy: StepARemedyKind;
  taskHint?: ChannelOnboardTaskId;
}

export const CHANNEL_STEP_A_REMEDIES: Record<string, StepARemedy> = {
  RU_KEY_CREATION_NOT_ENABLED: {
    code: "RU_KEY_CREATION_NOT_ENABLED",
    title: "The channel is not letting us create API keys",
    explain:
      "Step A created the sub-account, then tried its own login, a retry after propagation, a master-scoped mint and replacement logins of its own. The channel refused every one, so this is an account entitlement on their side — not a wrong password.",
    guidance:
      "Do not change the password. Ask the channel to enable XML API key creation for our master account and its sub-accounts, then run Step A again — it will finish on its own.",
    remedy: "retry",
    taskHint: "api_keys",
  },

  RU_CREATE_KEY_API_REJECTED: {
    code: "RU_CREATE_KEY_API_REJECTED",
    title: "API key creation is not enabled yet",
    explain: "Step A retained the sub-account password, but the channel XML API refused automatic key creation for this OwnerID.",
    guidance: "Keep the password as-is and retry Step A after XML API access is enabled for this sub-account. Only replace the password below if it was changed at the channel.",
    remedy: "retry",
    taskHint: "api_keys",
  },
  RU_CREATE_KEY_BAD_LOGIN: {
    code: "RU_CREATE_KEY_BAD_LOGIN",
    title: "Sub-account password was refused",
    explain: "Step A could not create the API key pair with the stored sub-account password.",
    guidance: "Enter the current password below. Step A will create, verify and store the pair automatically.",
    remedy: "password",
    taskHint: "api_keys",
  },
  RU_PASSWORD_PROBE_UNSUPPORTED: {
    code: "RU_PASSWORD_PROBE_UNSUPPORTED",
    title: "Sub-account password needed",
    explain: "Step A needs the current sub-account password for automatic key creation.",
    guidance: "Enter the password below, then Step A will create and store the pair.",
    remedy: "password",
    taskHint: "api_keys",
  },
  RU_CREATE_KEY_FAILED: {
    code: "RU_CREATE_KEY_FAILED",
    title: "Key creation was refused",
    explain: "The channel refused automatic key creation for this sub-account.",
    guidance: "Retry Step A. If the password is already stored, do not re-enter it unless it was changed at the channel.",
    remedy: "retry",
    taskHint: "api_keys",
  },

  RU_CHILD_LOGIN_REJECTED: {
    code: "RU_CHILD_LOGIN_REJECTED",
    title: "Sub-account login was refused",
    explain: "The channel did not accept the saved sub-account password on its XML API surface.",
    guidance: "Enter the current sub-account password below so Step A can retry automatically.",
    remedy: "password",
    taskHint: "api_keys",
  },
  NO_CHILD_CREDENTIALS: {
    code: "NO_CHILD_CREDENTIALS",
    title: "First API key pair needed",
    explain: "This account has no API key pair stored.",
    guidance: "Save the current sub-account password below. Step A will create and store the pair automatically.",
    remedy: "password",
    taskHint: "api_keys",
  },
  NO_STORED_PASSWORD: {
    code: "NO_STORED_PASSWORD",
    title: "Portal password needed",
    explain: "No password is stored for this sub-account.",
    guidance: "Save the current portal password here so Step A can attempt automatic key creation.",
    remedy: "password",
    taskHint: "api_keys",
  },
  RU_CHILD_KEYS_REJECTED: {
    code: "RU_CHILD_KEYS_REJECTED",
    title: "API key pair was refused",
    explain: "The channel did not accept the stored AccessKey/SecretKey pair.",
    guidance: "Save the current sub-account password below so Step A can replace the rejected pair automatically.",
    remedy: "password",
    taskHint: "verify_keys",
  },
  RU_CHILD_KEYS_WRONG_ACCOUNT: {
    code: "RU_CHILD_KEYS_WRONG_ACCOUNT",
    title: "API key pair belongs to another account",
    explain: "The supplied key pair authenticates a different sub-account.",
    guidance: "Confirm this account binding and save its current password; Step A will create the correct pair automatically.",
    remedy: "password",
    taskHint: "verify_keys",
  },
  RU_CHILD_KEYS_DUPLICATE: {
    code: "RU_CHILD_KEYS_DUPLICATE",
    title: "API key pair is already in use",
    explain: "One AccessKey cannot serve two sub-accounts.",
    guidance: "Save this sub-account's current password; Step A will create a unique replacement pair automatically.",
    remedy: "password",
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
    guidance: "Save the sub-account password below. Step A will create and store the pair automatically.",
    remedy: "password",
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