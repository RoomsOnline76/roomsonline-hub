/**
 * When a property's owner is unbound or replaced, paid once-off setup fees
 * become chargeable again and the current subscription is cancelled then
 * invalidated so the new owner must start a fresh one.
 */
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionError } from "@/lib/functionError";

export type OwnerBillingResetReason = "owner_changed" | "owner_unbound";

export interface OwnerBillingResetResult {
  ok: boolean;
  skipped?: boolean;
  cancelledSubscription?: boolean;
  message?: string;
}

async function invokeReset(
  scope: "property" | "portfolio",
  entityId: string,
  reason: OwnerBillingResetReason,
): Promise<OwnerBillingResetResult> {
  const { data, error } = await supabase.functions.invoke("subscription-billing-actions", {
    body: { action: "reset_for_owner_change", scope, entity_id: entityId, reason },
  });
  if (error) {
    const message = await extractFunctionError(error, "Could not reset billing for the owner change");
    if (/no_billing_config/i.test(message)) return { ok: true, skipped: true };
    return { ok: false, message };
  }
  if (data?.error) {
    if (String(data.error) === "no_billing_config") return { ok: true, skipped: true };
    return { ok: false, message: String(data.error) };
  }
  return {
    ok: true,
    skipped: data?.skipped === true,
    cancelledSubscription: data?.cancelled_subscription === true,
  };
}

/** Reset billing for the scope a property actually uses (portfolio if shared). */
export async function resetBillingAfterOwnerChange(
  propertyId: string,
  reason: OwnerBillingResetReason,
): Promise<OwnerBillingResetResult> {
  const { data: mem } = await supabase
    .from("property_portfolio_members")
    .select("portfolio_id")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (mem?.portfolio_id) return invokeReset("portfolio", mem.portfolio_id, reason);
  return invokeReset("property", propertyId, reason);
}

/** Reset billing for a known portfolio or property scope (RU unbind). */
export async function resetBillingForScope(
  scope: "property" | "portfolio",
  entityId: string,
  reason: OwnerBillingResetReason = "owner_unbound",
): Promise<OwnerBillingResetResult> {
  return invokeReset(scope, entityId, reason);
}
