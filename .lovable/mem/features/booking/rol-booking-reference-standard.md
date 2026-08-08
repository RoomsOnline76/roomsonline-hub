---
name: ROL booking reference standard
description: Standardised searchable booking reference ROL-<ORIGIN>-<KIND>-<PROP>-<NNNNN>, minted by DB trigger, used on invoices, confirmations and statements
type: feature
---

Every booking carries `bookings.rol_reference` in the form
`ROL-<ORIGIN>-<KIND>-<PROP>-<NNNNN>` (e.g. `ROL-WEB-B-DAS-00142`).

- ORIGIN: WEB, WL, EMB, JNY, PMS (in-ecosystem) and RU, HG, HF, BEN, NB, CB, CF, OTA (received).
- KIND: `B` = booking created inside the ROL ecosystem, `R` = reservation/lead received from a channel or PMS.
- PROP: `properties.ref_code` (3 chars); NNNNN: per-property sequence from `booking_reference_counters`.

Minting is server-side only: `public.rol_origin_code()` + `public.next_rol_booking_reference()` via the
`assign_rol_booking_reference_trg` insert trigger. Never mint references in client or edge code.

Formatting/parsing/search helpers live in `src/lib/bookingReference.ts` and
`supabase/functions/_shared/bookingReference.ts` (`displayBookingReference`, `parseRolReference`,
`bookingOriginCode`, `matchesReferenceSearch`, `describeRolReference`). The channel's own
`external_reservation_id` is always shown alongside the ROL reference for reconciliation, never instead of it.
Invoice numbers are `INV-<reference without the ROL- prefix>`.

Bookings list supports Origin and Type filters plus partial reference search (dash-insensitive).
