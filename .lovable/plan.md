# Retire the test channel account 741765 (connect@roomsonline.co.za)

## What is bound today (verified)

- One portfolio-scope channel account row for portfolio "RU test portfolio" (`owner_email: connect@roomsonline.co.za`), with no OwnerID, no keys — the shell the clones inherit from.
- Four properties still tagged to this account via `ru_listings_verified_owner = "connect@roomsonline.co.za (OwnerID 741765)"`: RU Test Clone B, C, D and RU IT Blank Slate – Test Owner.
- Clone B/C/D each hold a Rentals United mapping row, a currency-state row and 14 channel step-status rows. All three are already channel-archived and have push disabled.
- Leftover traffic tied to the account: 739 finished queue rows, 205 notifications and 3 channel-origin bookings on Clone B, 80 repull-queue rows, 30 615 API log rows.
- OwnerID 741765 is **not** in the retired registry (`ru_retired_accounts` holds only 741769, 741771, 741776, 741777, 741778), so roster reads, counts and health alerts still pick it up.

## What will change

- 741765 joins the retired registry, so it is never read, counted, labelled, pushed to or alerted on again — the same treatment the other five dead test accounts get.
- The portfolio's channel account shell is removed, so the test portfolio and its clones inherit no channel account.
- The four properties are fully unbound from the channel: owner tag, verified listing counts, push flag, channel mappings, currency state and channel step progress all cleared. They stay in Properties, active and editable, with all local data (rates, images, units) untouched.
- Parked channel work for the account is closed off: pending/failed queue rows, unprocessed notifications and repull-queue rows for these properties are cleared so nothing retries and the health report stops counting them.
- The three channel-origin test bookings on Clone B keep their history but are relabelled as local records so no channel push is attempted for them.
- API log history is left intact as audit evidence (it is read-only and already excluded from health once the owner is retired).

## Technical detail

Single migration:

1. `INSERT INTO ru_retired_accounts (ru_owner_id, portal_email, reason)` → `('741765', 'connect@roomsonline.co.za', 'Test sub-account and test portfolio — retired 2026-08-22; properties remain local only')` with `ON CONFLICT (ru_owner_id) DO NOTHING`.
2. `DELETE FROM ru_owner_accounts WHERE id = 'd295f4a7-c9e4-428a-a73e-5d59c917f19c'`.
3. For the four property ids (`700a9471…`, `0079ba7c…`, `c7351c08…`, `4b1e0a10-0000-4000-8000-000000000002`):
   - `UPDATE properties SET ru_push_enabled = false, ru_listings_verified_owner = NULL, ru_listings_verified_units = NULL, ru_listings_unmatched = NULL, ru_listings_expected_units = NULL, ru_listings_verified_at = NULL, ru_location_id = NULL, ru_image_tags = NULL, ru_hold_reason = NULL, ru_hold_set_at = NULL, ru_hold_set_by = NULL` (leaving `is_active` and `ru_archived` as they are).
   - `DELETE FROM pms_mappings WHERE system_type ILIKE '%rental%'`, `DELETE FROM ru_currency_state`, `DELETE FROM property_channel_step_status`, `DELETE FROM ru_readiness_snapshots`, `DELETE FROM ru_notifications`, `DELETE FROM ru_lnm_repull_queue`, `DELETE FROM ru_discounts`, `DELETE FROM ru_duplicate_repairs`, `DELETE FROM ru_mcq_orders`, `DELETE FROM ru_cert_runs` for those property ids.
   - `DELETE FROM ru_call_queue WHERE ru_owner_id::text = '741765' OR property_id IN (...)`.
   - `UPDATE bookings SET integration_type = 'rolos', external_reservation_id = NULL WHERE property_id IN (...) AND integration_type LIKE 'rentalsunited%'`, and delete their `booking_sync_status` rows for `external_system = 'rentalsunited'`.

No edge-function code changes are needed — `_shared/ruRetiredAccounts.ts` already filters the roster from the registry.

Verification after the migration: re-query the four properties for a null owner tag and zero mappings, confirm the queue/notification counts for the account are zero, and re-run the channel entitlement read to confirm 741765 is reported as excluded rather than active.
