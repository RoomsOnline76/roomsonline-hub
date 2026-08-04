# Step 6 — Reservation ingestion: idempotency + channel-creator mapping

## Verified current state

- `ru-reservation-handler` (RLNM push) uses the shared parser `_shared/ruReservationParsing.ts`, applies currency revert (`loadCurrencyState`/`revertAmount`), and writes holds for unconfirmed requests.
- `cron-pull-ru-reservations` carries its **own inline copy** of the same parser/notes builder (lines ~280–355) — already drifted: it has no currency revert at all (no `loadCurrencyState` reference in the file) and a different placeholder guest email.
- There is **no unique constraint** on `bookings.external_reservation_id` (only a text column added by migration; the only unique reservation keys are on `pms_reservations` and channel reservations). Both ingestion paths guard with a `select … maybeSingle()` then insert, so a notification arriving while the 30-minute cron is mid-run can create two bookings for one RU reservation.
- RU `Creator` is parsed and stored inside `modification_notes.creator` only. `booking_channel` is hardcoded `'rentals_united'` on every path, so the dashboard cannot tell a LekkeSlaap booking from a Booking.com one, and no creator→channel mapping exists anywhere in the codebase.
- The certification portal registers `pull_reservations` / `Pull_ListReservations_RQ` and lead pulls, but has **no reservation idempotency action** (unlike Step 3/4/5 which each gained duplicate tests).

## What gets built

### 6a. One parser, one write path (removes drift)
- Delete the inline parser, notes builder, unit resolver and availability helper from `cron-pull-ru-reservations` and import the shared `_shared/ruReservationParsing.ts` versions (already used by the handler).
- Move the confirmed/request/cancelled write logic into a shared `ingestRuReservation()` in `_shared/ruReservationParsing.ts` so both the push handler and the poll cron produce byte-identical booking rows, including the currency revert the cron is missing today.

### 6b. True idempotency
- Migration: partial unique index on `bookings (external_reservation_id)` where `integration_type in ('rentalsunited','rentalsunited_lead')` and `external_reservation_id is not null`.
- Switch both paths from select-then-insert to a conflict-aware upsert on that index, so a replayed RLNM push, a duplicate `<Reservation>` block, or an overlapping cron run updates in place instead of duplicating.
- Same treatment for the lead path (`LeadID`), plus dedupe of the `ru_notifications` log by `(ru_reservation_id, event_type, raw hash)` within a short window.

### 6c. Channel-creator username mapping
- New `ru_channel_creators` table: `creator_username`, `channel_key` (matching `src/config/channelRegistry.ts`), `channel_label`, `ru_channel_id`, `is_active`. Seeded from `Pull_ListSalesChannels_RQ` results (the already-resolved LekkeSlaap ChannelID) plus a small default map for the common OTAs.
- On ingestion, resolve `Creator` → mapping row and write:
  - `booking_channel` = resolved channel key (e.g. `lekkeslaap`), falling back to `rentals_united` when unknown;
  - `modification_notes.ru_channel = { creator, channel_key, channel_label, ru_channel_id, resolved: bool }`.
- Unknown creators are recorded once in `ru_notifications` as `unmapped_creator` so operators can add the mapping.
- Admin UI: a small "Channel creators" table in the RU integrations page listing mappings, resolved from sales channels with an add/edit row for unmapped creators seen in the last 90 days.
- Booking card / dashboard shows "Booked via <channel label> (Rentals United)" instead of a bare RU label.

### 6d. Certification coverage
Add to `ru-cert-portal`:
- `reservation_idempotency_test` — pulls reservations twice (respecting the 60s pacing rule) and asserts the booking count and row ids for the sampled RU reservation are unchanged; records the second-pass diff as evidence.
- `rlnm_replay_test` — replays a captured `ru_notifications.raw_xml` envelope into `ru-reservation-handler` twice and asserts one booking, one availability block set, and no status regression.
- `creator_mapping_check` — asserts every creator seen in the last 90 days resolves to a channel; unmapped creators surface as a warning with the list.
- Register the three actions in `RU_METHOD_BY_ACTION`, `CADENCE_RULES`, `LOGGED_PORTAL_ACTIONS`, `MILESTONE_SYNC_ACTIONS` and the coverage registry so they grade in `RuCoverageTab` and the milestone tracker, and add them as evidence steps in `RuCertificationConsole`.

## Technical notes

- Files: `supabase/functions/_shared/ruReservationParsing.ts` (shared ingest + creator resolution), `supabase/functions/cron-pull-ru-reservations/index.ts` (de-duplicated), `supabase/functions/ru-reservation-handler/index.ts` (uses shared ingest), `supabase/functions/ru-cert-portal/index.ts` (3 new actions + registries), `src/components/integrations/*` for the creator mapping table and cert steps, plus one migration (unique index + `ru_channel_creators` with GRANTs and RLS: read for authenticated, write for admin/dev/fearless_leader, full for service_role).
- Adapter locks respected: the reservation-handler logic changes are additive/refactor-only inside the non-locked ingest path; no ARI or orchestrator regions touched, and no new RU methods beyond the already-implemented `Pull_ListReservations_RQ`, `Pull_GetLeads_RQ`, `Pull_ListSalesChannels_RQ`.
- Backfill: existing RU bookings get `booking_channel` re-resolved from their stored `modification_notes.creator` in the same migration turn (data update only, no schema change to `bookings` beyond the index).

## Verification

- Run the reservation pull twice back-to-back and confirm no new booking rows and no duplicated availability rows.
- Replay a stored RLNM envelope twice and confirm a single booking with unchanged id.
- Confirm at least one RU booking shows its originating channel label on the dashboard card, and that an unfamiliar creator lands in the unmapped list rather than silently defaulting.
