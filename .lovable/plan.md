## Root cause

The confirmation email is rendered by `supabase/functions/send-booking-email/index.ts` → `replaceTemplateVariables()`. When a ROL'OS property has an Experience Engine template active, `send-booking-email` fetches the template body from `rolos_message_templates` (`trigger_event='booking_confirmed'`) and runs it through the same substitution map.

That map only knows these keys:
- `{{guest_name}}`, `{{check_in_date}}`, `{{check_out_date}}`, `{{reservation_reference}}`, `{{nights}}`, `{{total_amount}}`, `{{property_name}}`, …

But the seeded template body (migration `20260308194342…sql`, lines 16 and 20/28/32/36) uses:
- `{{guest_first_name}}`, `{{confirmation_number}}`, `{{check_in}}`, `{{check_out}}`

Those never get substituted, so the guest sees `Dear {{guest_first_name}}`, etc. (rendered `{guest_first_name}` in most mail clients that collapse doubled braces visually). Separately, the seed body writes `Total:</strong> R {{total_amount}}` while `formatCurrency` already prepends `R`, producing `R R 4,660.00`.

## Fix

### 1. `supabase/functions/send-booking-email/index.ts`

Extend the `replacements` map in `replaceTemplateVariables` (around line 62) with aliases so both naming conventions work — no template rewrite required for the customer-visible fields:

```ts
const firstName = (booking.guest_name || "").split(" ")[0] || "Guest";

"{{guest_first_name}}": firstName,
"{{confirmation_number}}": bookingRef,
"{{check_in}}": formatDate(booking.check_in_date),
"{{check_out}}": formatDate(booking.check_out_date),
```

Also add these harmless aliases already used elsewhere in the codebase:
- `{{property_email}}` → `property.email || ""`
- `{{property_phone}}` → `property.phone || ""`
- `{{total_amount_num}}` → `formatCurrency(booking.total_price).replace(/^R\s*/, "")` (a bare number for future templates)

Then `deploy_edge_functions(["send-booking-email"])`.

### 2. Fix the double-`R` on Total

Two small edits in the seeded ROL'OS templates so the currency prefix isn't duplicated. The safest place is a new migration that updates existing rows created by the earlier seed (matched by `trigger_event` + a `LIKE '%R {{total_amount}}%'` guard so we only touch the rows we shipped):

```sql
UPDATE public.rolos_message_templates
SET body = REPLACE(body, '</strong> R {{total_amount}}', '</strong> {{total_amount}}')
WHERE body LIKE '%</strong> R {{total_amount}}%';
```

This leaves `formatCurrency`'s `R` prefix as the single source of the currency symbol and matches how new templates will read.

### 3. Same aliases in `pms-message-dispatcher`

`supabase/functions/pms-message-dispatcher/index.ts` `buildPlaceholderMap` already covers `guest_first_name` / `check_in` / `check_out` / `confirmation_number`, so no change is needed there — but that path is also broken for a separate reason worth noting only (not fixing this turn unless asked): the trigger `auto_queue_booking_message` writes `reservation_id = bookings.id`, and the dispatcher tries to look that up in `rolos_reservations`. Out of scope for this fix; today's confirmation email is the `send-booking-email` path.

## Verification

- Redeploy `send-booking-email`, then in ROL'OS create a test confirmed booking (or use the existing 3291893 record) and re-issue the confirmation email; verify the mail shows `Dear Dawie,`, real dates, real confirmation number, and `Total: R 4,660.00` (single R).
- Grep the templates table for any remaining `R {{total_amount}}` after the migration to confirm the UPDATE hit every row.

## Out of scope

- The `auto_queue_booking_message` / `pms-message-dispatcher` reservation-id mismatch (separate delivery pipeline).
- Any template editor UI changes — placeholders continue to be authored as `{{...}}`.
- Default (non-custom) email path — that one already renders correctly.
