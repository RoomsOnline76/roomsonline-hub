/**
 * BYO (bring-your-own) payment gateway — setup recommendations.
 *
 * When an admin enables the BYO gateway add-on for a property, the owner still
 * has work to do inside their own gateway account before real money can move.
 * These are the recommended steps, per provider.
 */

export interface ByoChecklistItem {
  id: string;
  title: string;
  detail: string;
  /** Required steps block live payments; optional ones are nice-to-have. */
  required: boolean;
  docsUrl?: string;
  /**
   * When set, the item can be auto-marked from backend settlement info:
   *  - "live_mode": satisfied when the resolved account is not in sandbox
   *  - "credentials": satisfied when BYO credentials resolve successfully
   *  - "onsite": satisfied when the gateway reports onsite capture available
   */
  autoKey?: "live_mode" | "credentials" | "onsite";
}

const GENERIC_ITEMS = (label: string, docsUrl?: string): ByoChecklistItem[] => [
  {
    id: "account_live",
    title: `${label} account approved and switched to live mode`,
    detail:
      "Complete the provider's onboarding/FICA checks and move the account out of test/sandbox. While the account is in sandbox, guest payments are not real.",
    required: true,
    autoKey: "live_mode",
    docsUrl,
  },
  {
    id: "live_keys",
    title: "Live API keys saved here (not test keys)",
    detail:
      "Copy the live credentials from your provider dashboard into the fields on this page and save. Test keys will make real checkouts fail.",
    required: true,
    autoKey: "credentials",
  },
  {
    id: "webhook",
    title: "Payment notification / webhook enabled",
    detail:
      "The provider must call back to us when a payment succeeds — without it, paid bookings stay pending and confirmation emails are not sent.",
    required: true,
    docsUrl,
  },
  {
    id: "refunds",
    title: "Refunds via API permission enabled",
    detail:
      "Optional, but required if you want to issue guest refunds directly from ROLOS instead of logging into the provider.",
    required: false,
  },
  {
    id: "settlement_bank",
    title: "Settlement bank account verified",
    detail:
      "Confirm the payout account with your provider so takings settle to you. Payments run through your merchant account, not Rooms Online.",
    required: true,
  },
];

const PAYFAST_ITEMS: ByoChecklistItem[] = [
  {
    id: "account_live",
    title: "PayFast account approved and switched to live mode",
    detail:
      "Your merchant account must be out of sandbox. While sandbox is active, checkout runs against PayFast's test environment and no money moves.",
    required: true,
    autoKey: "live_mode",
    docsUrl: "https://developers.payfast.co.za/docs#quickstart",
  },
  {
    id: "credentials",
    title: "Live Merchant ID and Merchant Key saved here",
    detail:
      "Found under Settings → Integration in your PayFast dashboard. Paste them into the PayFast fields on this page and save.",
    required: true,
    autoKey: "credentials",
  },
  {
    id: "passphrase",
    title: "Security passphrase set in PayFast and entered here",
    detail:
      "PayFast → Settings → Security passphrase. The same value must be saved here, otherwise signature validation fails and payments are rejected.",
    required: true,
    docsUrl: "https://developers.payfast.co.za/docs#signature_generation",
  },
  {
    id: "itn",
    title: "ITN (Instant Transaction Notification) enabled",
    detail:
      "PayFast → Settings → Notifications. ITN is how we learn a booking was paid — without it bookings stay unconfirmed even after a successful payment.",
    required: true,
    docsUrl: "https://developers.payfast.co.za/docs#notifications",
  },
  {
    id: "onsite",
    title: "Onsite Payments activated (optional)",
    detail:
      "Request 'Onsite Payments' from PayFast support to keep guests in an in-page card modal. If it is not activated, checkout automatically uses PayFast's secure hosted redirect — both work.",
    required: false,
    autoKey: "onsite",
    docsUrl: "https://developers.payfast.co.za/docs#onsite_payments",
  },
  {
    id: "refunds",
    title: "Refunds via API permission enabled (optional)",
    detail:
      "Needed only if you want to process guest refunds from inside ROLOS. Ask PayFast to enable API refunds on your account.",
    required: false,
  },
  {
    id: "settlement_bank",
    title: "Settlement bank account verified with PayFast",
    detail:
      "Takings settle directly into your own PayFast account on your payout cycle — confirm the bank account and payout frequency.",
    required: true,
  },
];

