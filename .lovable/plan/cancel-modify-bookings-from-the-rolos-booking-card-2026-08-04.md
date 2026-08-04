# Cancel & modify bookings from the ROLOS booking card

Add Cancel and Modify actions inside the booking card that opens from the ROLOS dashboard calendar, and make those actions push through to Rentals United for RU-originated reservations.

## What exists today

- The dashboard booking card (`BookingQuickViewSheet`) is read-only: Details + Charges tabs, no actions.
- `cancel-booking` and `modify-booking` edge functions already exist and handle local DB updates, availability release/re-block, sync status and guest emails.
- Both functions decide whether to push to a PMS from `properties.external_system`. RU properties are stored as `roomsonline` (RU is a channel, not the PMS), so RU reservations are currently treated as ROL-native and **nothing is ever pushed back to Rentals United**.
- RU-origin bookings are identifiable: `booking_channel = 'rentals_united'`, `integration_type = 'rentalsunited'` (confirmed) or `'rentalsunited_lead'` (pending request), plus `external_reservation_id`.
- `rentalsunited-api` already has `reject_request` (Push_RejectRequest_RQ) and `cancel_reservation` (Push_CancelReservation_RQ, currently sent without `CancelTypeID`). There is **no** `modify_stay` action.
- `pms_tracker_status` has `rentalsunited` with `has_cancel = false`, `has_modify = false`.

## What gets built

### 1. Booking card actions (UI)

In the booking card, add an actions row (visible to staff with the right PMS role):

- **Modify** — opens a dialog to change check-in/check-out, guest counts, price/already-paid and notes. Prefilled from the booking; validates checkout > checkin. On save it calls `modify-booking`, shows the RU push result, and refreshes the calendar.
- **Cancel** — opens a confirm dialog requiring a reason (min 3 chars) and, for RU bookings, a cancel type (Property provider / Guest). Calls `cancel-booking`.
- A small channel badge on the card ("Rentals United — confirmed / request held") so the operator knows the cancel will hit RU.
- Pending RU requests show "Reject request" wording instead of "Cancel".
- Both dialogs surface the exact channel error text on failure and leave the card open.

### 2. RU push for cancel

- `rentalsunited-api`: add `CancelTypeID` to `Push_CancelReservation_RQ` (default 1 = property provider, 2 = guest), and treat RU **status 178** ("made in external system, cannot be cancelled in Rentals United") as a distinct, non-retryable outcome with code `RU_CANCEL_NOT_ALLOWED` and the channel's message passed through.
- `cancel-booking`: route on booking origin, not property PMS. For `booking_channel = 'rentals_united'` with an `external_reservation_id`, call `rentalsunited-api` first — `reject_request` for pending requests, `cancel_reservation` with cancel type for confirmed.
  - RU accepted → continue with the existing local cancel, availability release and email.
  - RU returned 178 or any error → **abort**: booking stays as-is, sync status logged as failed, and the operator gets the channel message telling them to cancel in the sales channel.

### 3. RU push for modify

- `rentalsunited-api`: new `modify_stay` action building `Push_ModifyStay_RQ` with both `<Current>` (PropertyID, DateFrom, DateTo, optional ResApaID) and `<Modify>` (PropertyID, DateFrom, DateTo, NumberOfGuests, ClientPrice, AlreadyPaid, optional arrival time / UseCurrentPrice). Sub-user (owner-scoped) credentials, same guards used by the other reservation methods. Confirmed reservations only — pending requests return a clear "modify not supported on requests" error.
- `modify-booking`: for RU-origin confirmed bookings, resolve the RU PropertyID/ResApaID from the existing unit mapping, push `modify_stay` **before** writing locally. Only on RU success do the local booking, availability blockout and email updates run; on failure the booking is untouched and the error is returned.

### 4. Capability flags

Set `has_cancel` and `has_modify` to true for `rentalsunited` in `pms_tracker_status` so the capability gate in both functions allows these actions.

## Technical notes

- Files: `src/components/pms/BookingQuickViewSheet.tsx` (actions row), two new dialogs under `src/components/pms/` (`BookingCancelDialog.tsx`, `BookingModifyDialog.tsx`), `supabase/functions/cancel-booking/index.ts`, `supabase/functions/modify-booking/index.ts`, `supabase/functions/rentalsunited-api/index.ts`, one migration for the tracker flags.
- Edge payloads stay snake_case; errors surfaced via `extractFunctionError`.
- Both edge functions are redeployed and the cancel/modify paths tested against a Tidal Pools RU reservation.
