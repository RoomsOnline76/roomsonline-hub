---
name: Direct stay channel push & modify reprice
description: ROL'OS-created stays are pushed to the channel as confirmed reservations, pending stays hold nights, and modifications reprice from Rate Plans
type: feature
---

**Outbound reservation for local stays.** A stay created in ROL'OS has no reservation at the
channel, so `channelBookingSync` hands it over with `Push_PutConfirmedReservationMulti_RQ`
(`rentalsunited-api` action `push_confirmed_reservation`, sub-user keys only). RU's returned
ReservationID is stored on the booking (`external_reservation_id`, `channel_listing_id`,
`integration_type = 'rentalsunited'`) so later modify/cancel follow the normal reservation path.
`Costs` MUST carry RUPrice, ClientPrice, AlreadyPaid, ChannelCommission and PriceScale — an
incomplete `Costs` fails XSD validation and RU answers a misleading status.

Non-faults, recorded as `skipped` with a reason instead of `failed`:
`RU_PROPERTY_UNMAPPED` (unit not distributed), `RU_AUTH_UNAVAILABLE` (no sub-user keys) and
RU status **56** → `RU_LISTING_MISSING` (stale local mapping — the operator must republish the
unit; retrying can never fix it).

**Pending stays hold nights.** `push-property-to-ru` counts `pending` bookings as sold except web
checkout carts (`website`, `embed`, `online`, `rol_itinerary`), which only hold while
`hold_expires_at` is in the future and `hold_released_at` is null. Excluding operator-created
pending stays left nights double-sellable at the channel.

**Modify reprices from Rate Plans.** `modify-booking` resolves the booking's rate plan (stamped
`rolos_rate_plan_id`, else the unit's primary sell plan), prices night-by-night through
`createRateResolver`, refuses the change with `422 NO_RATE_FOR_STAY` when no plan can be resolved,
and writes the new total back to the single room line so the booking card and the line agree.
`ManualBookingDialog` stamps `rolos_rate_plan_id` at creation.
