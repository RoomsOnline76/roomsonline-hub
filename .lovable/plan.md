# Enforce revoked contracts before listing

## Outcome
- A revoked owner contract immediately removes every covered property from the public website and stops new bookings.
- The property cannot be listed again until a newer contract has been issued and signed.
- A revoked contract is not shown as the current contract on the property edit page; staff can issue the replacement from the contracts area.

## Changes
1. Make contract validity use the latest contract version only. An older signed or overridden version cannot remain valid after a newer revoked, sent, viewed, declined, or draft version.
2. Move revocation through a protected backend action that creates the revoked version and atomically sets covered properties to `show_on_website = false` and a non-live listing status.
3. Add a database safety rule preventing a property from being switched back on when its latest applicable contract is not signed or overridden.
4. Update public property reads with the same latest-contract condition as defence in depth, so stale flags cannot expose or book an invalid listing.
5. Hide revoked contract details/status from the property editor while retaining the full audit history in Admin Contracts.
6. Repair the currently revoked Jongensfontein portfolio properties so none remain publicly listable.
7. Add focused tests for: revoked supersedes signed; replacement sent remains blocked; replacement signed restores eligibility; revoked is absent from the property editor.

## Technical notes
- Owner email matching remains case-insensitive.
- Existing admin overrides remain valid only when they are the newest contract version.
- No contract history is deleted.
