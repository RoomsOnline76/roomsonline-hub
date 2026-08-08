/**
 * Fee classification — ROL margin vs pass-through.
 *
 * Reps are paid on the revenue a property generates *for ROL*. Some fees we
 * bill simply recover a third-party cost (channel/unit subscription, PriceLabs,
 * payment gateway transaction fees when the property uses the ROL gateway).
 * Those are pass-through: they must be shown transparently but never earn
 * commission and never inflate ROL margin in reporting.
 */

export type FeeMargin = "margin" | "passthrough";

export const DEFAULT_FEE_MARGIN_MAP: Record<string, FeeMargin> = {
  monthly_subscription: "margin",
  rolos_per_unit: "margin",
  white_label_monthly: "margin",
  branding_monthly: "margin",
  wbe_flat: "margin",
  white_label_setup: "margin",
  branding_setup: "margin",
  pricelabs_monthly: "passthrough",
  pricelabs_setup: "passthrough",
  channel_units: "passthrough",
  channel_setup: "passthrough",
  aggregator_setup: "passthrough",
  gateway_transaction_fee: "passthrough",
};

export const FEE_MARGIN_LABELS: Record<FeeMargin, string> = {
  margin: "ROL margin (commissionable)",
  passthrough: "Pass-through (recovered cost)",
};

/** Resolve a fee kind against the configured map, defaulting to ROL margin. */
export function classifyFeeKind(
  kind: string | null | undefined,
  map?: Record<string, FeeMargin> | null,
): FeeMargin {
  if (!kind) return "margin";
  const merged = { ...DEFAULT_FEE_MARGIN_MAP, ...(map || {}) };
  return merged[kind] ?? "margin";
}

export interface MarginSplit {
  gross: number;
  passthrough: number;
  /** gross - passthrough — the commissionable / true ROL margin portion. */
  margin: number;
}

/**
 * Split an invoice's line items into ROL margin vs pass-through. Falls back to
 * treating the whole amount as margin when no line items were captured.
 */
export function splitInvoiceMargin(
  lineItems: Array<{ kind?: string | null; amount?: number | null }> | null | undefined,
  totalAmount: number,
  map?: Record<string, FeeMargin> | null,
): MarginSplit {
  const gross = Number(totalAmount) || 0;
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { gross, passthrough: 0, margin: gross };
  }
  let passthrough = 0;
  for (const line of lineItems) {
    const amount = Number(line?.amount) || 0;
    if (classifyFeeKind(line?.kind, map) === "passthrough") passthrough += amount;
  }
  passthrough = Math.min(passthrough, gross);
  return { gross, passthrough, margin: gross - passthrough };
}
