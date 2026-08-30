---
name: Channel account shell rows are never a binding
description: ru_owner_accounts rows without an OwnerID are leftovers, not bindings; closing/sterilizing deletes the row (incl. portfolio-scoped)
type: feature
---
A `ru_owner_accounts` row with no `ru_owner_id` (and no stored access key) is a **shell** left
behind by a closed account or a sterilized property — it is NOT a distribution binding.

- Binding reads (`findOwnerAccount` in `_shared/ruPhaseGate.ts`, `readBinding` in
  `ru-onboard-property`) skip shells and report the property as unbound. `findOwnerAccount`
  returns the shell separately so Step A provisioning writes into it instead of inserting a
  duplicate row for the same scope.
- Closing an account (`ru-close-user`) **deletes** the row instead of blanking it.
- `sterilize_property` deletes the property-scoped row and also the portfolio-scoped row when
  that row names no live account (blank OwnerID, or an OwnerID retired by the same run).

**Why:** a blanked portfolio row made a disconnected property (Albatros) keep reading as bound
to the dead login `teste@polka.co.za`, blocking a fresh sub-account connection.
