# Sterilize Sealion, PufferFish and Leopard for a brand-new channel connection

Goal: the next connection run treats these three as properties the channel has never seen — new
listings, new account binding, all gates earned again from zero.

## What the database shows today (verified)

- Sealion (`ru-test-2`), PufferFish (`ru-test-1`), Leopard (`ru-test-4`) are all active.
- No distribution account is bound to any of them: no property-scoped or portfolio-scoped account
  rows exist for them, and their gates already read "No distribution account is bound".
- Local listing ids are already blank (property and unit level), but the exchange log still shows
  the listings they used to own at the channel: PufferFish 5833067/5833138/5833147/5842262/5842266/
  5842267/5842270/5842275/5842506, Sealion 5655615-5655618/5763781, Leopard 5806989/5807016/
  5807017/5807024.
- Prior-use residue that would let a reconnect resume instead of start fresh:
  - passed/stale onboarding gate rows for every step (identity, rooms, media, currency, publish,
    pull_listings, ready_to_sell, …)
  - 25 price-coverage rows, 3 currency-state rows, 3 geo/currency authority mappings, 3 certification
    runs, 13 archive events, 2 readiness snapshots
  - **2,516 parked calls in the channel call queue** and 1,933 stored channel notifications for these
    three — this backlog would fire against the new connection the moment keys exist
  - Leopard is flagged archived at the channel with a hold reason, which blocks any push until cleared.

## Plan

1. **Stop the backlog first.** Cancel every queued channel call and drop the stored notifications and
   LNM re-pull entries for the three properties, so nothing from the old life replays into the new
   account.

2. **Clear channel-side leftovers.** For each old listing id above, archive it at the channel using
   whichever account still owns it, and record the outcome. Where the owning account is already
   retired or the listing is unreachable, log it as an orphan in Advanced instead of failing the run —
   an unreachable old listing must not block the fresh push (it can never collide, because the new
   push creates new ids).

3. **Wipe local channel state** for the three properties:
   - blank listing ids, building ids, verification stamps, unmatched lists, archived flags and hold
     reasons on the property and its units
   - delete price-coverage rows, currency-state rows, readiness snapshots, certification runs, the
     `rentals_united` geo/currency authority mappings and archive events
   - reset every onboarding gate row to `pending` with no fingerprint, passed_at or details, so all 13
     steps must be earned again
   - leave push disabled until the gates pass (the edit gate already silences traffic for
     unverified properties)

4. **Keep the history.** `ru_api_log`, `ru_sync_runs` and archive outcomes are the audit trail of what
   was done — those are retained, not deleted. Sterilizing means no *operational* state survives, not
   that the record is erased. (Say the word if you want the history purged too.)

5. **Run it as a one-click admin action**, not a hand-written migration: a `sterilize_property` action
   in the channel portal function, exposed from the channel monitor's Advanced section for
   admin/dev/fearless_leader, with a confirm step naming the property and the listing ids it will
   archive. Reusable next time a test property has to go back to zero.

6. **Verify** for each property: no bound account, all gates pending, zero queued calls, zero coverage
   rows, no listing ids anywhere, and the old listing ids reported archived-or-orphaned. Then run the
   normal Step A → Step B flow and confirm the channel creates brand-new listing ids.

## Technical notes

- New action `sterilize_property` in `supabase/functions/ru-cert-portal/index.ts`, reusing the existing
  archival escalation path (child keys, master fallback, `Push_SetPropertiesStatus_RQ`) and the
  `RU_RATE_DEFERRED` retry loop already in that function.
- Old listing ids are recovered from `ru_api_log` per property, deduplicated, and archived one by one.
- Tables cleared: `ru_call_queue`, `ru_notifications`, `ru_lnm_repull_queue`, `channel_price_coverage_status`,
  `ru_currency_state`, `ru_readiness_snapshots`, `ru_cert_runs`, `ru_archive_events`, plus
  `pms_mappings` rows where `system_type = 'rentals_united'`; `property_channel_step_status` reset to seed.
- Property/unit columns blanked: `rentalsunited_property_id`, `rentalsunited_building_id`,
  `ru_listings_verified_*`, `ru_listings_unmatched`, `ru_archived`, `ru_archived_at`, `ru_hold_reason`,
  `ru_hold_set_*`, `ru_push_enabled = false`, and `hostfully_room_types.rentalsunited_property_id`.
- UI: a "Sterilize property" card in `MasterRosterPanel` / Advanced on the channel monitor, with the
  same searchable property picker used by the onboarding tab.

## Also in flight

The duplicate reservation-message fix from the previous request (claims ledger + terminal refusals, so
one booking event sends exactly one channel message) is already written into the shared booking sync
helpers. Nothing in this plan changes it; the queue purge above simply removes the stuck retries it
was written to stop.