const PROVIDER_ITEMS: Record<string, ByoChecklistItem[]> = {
  payfast: PAYFAST_ITEMS,
  paygate: GENERIC_ITEMS("PayGate", "https://developer.paygate.co.za/"),
  peach: GENERIC_ITEMS("Peach Payments", "https://developer.peachpayments.com/"),
  yoco: GENERIC_ITEMS("Yoco", "https://developer.yoco.com/"),
  ozow: GENERIC_ITEMS("Ozow", "https://hub.ozow.com/docs/"),
  dpo: GENERIC_ITEMS("DPO Pay", "https://docs.dpopay.com/"),
  addpay: GENERIC_ITEMS("AddPay", "https://cnp-developer.addpay.cloud/"),
  payflex: GENERIC_ITEMS("Payflex", "https://docs.payflex.co.za/"),
  snapscan: GENERIC_ITEMS("SnapScan"),
  zapper: GENERIC_ITEMS("Zapper"),
  stripe: GENERIC_ITEMS("Stripe", "https://docs.stripe.com/"),
  paypal: GENERIC_ITEMS("PayPal", "https://developer.paypal.com/docs/"),
  adyen: GENERIC_ITEMS("Adyen", "https://docs.adyen.com/"),
  flutterwave: GENERIC_ITEMS("Flutterwave", "https://developer.flutterwave.com/"),
  paystack: GENERIC_ITEMS("Paystack", "https://paystack.com/docs/"),
};

/** Checklist for a provider (falls back to a generic list for unknown ones). */
export function getByoChecklist(provider: string | null | undefined): ByoChecklistItem[] {
  if (!provider) return PAYFAST_ITEMS;
  return PROVIDER_ITEMS[provider] || GENERIC_ITEMS("Your gateway");
}

export interface ByoAutoState {
  /** Backend resolved BYO credentials for this property. */
  credentialsResolved?: boolean;
  /** Backend reports the resolved account is in sandbox. */
  isSandbox?: boolean;
  /** Backend reports onsite capture is available. */
  onsiteSupported?: boolean;
}

/** Items the backend can confirm on the owner's behalf. */
export function autoCompletedIds(
  items: ByoChecklistItem[],
  state: ByoAutoState,
): string[] {
  const done: string[] = [];
  for (const item of items) {
    if (item.autoKey === "credentials" && state.credentialsResolved) done.push(item.id);
    if (item.autoKey === "live_mode" && state.credentialsResolved && state.isSandbox === false)
      done.push(item.id);
    if (item.autoKey === "onsite" && state.onsiteSupported) done.push(item.id);
  }
  return done;
}

export interface ByoProgress {
  total: number;
  completed: number;
  requiredTotal: number;
  requiredCompleted: number;
  requiredOutstanding: ByoChecklistItem[];
}

export function computeByoProgress(
  items: ByoChecklistItem[],
  completedIds: string[],
): ByoProgress {
  const set = new Set(completedIds);
  const required = items.filter((i) => i.required);
  return {
    total: items.length,
    completed: items.filter((i) => set.has(i.id)).length,
    requiredTotal: required.length,
    requiredCompleted: required.filter((i) => set.has(i.id)).length,
    requiredOutstanding: required.filter((i) => !set.has(i.id)),
  };
}

/** Key used inside integration_configs.config for saved ticks. */
export const BYO_CHECKLIST_KEY = "byo_checklist";

/** Reads saved tick ids out of a payment_credentials config blob. */
export function readSavedChecklist(config: unknown): string[] {
  if (!config || typeof config !== "object") return [];
  const raw = (config as Record<string, unknown>)[BYO_CHECKLIST_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}
