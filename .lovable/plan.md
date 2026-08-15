# Read-back follows the push automatically

Today a push clears the listing verification and nothing pulls it back, so step 10 sits on "Pushed but not read back — fetch the Channel Manager IDs to confirm" with no button anywhere near the warning. The read-back is a normal part of publishing, not a separate chore.

## What changes

1. **Every successful push ends with a read-back.** As soon as a live push finishes, the listings are pulled back from the distribution account and matched, so the property lands directly on either "listings read back, N/N confirmed" or an explicit failure. No user action, no in-between state.
2. **Wizard publish step chains it too.** "Publish now" runs push then read-back before it refreshes, and its toast reports the confirmed listing count instead of just "published".
3. **Manual fetch only appears when the read-back did not confirm.** In that case the publish step shows a short line ("Pushed, but the channel has not confirmed the listings yet") with a single "Fetch Channel Manager IDs" button right there, and the reason from the channel if there was one. Once confirmed, the button disappears again.
4. **The re-push stays where it is** — behind the existing "Manual re-push (not needed)" disclosure. Nothing about push gating, readiness scoring or the checklist wording for other steps changes.

## Technical notes

- `supabase/functions/push-property-to-ru/index.ts`: instead of only nulling `ru_listings_verified_at` before the push, run the read-back after a successful non-dry-run push by invoking `ru-cert-portal` `resolve_ru_property_ids` with the service-role client, and return its outcome (`listings_verified`, `verified_units`, `expected_units`, `unmatched`) in the push response. Failures are logged and surfaced as unverified — they must not turn a successful push into a failure.
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx`: add a `verifyListings` callback (invoke `resolve_ru_property_ids`, then `refresh()`); call it after `publishListing` succeeds, and render it as the inline "Fetch Channel Manager IDs" action in the publish step when listing IDs exist but `ru_listings_verified_at` is empty.
- `src/components/property/PushToRentalsUnited.tsx`: call the existing `resolveRuIds()` at the end of a successful push, and show the same conditional fetch action next to the verification badge rather than as a permanent button.
- `useRolosOnboardingProgress.ts`: reword the `listings_verified` detail to state that the confirmation is pending/failed, since the fetch is now offered in the step itself.
- No schema, gate or readiness-scoring changes.
