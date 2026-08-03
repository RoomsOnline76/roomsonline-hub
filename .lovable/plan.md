# Bring the new policy library into the Policies section

## What's actually happening

The master-first policy work landed, but it was mounted in the wrong place. Confirmed by reading the code:

- `PoliciesTab` (master policy panel + policy library table + portfolio activation) is rendered only inside `RateManagerTab` — i.e. under **Rates & Pricing → Policies** subtab.
- The left-rail section you are looking at (**Guest Experience → Policies**, `house-rules` section in both `/admin/edit property` and `/pms/property-setup`) still renders the original inline block in `src/pages/PropertyForm.tsx`: the toggle chips, the free-text "Cancellation Policies" forfeit rows stored in the amenities JSON, deposit/check-in/age cards.

So nothing is broken — the new UX simply isn't on the screen in your screenshots.

## The fix

Make the Guest Experience → Policies section the single home for cancellation terms.

1. In the `house-rules` section of `PropertyForm.tsx`, replace the legacy "Cancellation Policies" forfeit-rows card with the full `PoliciesTab` block (master policy panel, policy library table with usage metrics, specials cross-links, portfolio library). Keep the rest of the section untouched: rules chips, children policy, deposit, same-day, check-in/out, age ranges, cot/extra beds, advance notice, pets.
2. Wire the section's `cancellation` sub-nav chip to scroll to that block, and keep `checkin` / `policies` chips pointing at their existing cards, so the three chips in the rail map to real content.
3. Pass the existing `onOpenSpecials` handler through so "Open Specials tab" inside the library still navigates to Specials.
4. Remove the duplicate `PoliciesTab` mount from `RateManagerTab` and leave a one-line pointer in the Rates → Policies subtab ("Cancellation policies live under Guest Experience → Policies") so there is one source of truth and no drift between two editors.
5. Legacy data: the old amenities `cancellation_policies` rows keep saving as-is for now (channels that read them are unaffected), but the section no longer offers them for editing — the library is the authoring surface.

## Technical notes

- Files: `src/pages/PropertyForm.tsx` (house-rules section body, ~lines 6548-6605 removed and replaced with `<PoliciesTab propertyId={propertyId} onOpenSpecials={...} />`), `src/components/property/RateManagerTab.tsx` (drop the mount, add pointer).
- No schema change: `rolos_reservation_policies`, `properties.cancellation_master_mode`, and the resolver hooks already exist and are used by checkout.
- Both `/admin/edit property` and ROLOS `/pms/property-setup` render the same `PropertyForm`, so one change covers both screens.
