# RU Certification — Gap 1: `Pull_GetReservationByID_RQ`

Two parts: file the certification form in the reference library, then close the first gap
(single-reservation detail pull), which is adapter-only — it needs no new property fields, so
the onboarding and channels wizards are untouched this round.

## 1. Keep the certification form in the library

- Store the uploaded workbook as a CDN asset pointer (`src/assets/ru-wl-certification-form.xlsx.asset.json`)
  so the binary is not committed.
- Add `docs/reference/ru-wl-certification.md`: the tracked gap register transcribed from the
  workbook tabs (WL Admin, General declarations, Content quality, Supply API Property
  management, Reservation processing), each row with RU method, cert section, current status,
  and action. This becomes the running scoreboard we tick off gap by gap.
- Link it from `docs/rolos-onboarding-channel-readiness.md` so the channels runbook points at it.

## 2. Implement `Pull_GetReservationByID_RQ`

Currently the adapter only has `list_reservations` (date-window pull) and `get_leads`; there is
no single-reservation fetch, so certification's reservation-detail tests and support lookups
have nothing to call.

Adapter (`supabase/functions/rentalsunited-api/index.ts`):
- New builder `buildGetReservationByIdXml(creds, reservationId)` next to the existing
  reservation builders, emitting `<Pull_GetReservationByID_RQ>` with the standard auth block
  and `<ReservationID>`.
- New action `get_reservation_by_id`, accepting `reservation_id` (validated, required) plus the
  existing owner/property scoping so the correct sub-user credentials are used — a white-label
  sub-account's reservation is not visible to the master account.
- Returns the adapter contract `{ success, auth_mode, raw_xml, reservation }`, where
  `reservation` is the parsed block run through the existing shared
  `parseRuReservation` helper so the shape matches the ingest path exactly.
- RU status handling and error shape reuse `handleRUStatus` / `ruErrorResponse`.

Reconciliation use:
- `supabase/functions/_shared/ruReservationIngest.ts` gains an optional single-reservation
  refresh path: when RLNM delivers an envelope with empty `<StayInfos />`, fetch that one
  reservation by id instead of triggering a full account-wide pull. `ru-reservation-handler`
  uses it and only falls back to the existing `cron-pull-ru-reservations` reconcile when the
  id-level fetch fails. Ingest stays idempotent (read → insert → 23505 update).

Certification + support surfaces:
- `ru-cert-portal`: new `reservation_detail_test` action that pulls a known reservation id by
  id, asserts guest/dates/property/price parity against the stored booking, and logs the
  evidence row like the other cert tests (self-cleaning, no stray bookings).
- Admin → Rentals United → Reservations (`RuReservationsPanel.tsx`): a "Fetch from channel"
  lookup box (reservation id) that shows the live RU detail next to the local booking, for
  support cases.

## Notes

- Adapter edits touch `rentalsunited-api` reservation pulls only; the locked availability and
  push regions in `.lovable/ADAPTER_LOCKS.md` are not modified.
- Wire format stays snake_case; no schema changes, no new tables.
