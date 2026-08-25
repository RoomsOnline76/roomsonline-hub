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
};

export function getStepARemedy(code: string | null | undefined): StepARemedy | null {
  if (!code) return null;
  return CHANNEL_STEP_A_REMEDIES[code] ?? null;
}