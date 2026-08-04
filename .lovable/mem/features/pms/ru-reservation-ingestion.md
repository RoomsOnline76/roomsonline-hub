---
name: RU reservation ingestion (Step 6)
description: Shared idempotent RU reservation ingest path, unique index, channel-creator mapping and certification tests
type: feature
---

Both RU reservation paths — `ru-reservation-handler` (RLNM push) and
`cron-pull-ru-reservations` (30-min poll, incl. leads) — MUST write bookings through
`supabase/functions/_shared/ruReservationIngest.ts` → `ingestRuReservation()`.
Never re-implement parsing or booking writes locally; that drift caused missing currency
reverts and "RU Guest" placeholder records.

Idempotency is two-layered:
1. partial unique index `bookings_ru_external_reservation_uidx` on
   `bookings (external_reservation_id)` where `integration_type IN ('rentalsunited','rentalsunited_lead')`;
2. read → insert → on `23505` re-read-and-update inside `ingestRuReservation`, so a
   notification racing a poll converges on an update (`outcome: 'updated'`, `deduped: true`).

Outcomes: `created | updated | cancelled | held | skipped | unmatched | failed`.
Leads/requests are ingested with `forceRequest: true` (3-day hold, `hold_expires_at`).
Cancellations never delete — status `cancelled` + availability release.

RU `Creator` (the sales-channel account that created the reservation) is mapped through
`public.ru_channel_creators` (creator_username → channel_key/channel_label/ru_channel_id).
Unknown creators are auto-inserted as `channel_key = 'unmapped'`, `is_active = false` for
operator labelling; the mapping is stored on the booking in
`modification_notes.ru_creator_channel`.

Certification actions in `ru-cert-portal`:
`reservation_idempotency_test`, `rlnm_replay_test` (adds cancellation replay) and
`creator_mapping_check`. The ingest tests use a synthetic `CERT-<uuid8>` reservation on
dates ~700 days out, pass `skipAvailability: true`, and delete their own booking — never
leave certification rows in the operator's booking list. Surfaced at
Admin → Rentals United → Reservations (`RuReservationsPanel.tsx`).
