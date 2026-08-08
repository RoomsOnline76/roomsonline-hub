# Standardised ROL Booking References

Today bookings have no ROL reference at all: screens fall back to the channel's own reservation id (`external_reservation_id`) or the first 8 characters of the internal UUID, and statements/advices invent their own prefixes. This adds one human-readable, searchable reference that every surface and statement quotes.

## The format

```text
ROL-<ORIGIN>-<KIND>-<PROP>-<NNNNN>

ROL-WEB-B-DAS-00142    booking from the ROL marketplace, Dassie Single, 142nd booking
ROL-WL-B-FON-00087     booking from the owner's white-label site
ROL-RU-R-JON-00311     reservation received from a channel connection
ROL-RU-R-JON-00312     channel lead/enquiry (still a reservation until paid)
ROL-PMS-B-DAS-00143    manual front-desk capture
```

- `ORIGIN` — where it came from: `WEB` marketplace, `WL` white-label site, `EMB` widget/WordPress embed, `JNY` journey builder, `PMS` manual front desk, and channel codes `RU`, `HG`, `HF`, `BEN`, `NB`, `CB`, `CF`, `OTA`.
- `KIND` — `B` for a booking made inside the ROL ecosystem, `R` for a reservation/lead received from outside it.
- `PROP` — a stable 3-letter property code (derived from the property name, uniqueness enforced, editable by admins).
- `NNNNN` — a running number **per property**, starting at 1, zero-padded to 5.

The reference is never reused, never changes after issue, and is unique platform-wide.

## What gets built

1. **Property codes** — a short code on each property, auto-suggested from the name, collision-resolved, shown and editable in the property editor's General tab.
2. **Reference issuing** — a per-property counter plus a database routine that mints the next reference atomically. A trigger on booking insert fills it in whenever it is blank, so every path gets one: web checkout, white-label, embeds, journey, manual capture, and all channel ingests (including RU leads and holds).
3. **Backfill** — every existing booking is assigned a reference in creation order per property, so history and past statements line up with the new scheme.
4. **Display everywhere** — confirmation page, booking cards, room plan, guest emails, guest portal, invoices and pro-forma/tax invoices lead with the ROL reference and show the channel's own reference beside it (`ROL-RU-R-JON-00311 · channel ref 88213345`).
5. **Search and filter** — the reference is a first-class search field: partial matches work (`00142`, `JON-003`, `ROL-WL`), and the bookings list gains origin and kind filters driven by the same codes. The reservation finder in Rooms matches it too.
6. **Statements** — property payment advices/statements, commission invoices and portfolio share statements list one line per booking quoting the ROL reference *and* the channel reference, so an off-ecosystem property can reconcile a payout line against its own system in one glance.

## Technical notes

- `bookings.rol_reference text unique`, plus `rol_ref_origin` and `rol_ref_kind` columns for cheap filtering; a trigram index supports partial search.
- `properties.ref_code text` (3 chars, unique index) and `booking_reference_counters (property_id, last_seq)` with `SELECT ... FOR UPDATE` inside a `security definer` function `public.next_rol_booking_reference(property_id, origin, kind)`.
- Origin resolution lives in one place per side and must agree: `src/lib/bookingReference.ts` (format, parse, label, origin map) for the client, and `supabase/functions/_shared/bookingReference.ts` for edge functions, both mapping from `integration_type` / `booking_channel` / `origin_type` already captured by `captureCommissionOrigin`.
- Channel ingests keep writing `external_reservation_id` unchanged — adapter idempotency (including `bookings_ru_external_reservation_uidx` and `ingestRuReservation`) is untouched; the trigger only adds the ROL reference. No locked adapter region is modified.
- Backfill runs in the same migration as a one-off ordered `UPDATE` per property, then seeds each counter to its max.
- Existing display fallbacks (`booking.id.slice(0, 8)`) are replaced with the reference; the UUID stays the primary key.
