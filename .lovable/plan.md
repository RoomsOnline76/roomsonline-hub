# Booking edit form: full received details and money breakdown

Today the edit form shows only dates, guest counts and an accommodation figure. Everything else that arrived with the booking — the guest's contact details, nationality, the channel's own nightly prices, the reservation reference, taxes, deposit, what was already paid and our commission — is stored but never shown there.

## What the operator will see

The edit form gets three parts above the existing dates/guests controls.

1. **Guest and booker details** (editable): name, email, phone, nationality, company/second guest where present, and the guest's own comments/special requests. Corrections save with the rest of the change.
2. **As received from the channel** (read-only): reservation reference, the channel/creator account it came from, when it was created and last synced, the address and country supplied, the unit-level notes, and the channel's night-by-night prices with their total. Only shown for bookings that came from a channel.
3. **Money breakdown** (read-only, live): accommodation, each tax/levy or fee line with how it was worked out, refundable deposit shown separately, guest total, already paid (and whether it was taken at the channel or by us), outstanding or overpaid, plus our commission (rate and amount) and net to the property.

The current re-pricing behaviour stays exactly as it is: change dates or guests and the total re-quotes; type a figure and yours wins. The breakdown refreshes against the same quote so what is read is what gets saved.

Nothing outside the money story changes on the channel — contact and nationality corrections are stored locally only, since the channel offers no verb to rewrite a guest record. The form says so in one line.

## Technical notes

- `src/components/pms/BookingModifyDialog.tsx`
  - Widen the existing booking load (`amount_paid, payment_status, total_price, charges_breakdown`) to also read `guest_name, guest_first_name, guest_last_name, guest_email, guest_phone, guest_nationality, guest_company, second_guest_name, second_guest_email, second_guest_phone, special_requests, external_reservation_id, booking_channel, integration_type, amount_paid_source, deposit_amount, calculated_commission, commission_rate_applied, commission_type, modification_notes`.
  - New collapsible sections rendered from that row; dialog width from `sm:max-w-md` to `sm:max-w-2xl` with a scroll body so it still fits the 736px mobile viewport.
  - Charge lines come from the live `quote_only` result already fetched (`extras.lines`), falling back to the stored `charges_breakdown.lines` snapshot before the first quote returns.
  - Channel nightly prices, creator, address, country, comments and sync timestamps read from `modification_notes` (keys already written by the ingest: `nightly_prices`, `creator`, `ru_creator_channel`, `address`, `country_id`, `guest_comments`, `reservation_comments`, `unit_comments`, `created_date`, `synced_at`, `amount_already_paid`, `ru_reservation_id`).
  - Where the channel's nightly total and our accommodation figure disagree, show both with a short "channel figure differs" note rather than silently preferring one.
- New `src/lib/bookingReceivedDetails.ts`: typed readers for the `modification_notes` payload (nightly prices, creator/channel label, contact extras) plus a commission/net helper, so the dialog stays presentational and other surfaces can reuse it.
- `src/lib/bookingModification.ts` + `supabase/functions/modify-booking/index.ts`: extend `BookingStayModifications` and the server-side whitelist with `guest_name`, `guest_email`, `guest_phone`, `guest_nationality`, `guest_company`, `second_guest_*`. These write to `bookings` only — no channel push path, no reprice, and they never mark the booking as a stay change.
- No schema change and no new tables; pricing, availability and channel logic untouched.
