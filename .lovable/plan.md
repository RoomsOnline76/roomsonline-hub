# Faster, honest booking edits — and real delta pushes to the channel

## What I found (verified)

Looking at the stay you edited at 22:43 tonight (repriced 2000 → 5000, dates moved to 22–27 Aug):

- The booking is **ROL'OS-native** (`integration_type = 'rolos'`, no channel reservation id stored), so `modify-booking` skipped the channel reservation write entirely — it only queued an availability/rate delta. The dialog still showed "Booking modified… updating in the background", which is why it *says* done but nothing lands at the channel.
- The booking carries a stale channel sync row stuck at **pending** since 22:25, and the channel reservation id is empty for **every** `rolos` booking in the database — so a manual/direct stay never becomes a channel reservation that can later be modified.
- Later channel attempts came back with real refusals that were **logged as successes**: `Push_ModifyStay_RQ` → "You can only modify stay in confirmed reservation", `Push_ConfirmReservation_RQ` → "Property is not available for given dates", `Push_PutConfirmedReservationMulti_RQ` → "Property does not exist". The transport marks the exchange-log row `success = true` because the HTTP call worked, so the monitor and the toasts both read cleaner than reality.
- Channel calls themselves are fast (130–450 ms). The slowness is inside `modify-booking`: it re-resolves the charge context and re-prices the whole stay several times (preview quote, pre-channel quote, post-save reconcile), re-runs the rate resolver, then settles money — all sequentially before it answers. The dialog also fires a full `quote_only` round-trip on every field change, and the dashboard only refreshes by invalidating four queries and waiting for refetches.

## What changes

**1. Save returns immediately, dashboard updates instantly**
- The dialog writes an optimistic booking row into the cache the moment the save is accepted, so the bar on the room plan / day / week views moves before the network settles.
- `modify-booking` is trimmed to one pricing pass: resolve charge context and quote once, reuse that result for the channel payload, the booking write and the settlement instead of three separate passes. Everything not needed for a correct booking row (commission, emails, sync-status writes, ARI delta) already goes to the background queue and stays there.
- The preview quote in the dialog is debounced harder and only re-asked when dates, pax or the total actually change, and the request is cancelled when superseded.

**2. Delta pushes, not full re-sends**
- Every booking event — edit, confirm, cancel, move, unit change — sends only the fields that changed, computed by diffing the saved booking against its previous state, and skips the channel call completely when the diff contains nothing the channel cares about.
- A ROL'OS-native stay on a channel-distributed unit is registered at the channel once (confirmed reservation) and its reservation id stored, so later edits are true stay modifications rather than silent no-ops.

**3. Toasts that tell the truth**
- The success toast only claims the channel is updated when the channel actually accepted. Otherwise it reads "Saved here — channel refused: <reason>" or "Queued for the channel", with the real channel message.
- Non-zero channel status ids are recorded as failures in the exchange log, so the monitor stops showing refusals as green.
- A small live channel-state chip on the booking (synced / queued / refused) updates by realtime subscription, so the operator sees the channel result land without reopening anything.

## Technical notes

- `supabase/functions/modify-booking/index.ts`: single `resolveBookingChargeContext` + `quoteBookingCharges` pass shared by the channel payload, the update and `applyBookingSettlement`; the RU branch is extended to cover `rolos` bookings on RU-distributed units via `channel-booking-sync` (register-then-modify), and the response carries `channel: { state, message }`.
- `supabase/functions/_shared/ruBookingSync.ts` / `rentalsunited-api`: build the `Push_ModifyStay_RQ` payload from a changed-field set only; mark `ru_api_log.success = false` when the parsed `StatusID` is non-zero (keeping 0 and the documented partial-success codes as success) and stamp `changed_fields`.
- `src/components/pms/BookingModifyDialog.tsx`: optimistic cache write via `queryClient.setQueryData`, quote request keyed and abortable, toast wording driven by the returned `channel.state`.
- `src/pages/pms/PMSDashboard.tsx`: `refreshBookingQueries` also patches the affected booking in place; add a realtime subscription on `booking_sync_status` (and `bookings`) scoped to the selected property, torn down on unmount.
- Realtime on `booking_sync_status` requires a migration to add the table to the `supabase_realtime` publication.

## Verification

- Edit a stay and confirm the bar moves in room plan / day / week within a second.
- Edit an RU reservation and confirm `Push_ModifyStay_RQ` carries only changed fields and the toast reports the channel's actual verdict.
- Edit the stay on a `rolos` booking of an RU-distributed unit and confirm a reservation id is stored and the next edit is a stay modification.
- Confirm a refused channel call now shows red in the exchange log.
