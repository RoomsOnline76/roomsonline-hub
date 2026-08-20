---
name: RU Location Change Blocked By Reservations
description: Channel refuses a location change on a listing that has existing reservations (status 310); partial unit rejections must never report as delivered
type: constraint
---

Rentals United answers `Push_PutProperty_RQ` with status `310 — Cannot update property
location because there are existing reservations` when the listing already has bookings.
The location stays at the old value for those units; other units in the same property can
succeed, so a content delta is often *partially* applied.

Rules:
- `push-property-to-ru` returns `success: true` for the transport even when individual units
  were rejected. `pushStaticContent` in `_shared/ruStaticDelta.ts` must inspect the per-unit
  results and fail the delta with `RU_UNIT_REJECTED` listing each unit + reason, so the save
  toast says "rejected", never "delivery confirmed".
- The only way to move location on a booked listing is to clear/settle the reservations at the
  channel first, or push the change to a fresh listing id. Do not retry-loop around it.
