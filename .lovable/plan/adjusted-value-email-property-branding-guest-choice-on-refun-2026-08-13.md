# Adjusted-value email: property branding + guest choice on refunds

## What exists today (verified)

- `send-balance-request` hardcodes the platform palette (`#1A1A2E` ink, `#E91E8C` pink, ivory paper) and always links to `sleepinafrica.roomsonline.co.za`. It does not read any of the property brand colours.
- The property brand tokens (`brand_primary_color`, `brand_secondary_color`, `brand_font_color`, `brand_dark_bg_color`, `brand_muted_text_color`, `brand_light_bg_color`, `brand_logo_url`, fonts, `brand_override_enabled`, `is_rol_property`) are only resolved inside `send-booking-email` via a private `resolveBranding()` helper — not shared.
- `resolvePropertySender()` already knows the white-label flag and domain (`property_billing_configs.white_label_allowed` / `white_label_domain`) and builds the property-named sender, reply-to and website URL. `renderContactFooterHtml()` renders a generic grey contact block, not a branded one.
- Settlement (`_shared/bookingSettlement.ts`) already computes `amount_paid`, `new_total`, `balance_due` and the overpaid amount. When the guest overpaid it immediately raises a **pending** refund for approval; the guest is never asked, and no email goes out for that direction — only the owing direction emails the guest.
- Balance page/token flow: `guest_portal_tokens` (`used_for = 'balance'`) → `booking-balance-api` → `BookingBalancePay.tsx`.

## What gets built

### 1. Branded adjusted-value email

- Extract the brand resolver out of `send-booking-email` into a shared email-brand helper, so every money email uses one source of truth.
- `send-balance-request` renders with the property's colours, logo, and heading font whenever branding is on (ROL'OS property with colours, or `brand_override_enabled`) or the property is white-label. Otherwise it keeps the Equatorial Luxe default.
- Footer becomes the property's own sign-off when white-label/branded: property logo or name, its public phone/email/website, and no RoomsOnline mark. Non-white-label properties keep the current RoomsOnline-backed footer.
- Guest links resolve to the white-label domain when one is configured, otherwise the standard production domain.

### 2. Refund direction gets its own email — and the guest chooses

When a modification leaves the guest **in credit**, the settlement no longer silently raises a refund for approval. Instead:

- The refund record is created in the Refund Register with status **awaiting guest choice** (held, not approvable yet), so accounts can see the money is committed without acting on it.
- The guest receives the same branded email in "credit" wording: what was received, the new total, and *"R X is due back to you"* — with two clear actions:
  - **Hold as credit until my stay** — nothing is paid out; the credit stays on the booking and shows on arrival paperwork.
  - **Refund me now** — the refund is released into the normal approval queue.
- The choice page is a tokenised guest page (same token pattern as the balance page), branded to the property, and confirms the outcome once chosen.

### 3. Owner/accounts awareness

- The choice writes to the booking's modification history and notifies the owner/accounts recipients: "Guest chose refund now — R X awaiting approval" or "Guest chose to hold R X as credit".
- Refund Register gains the awaiting-choice state as a filter/badge, and the pending-refunds count in the Command Centre counts only refunds actually released for approval, with awaiting-choice shown separately.
- If the guest never chooses, the refund stays held; an owner/admin can decide on their behalf from the register (both actions available there).

### 4. Balance (owing) direction

Unchanged in behaviour — the wording is tightened to state plainly that the balance due is the difference between the amount received and the new total, and the email is now branded per §1.

## Technical notes

- Migration: `rolos_refunds` gains `guest_choice` (`pending` | `refund_now` | `hold_credit`), `guest_choice_at`, and a held status value; `bookings` gains a credit-held amount so the credit can be shown on the booking and netted at check-in. Grants + RLS follow the existing refund policies.
- New shared module `supabase/functions/_shared/emailBrand.ts` (brand token resolution + branded shell/footer), consumed by `send-balance-request` and `send-booking-email`.
- `send-balance-request` handles both directions (`owing` | `credit`) driven by the settlement result; `_shared/bookingSettlement.ts` mints a `settlement` token for the credit direction and raises the refund in the held state.
- New `booking-settlement-api` action set (or extension of `booking-balance-api`) for `get_settlement` / `choose_refund` / `choose_credit`, plus a guest page at `/booking-credit/:token`.
- Frontend: `RefundRegisterPanel.tsx` (awaiting-choice filter + act-on-behalf actions), `useRefundRegister.ts`, Command Centre pending-refunds card, booking settlement line shows credit held.
- Owner notification rides the existing background job queue so the guest's click stays instant.
