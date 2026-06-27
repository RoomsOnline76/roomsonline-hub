# Fix Manual Booking — rate, calendar block-out, email

Three connected fixes to `ManualBookingDialog` + dashboard wiring.

## 1. Unit-aware rate (remove rate-plan dropdown)

In `src/components/pms/ManualBookingDialog.tsx`:

- Remove the **Rate Plan** `<Select>` block entirely (the unit/room-type already determines the rate).
- Drop `rate_plan_id` from form state and `selectedPlan`/`pricingModel` derivations.
- Rewrite the rate resolver so it is unit-first, then room-type, then date-aware:
  1. If a `room_id` is selected, look up that room's `base_rate` / `nightly_rate` (per-unit override) from the `rolos_rooms` row passed in via `rooms`.
  2. Otherwise call `getRateForDate(room_type_id, date)` per night (season + amenities-aware — already wired from the dashboard).
  3. Final fallback: room type's `default_rate`. **Remove the hard R1000-style fallback** — if nothing resolves, show "Rate unavailable — enter manually" and require the user to type `total_price`.
- Pricing model defaults to `per_room` (no plan); keep `per_person` math only if room-type metadata flags it.
- Update the price breakdown text accordingly (`R{rate}/night × {nights} nights`).
- Remove `rolos_rate_plan_id` from the insert payload.

Extend the `Room` interface in the dialog to include the per-unit rate field(s) and pass that data through from `PMSDashboard.tsx` (the `rooms` query already selects from `rolos_rooms` — add `base_rate`/`nightly_rate` to its `.select(...)` if missing).

## 2. Booking doesn't block on calendar

Root cause: the new booking is inserted with `rolos_room_ids = [room_id]` but the calendar grid keys cells by `room_type_id` + date range. Two adjustments:

- In `onCreated` (PMSDashboard line 1359), also invalidate `["pms-cal-rooms"]` (already there) **and** force `bookingsInfinite.refetch()` via `queryClient.refetchQueries({ queryKey: ["pms-cal-bookings", propertyId] })` so the infinite-query first page reloads immediately instead of waiting for the next focus event.
- Verify the inserted row has `status` set to `confirmed` or `pending` (both are kept by the `.neq("status","cancelled")` filter — confirmed via current code).
- Ensure `check_in_date`/`check_out_date` are stored as `yyyy-MM-dd` (already correct via `format(..., "yyyy-MM-dd")`).

## 3. Confirmation email failing

`send-booking-email` uses Resend directly and currently throws when:
- `RESEND_API_KEY` is missing, or
- The `from` domain isn't verified for that key, or
- The booking row lacks fields the template expects.

Fixes:
- Wrap the `resend.emails.send` call in `send-booking-email/index.ts` with explicit error capture and return a structured `{ ok:false, reason }` instead of throwing — so the dialog's warning toast surfaces the real reason.
- In the dialog, surface that `reason` in the warning toast ("Booking saved — email skipped: <reason>") instead of the generic message.
- Confirm `RESEND_API_KEY` secret is present; if not, prompt to add it. Use the verified sender domain already configured for other transactional emails (`hello@notify.roomsonline.co.za`) as the default `from` when the property has no branded sender configured.
- Add a guard so the email call is **awaited but non-blocking** to the dashboard refresh (already structured this way; just ensure the `onCreated()` callback runs even when the email path throws — currently it does, keep it).

## Out of scope

- No schema changes.
- No edits to the dashboard rendering logic beyond the `onCreated` refetch line.
- No migration to Lovable Emails in this pass (separate task if requested).

## Files touched

- `src/components/pms/ManualBookingDialog.tsx` — remove rate-plan select, unit-aware rate resolver, better email error toast.
- `src/pages/pms/PMSDashboard.tsx` — extend `rooms` select with per-unit rate columns, add `refetchQueries` in `onCreated`.
- `supabase/functions/send-booking-email/index.ts` — structured error return, default verified `from` fallback.
