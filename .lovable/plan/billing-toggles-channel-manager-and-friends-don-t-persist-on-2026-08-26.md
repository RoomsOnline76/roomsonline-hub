# Billing toggles (Channel Manager and friends) don't persist on save

## What I confirmed

- The property on screen (RU Test CloneB) has a per-property billing row whose Channel Manager flag is still off, and it was last written on 18 August — so recent saves are not landing at all.
- Write access to billing configuration is granted to **admin** and **dev** only, on both the property and the portfolio billing tables. `fearless_leader` — which everywhere else in the system has admin parity — has no write access, so a save from that account is refused by the database.
- The schedule/columns are fine: every field the Billing tab sends exists on both tables, and both have the unique keys the save relies on, so this is not a schema mismatch.
- The confirm dialog and the backend billing-change call do not write back over the toggles, so nothing is overwriting a successful save.

Whether the failing account is `fearless_leader` or something else, the underlying UX problem is the same: a refused save can leave the screen looking unchanged with the toggle silently reverting on the next refresh. So the fix has two parts.

## 1. Give `fearless_leader` billing write parity (database)

One migration adding `fearless_leader` alongside admin/dev to the manage policies on the property billing configuration and portfolio billing configuration tables, and making the write check explicit rather than inherited. Owner read access is unchanged; no owner gains write access.

## 2. Make a failed save impossible to miss, and prove the write landed

In the Billing tab / billing hook:

- After the save, read the row back and compare the toggles that were just submitted (Channel Manager, white label, branding pack, PriceLabs, payment model, billing enabled). If any value did not land, show a clear error — "Billing configuration was not saved (no permission to write billing for this property)" — instead of the current success message.
- Only fan out the Channel Manager entitlement (re-activating or archiving listings at the Channel Manager) **after** the row is confirmed saved. Today the fan-out runs even when the save failed, so listings could be flipped while billing still says off.
- Keep the form showing what the user chose after a failed save (do not silently snap back to the stored values), so the pending change is visible and can be retried.
- Surface the database refusal message verbatim in the error toast for admin/dev/fearless-leader viewers.

## Technical notes

- Migration: `ALTER POLICY`/recreate the manage policies on `property_billing_configs` and `portfolio_billing_configs` to `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'dev') OR has_role(auth.uid(),'fearless_leader')` for both USING and WITH CHECK. No table, column, or grant changes.
- `src/hooks/useBillingConfig.ts`: post-upsert read-back and verification, mutation resolves with a `verified` flag; error path keeps the local form state.
- `src/components/property/BillingConfigTab.tsx`: gate `runEntitlementFanOut` and the channel-step regrade on `verified`, and stop the config→form effect from clobbering unsaved edits after a failure.

## Verification

- Save the Channel Manager toggle on this property as admin and as `fearless_leader`: the stored row shows the new value and the success toast only appears once the read-back agrees.
- Simulate a refusal (owner account): an explicit permission error toast, the toggle stays where the user put it, and no listings are archived or re-activated.
