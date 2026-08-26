# Stop the distribution email change from un-listing a property

## What actually happened (verified)

- PufferFish is `is_active = true`, `ru_archived = false` — it is not archived this time.
- Its `owner_email` is now `dawienew@polka.co.za`.
- There is **no** contract for that address: the only contracts on this owner are `dawie@polka.co.za` (status `overridden`, yesterday) and `julius@polka.co.za` (`signed`). PufferFish has no `property_contracts` row either.
- The Onboard picker requires a signed/overridden contract matched on the property's **current** `owner_email`, so the moment the distribution email was re-assigned the property stopped matching any contract and silently vanished from the dropdown.

So the dropdown is behaving as designed; the design is wrong. The channel sub-account login and the contracting owner identity are being stored in the same field, so changing a channel login revokes the property's contract standing.

## The fix

1. **Separate the channel login from the contracting owner.**
   The re-assign action in Onboard/Channel Monitor stops overwriting `properties.owner_email`. The chosen distribution login is written only to the channel account record (the `ru_owner_accounts` binding for the property/portfolio) and read from there by Step A. `owner_email` keeps meaning "the owner we contract with" and is changed only from the property/owner record, never by a channel rebind.

2. **Contract eligibility follows the owner, not one email string.**
   The picker treats a property as contract-approved when a signed/overridden contract exists for any of: the property's `owner_email`, any linked owner on `property_owners`, or a `property_contracts` row for that property. This survives an email correction on the owner record.

3. **Never disappear silently.**
   When a deep-linked or expected property is excluded, the picker says why — "no signed contract for <email>" or "Channel Manager add-on not enabled" or "archived at the Channel Manager" — instead of an unexplained blank list.

4. **Repair the current data.**
   Point PufferFish's distribution login at the intended new address on the channel account record and restore `owner_email` to the contracted owner, so it reappears in the dropdown under the DEMO ACCOUNT portfolio entry. No channel call is made by the repair.

## Technical notes

- `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`: rebind call sends the login change only; eligibility query adds `property_owners` emails to the contract match set and keeps the ids of excluded-but-active properties with a reason so `requestNotice` can name it.
- `supabase/functions/ru-onboard-property/index.ts` (`rebind_owner`): write the new login to the owner-account binding and Step A's resolution source; drop the `properties.owner_email` write. Existing archive/reactivate legs unchanged.
- Step A already prefers an explicit confirmed login, then the binding, then the property owner email — after this change the binding is the authority for a rebound property.
- One-off SQL for PufferFish only; no schema change beyond (if absent) a login column on the channel account binding.
