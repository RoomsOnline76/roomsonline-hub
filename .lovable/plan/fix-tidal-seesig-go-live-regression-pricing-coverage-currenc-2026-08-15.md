# Fix Tidal / Seesig go-live regression (pricing coverage, currency, slow load)

## What I verified in the data

- **Tidal Pools pricing is a broken link, not missing rates.** All four active units (Elf, Geelstert, Leervis, Wildeperd) point at ROL'OS room-type records that no longer exist: `hostfully_room_types.linked_rolos_id` references ids that are absent from `rolos_room_types`, while the property's four live room types were re-created on 13 Aug 2026 with new ids. The single active rate plan ("Rack", base 1000, primary sell, push to channels) is linked to those **new** ids. The rate resolver keys everything off `linked_rolos_id`, so for these units it finds no rate plan, no rack rate and no season rate → the 365-day coverage probe reports the window as unpriced. Tidal is the only property in the database with dangling links, which matches "it passed before".
- **Seesig's unit links are intact** (all nine units resolve to an active plan), so its pricing coverage is not the blocker.
- **Location & currency blocks on both properties for the same reason.** `ru_currency_state` for both rows reads `flip_outcome = already_set`, reason "Rentals United location 83272 already holds ZAR", with `ru_reported_currency_iso` and `verified_at` **null**. The mandatory `currency_verified` check only passes when a read-back value equals the published currency, so a property whose currency was already correct can never satisfy it — no flip means no read-back is recorded.
- **Slow go-live load is structural.** `property_readiness` always runs a full dry-run push, then for every mapped unit fires `get_availability` + `get_prices` against the channel. Those calls pass through the one-call-per-method-per-minute sliding-window gate, which can sleep up to 25s per call, and nothing is cached between opens.

## Changes

### 1. Repair and protect the unit → rate-plan link
- Data repair: repoint each Tidal unit's `linked_rolos_id` to the matching active `rolos_room_types` row (matched by name within the property), leaving rates untouched.
- Make the breakage impossible to hide: when a unit resolves to no active rate plan, readiness reports a distinct mandatory blocker ("unit is not linked to a rate plan") with a fix link to Rate Plans, instead of the misleading "rates missing for the next 365 days".
- Harden the room-type sync so replacing a ROL'OS room type re-points existing unit links by name instead of orphaning them.

### 2. Accept an already-correct currency as verified
- When the currency decision resolves to `already_set` (the channel location already holds the authored currency), record that as the read-back: write `ru_reported_currency_iso` and `verified_at` from the channel's own location/currency authority.
- Update the currency readiness check so `already_set` with a recorded channel value passes, while a genuine mismatch or an unread listing still fails.
- Backfill the two Jongensfontein rows (Tidal, Seesig) so the wizard stops blocking on a currency that is already correct on both sides.

### 3. Make go-live status load fast
- Paint the local (ROL'OS-scored) readiness immediately, then refine with the live channel probe in the background — the same pattern already used on the onboarding queue.
- Cache the live probe result per property for a short window so re-opening the panel does not re-pull availability and prices.
- Cap the probe's rate-gate wait: when a live pull cannot get its slot, report it as pending verification (advisory) rather than blocking the score or holding the UI.

### 4. Re-verify
- Confirm Tidal reports full 365-day pricing coverage from calendar seasons plus the rack fallback, and that both properties clear Location & currency.
- Confirm the onboarding page shows both properties ready again and that opening go-live status is fast.

## Technical notes

- Touched: `supabase/functions/_shared/rateResolution.ts` (unlinked-unit signal), `_shared/ruReadiness.ts` + `_shared/ruCurrency.ts` (currency verification semantics), `supabase/functions/ru-cert-portal/index.ts` (coverage reporting, probe caching/budget), `src/hooks/useChannelReadiness.ts` and the readiness scorecard (local-first paint), plus one data-repair migration and a room-type sync guard.
- No adapter-locked region is modified; the shared resolver stays the single pricing authority for checkout and channels.
