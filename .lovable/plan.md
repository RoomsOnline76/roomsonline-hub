# RU first-list cut: skip no-op currency writes, collapse availability ranges

Rentals United adapter only. No calendar, booking, PropertyForm, wizard or dashboard work. The shipped onboard lean-out (one roster read, OwnerID-only child key, one price pull, no second ARI after SetStatus) stays exactly as it is, and the connected-property delta lean-out remains a separate PR.

## Fix 1 — stop paying for `Push_ChangeCurrency_RQ` when the location already holds the currency

Confirmed in the code: `decideRuCurrency` in `supabase/functions/_shared/ruCurrency.ts` is the single writer (it invokes `rentalsunited-api` action `push_change_currency`, which builds the only `Push_ChangeCurrency_RQ` XML). It skips the write only when the currency is known from a channel read-back on that account (`ru_location_currency_scope.source = 'ru_readback'`) or a durable listing-level verdict for that property. A brand-new OwnerID has neither, so the first list always writes — and RU answers 339 "Location already has the requested currency set".

Changes:

- A successful write (status 0 or 339) already records the scoped value with `source: 'flip'`. Make that recorded value sufficient to skip a *repeat write* for the same OwnerID + LocationID + ISO while it is fresh. Read-back stays the only evidence allowed to influence the ZAR-vs-USD publication decision, so the USD fallback logic is untouched.
- Add a location-level last-seen currency fallback: when no scoped row exists for this new account but another account's write on the *same LocationID* returned 0/339 for the same ISO, skip the write on the first list and let the existing `Pull_ListSpecProp_RQ` evidence step confirm afterwards.
- Brand-new location with nothing known: exactly one ChangeCurrency is still allowed. 339 is treated as success (already the case), persisted, never retried, and never fails the listing create.
- Comparison is case-insensitive ISO. On skip, log to `ru_sync_runs` with `skipped: true`, `reason: 'currency_already_set'`, plus `trigger`, `location_id`, `authored_currency`, `published_currency`, `ru_status` when a write happened.
- ChangeCurrency keeps its current position in the sequence; it is not moved after `PutProperty`.

## Fix 2 — collapsed `Push_PutAvbUnits_RQ` payload

Unconfirmed root cause. The two traces (SeaLion 21s / 35.6 kB vs Leopard 1.1s / 1.2 kB) logged identical availability coverage (`366/366 days, 0 filled, 42 overlaps resolved`) and identical manual-restriction stats, so the recorded evidence does not yet explain the size gap. First step is therefore to measure, not to guess.

1. Log the built entry count and payload bytes for `Push_PutAvbUnits_RQ` in `ru_sync_runs` details (prices already log `prices_payload`), so a fat payload is attributable instead of inferred.
2. Add a shared `collapseAvbRanges(entries)` helper in `_shared/` and run every availability payload through it immediately before the XML build, on both the first-list and `refresh_ari` paths. It merges consecutive days that share units, min stay, max stay and changeover into a single `From/To` range, sorted by unit then `from`, and ignores internal-only fields (notably `seasonId`, which never reaches the wire — today's recompression keys on it and can fragment a uniform year into many ranges).
3. Two known day-exploders keep their behaviour but stop leaking per-day nodes onto the wire: the per-day-of-week changeover expansion (skipped entirely when every weekday code equals the default) and the manual-override overlay. Reserved-day split-and-retry stays exactly as it is — its splits survive collapsing because the closed days differ.
4. Golden tests: 365 identical open days collapse to one range; five closed nights mid-year yield three ranges; multi-unit emits ranged dates per unit rather than a day-exploded copy. Added as new fixtures alongside `supabase/functions/_shared/__fixtures__/ari/`; existing goldens are only updated if they encoded per-day nodes, with the reason recorded.

Prices are left alone (both traces were already ~1 kB).

## Technical scope

- `supabase/functions/_shared/ruCurrency.ts` — skip gate, location-level last-seen fallback, skip logging.
- `supabase/functions/_shared/` — new `collapseAvbRanges` helper plus its test/fixtures.
- `supabase/functions/push-property-to-ru/index.ts` — targeted edits only: call the collapse helper before the availability push, add payload instrumentation. The file is not rewritten.
- No changes to `rentalsunited-api` XML shapes, `adapter-contract.ts`, the crons, `channelSavePush.ts` / `restrictionSync.ts` / `channelContentSync.ts`, or anything under `src/pages` and `src/components`.

## Acceptance

- Every `Push_ChangeCurrency_RQ` path runs through the one skip gate; a first list on a location already known to be ZAR makes zero currency HTTP calls and logs `currency_already_set`; a 339 still persists and the listing still goes live.
- Collapse tests pass; a uniform open year does not emit hundreds of same-day `<Date From To>` siblings.
- First list still shows one calendar pull, one price pull, and no `refresh_ari` after SetStatus.
