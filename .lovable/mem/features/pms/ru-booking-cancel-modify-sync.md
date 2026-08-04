---
name: RU booking cancel & modify sync
description: Cancelling or modifying an RU-sourced booking in ROL'OS must push to Rentals United first (reject/cancel/modify-stay) before local writes
type: feature
---

RU-originated bookings sit on ROL'OS-native properties, so they are identified by
`bookings.booking_channel = 'rentals_united'` (or `integration_type` starting with
`rentalsunited`) — never by `properties.external_system`.
`integration_type = 'rentalsunited_lead'` marks an unconfirmed request (RU StatusID 4).

Order of operations (channel-first — never touch the local record before RU accepts):
1. Unconfirmed request → `Push_RejectRequest_RQ` (`reject_request`), falling back to
   `Push_CancelReservation_RQ` for older integrations.
2. Confirmed reservation → `Push_CancelReservation_RQ` with mandatory `CancelTypeID`
   (1 = property/operator, 2 = guest; the UI asks the operator which).
3. Modifications → `Push_ModifyStay_RQ`, confirmed reservations only, and RU requires BOTH
   `<Current>` and `<Modify>` states.

RU status 178 = reservation originated in an external sales channel; RU cannot cancel it.
Surface `RU_CANCEL_NOT_ALLOWED` and leave the booking untouched — the operator must cancel
at the channel.

All these calls MUST run on the owning sub-user's API keys; `supabase/functions/_shared/ruBookingSync.ts`
resolves them (ru_api_credentials → legacy owner keys → legacy password) and refuses to accept a
response returned under master auth. `cancel-booking` / `modify-booking` return HTTP 409 with the RU
code when RU refuses.
