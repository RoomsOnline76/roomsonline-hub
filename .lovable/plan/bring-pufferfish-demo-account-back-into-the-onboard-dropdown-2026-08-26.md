# Bring PufferFish (DEMO ACCOUNT) back into the Onboard dropdown

## What actually happened (verified)

Changing the distribution account email was done through the Channel Monitor's **owner rebind**, and that flow archives the property as its first leg:

- `ru_archive_events` has one row at 09:44 today: PufferFish, direction `archived`, reason "Owner rebind to julius@polka.co.za from Channel Monitor".
- The property row now reads `ru_archived = true`, `ru_archived_at = 09:44`, and distribution on hold — while `is_active` is still true and Channel Manager is still on.
- The Onboard dropdown deliberately filters out archived listings, so PufferFish disappeared and, being the only eligible member, the DEMO ACCOUNT portfolio entry disappeared with it.

So nothing is wrong with entitlement or the contract (julius@polka.co.za has a signed owner contract). The rebind archives the old listing but never lifts the archive after the property is re-pointed at the new account, leaving it invisible in the one screen that could re-onboard it — a dead end.

## The fix

1. **Rebind ends unarchived.** After all rebind legs succeed (listings archived on the old account, local binding cleared, owner email re-assigned, stale sub-account pointer dropped), clear the archive state on the property: `ru_archived = false`, `ru_archived_at = null`, hold reason cleared. Distribution push stays off until Step A/B run again — that is the normal "unbound, not yet pushed" state, not an archive. Record this as a `reactivated` archive event with the rebind reason so the history reads truthfully: archived off the old account, reactivated on the new one.
2. **Repair PufferFish now.** Clear the leftover archive state on this property so it reappears in the dropdown under the DEMO ACCOUNT portfolio entry, ready for Step A against julius@polka.co.za. No channel call — the listing was already archived on the old account.
3. **No more silent disappearance.** In the Onboard dropdown, archived-but-otherwise-eligible properties are still hidden by design, but the picker gains a short note when a deep-linked or expected property is excluded because it is archived, pointing to the Channel Monitor archive controls — so this state is explained instead of just missing.

## Technical notes

- `supabase/functions/ru-onboard-property/index.ts` (`rebind_owner`): after Leg 4 succeeds, update `properties` for the rebound id with `ru_archived: false, ru_archived_at: null, ru_hold_reason: null, ru_hold_set_at: null` (leaving `ru_push_enabled` false), insert the matching `ru_archive_events` row (`direction: 'reactivated'`), and add the leg to the returned `legs` array. Failure of this leg reports as `REBIND_FAILED` like the others.
- One-off SQL: clear `ru_archived`/`ru_archived_at`/hold fields for property `2f5d0f79-3763-42fd-87a9-5c20ab36cb32` (PufferFish).
- `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`: keep the `ru_archived` exclusion, but capture the archived ids in the same query pass so `requestNotice` can say "PufferFish is archived at the Channel Manager — reactivate it to onboard" instead of an unexplained blank.
- No change to eligibility rules, entitlement, contracts, grading, or any outbound channel call.
