/**
 * Pending arrival-policy draft bridge.
 *
 * The Arrival policy editor (Policies tab) owns
 * `properties.amenities.house_rules.check_in_instructions` and writes it directly.
 * Owners, however, routinely type a policy and then press the property form's own
 * Save bar instead of the panel's Save button. That save rebuilt `house_rules` from
 * the stored value and silently dropped the draft, which reads as "it does not save".
 *
 * The panel publishes its in-progress text here; the property form picks it up at
 * submit time so either Save button persists the same text. The form then broadcasts
 * a saved event so the panel can re-sync from the database.
 */

const drafts = new Map<string, string>();

export const ARRIVAL_POLICY_SAVED_EVENT = "rolos:arrival-policy-saved";

/** Publish the panel's current text for `propertyId` (empty string clears the policy). */
export function setArrivalPolicyDraft(propertyId: string, text: string): void {
  if (!propertyId) return;
  drafts.set(propertyId, text);
}

/** The pending draft, or `undefined` when the panel has nothing unsaved. */
export function getArrivalPolicyDraft(propertyId: string): string | undefined {
  return propertyId ? drafts.get(propertyId) : undefined;
}

export function clearArrivalPolicyDraft(propertyId: string): void {
  if (propertyId) drafts.delete(propertyId);
}

/** Tell any mounted arrival-policy editor that the stored value changed. */
export function notifyArrivalPolicySaved(propertyId: string): void {
  if (typeof window === "undefined" || !propertyId) return;
  window.dispatchEvent(new CustomEvent(ARRIVAL_POLICY_SAVED_EVENT, { detail: { propertyId } }));
}
