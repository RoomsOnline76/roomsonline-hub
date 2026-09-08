/**
 * Channel Manager fee/tax vocabulary (client mirror).
 *
 * The distribution layer only accepts a fixed dictionary of fee/tax types. Anything outside it is
 * published as "unknown", which is what makes a fee show up in the channel portal as an unnamed
 * "unknown tax". This module is the single client-side source of truth for:
 *   - which types are accepted,
 *   - how a charge name maps onto one when the operator has not picked a type,
 *   - and whether a charge will be recognised or land as unknown.
 *
 * Keep the codes in step with `supabase/functions/_shared/ruFees.ts` — the wire side uses the same
 * table. Never invent codes: only measured/documented ones are listed here.
 */

export interface ChannelFeeTaxType {
  /** Wire code sent as FeeTaxType. */
  code: number;
  label: string;
  /** Name patterns that auto-select this type when no explicit type is set. */
  match: RegExp;
}

export const CHANNEL_FEE_TAX_TYPES: ChannelFeeTaxType[] = [
  { code: 41, label: "Cleaning fee", match: /clean/i },
  { code: 18, label: "Housekeeping fee", match: /housekeep/i },
  { code: 34, label: "Resort fee", match: /resort/i },
  { code: 33, label: "Service fee", match: /service/i },
  { code: 29, label: "Pet fee", match: /pet/i },
  { code: 31, label: "Parking fee", match: /park/i },
  { code: 36, label: "Tourism tax", match: /touris|city tax|levy/i },
];

/** Code used when nothing in the dictionary fits. Accepted on the wire, but shown as unknown. */
export const CHANNEL_FEE_TAX_UNKNOWN = 0;

export function channelFeeTaxLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return "Worked out from the name";
  const hit = CHANNEL_FEE_TAX_TYPES.find((t) => t.code === code);
  return hit ? hit.label : "Other / unknown";
}

/** The type a charge name maps to on its own, or 0 when the dictionary has no match. */
export function deriveChannelFeeTaxType(name: string): number {
  const hit = CHANNEL_FEE_TAX_TYPES.find((t) => t.match.test(name ?? ""));
  return hit ? hit.code : CHANNEL_FEE_TAX_UNKNOWN;
}

export type ChannelFeeStatus = "recognised" | "unknown" | "deposit" | "not_sent";

export interface ChannelFeeVerdict {
  status: ChannelFeeStatus;
  /** Resolved wire code, when the charge is published as a fee. */
  code: number | null;
  label: string;
  /** Short plain-language explanation for a tooltip. */
  detail: string;
}

const DEPOSIT_PATTERN = /deposit|breakage|damage/i;

/**
 * What the Channel Manager will make of this charge.
 * `channelFeeType` is the operator's explicit pick (null = derive from the name).
 */
export function classifyChannelFee(charge: {
  name?: string | null;
  category?: string | null;
  amount?: number | null;
  is_active?: boolean | null;
  is_included_in_rate?: boolean | null;
  channel_fee_type?: number | null;
}): ChannelFeeVerdict {
  const name = String(charge.name ?? "").trim();
  const category = String(charge.category ?? "").toLowerCase();

  if (category === "deposit" || DEPOSIT_PATTERN.test(name)) {
    return {
      status: "deposit",
      code: null,
      label: "Deposit",
      detail: "Published in the channel's own deposit slot, not as a fee or tax.",
    };
  }
  if (charge.is_active === false || !name || !Number(charge.amount ?? 0)) {
    return {
      status: "not_sent",
      code: null,
      label: "Not sent",
      detail: "Inactive charges and zero amounts are not published to the channel.",
    };
  }
  if (charge.is_included_in_rate) {
    return {
      status: "not_sent",
      code: null,
      label: "Not sent",
      detail: "Already inside the rate, so it is never published on top of it.",
    };
  }

  const explicit = charge.channel_fee_type;
  const code = explicit === null || explicit === undefined ? deriveChannelFeeTaxType(name) : explicit;
  if (code === CHANNEL_FEE_TAX_UNKNOWN) {
    return {
      status: "unknown",
      code,
      label: "Unknown tax",
      detail:
        "The channel has no matching type, so it appears there as an unknown tax. Pick a channel fee type on the charge to fix it.",
    };
  }
  return {
    status: "recognised",
    code,
    label: channelFeeTaxLabel(code),
    detail: `Accepted by the channel as ${channelFeeTaxLabel(code)}.`,
  };
}
