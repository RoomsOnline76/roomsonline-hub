// Deno mirror of src/lib/feeMargin.ts — keep in sync.
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
  margin: number;
}

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
