

# Phase 6: Guest Portal + Smart Resolution

## Overview

Create a public `/my-booking` route where guests can look up their booking by email + booking ID, view details, and self-service cancel — with AI-powered alternatives offered before finalisation. A new `guest-cancel-booking` edge function handles unauthenticated guest cancellations with token-based verification. The experience-engine gains a `guest_portal` handler for AI alternative suggestions.

## Current State

- `cancel-booking` edge function requires authenticated user (JWT). No guest self-service path exists.
- No `/my-bookings` or `/my-booking` route. No guest lookup mechanism.
- `experience-engine` has `guest_portal` in valid types but falls through to generic config resolver.
- `CancelBookingModal` exists for admin/PMS use with policy display.
- Bookings have no guest-facing reference code — guests identify via booking ID (UUID) from confirmation emails.

## 1. Database Migration

### New table: `guest_portal_tokens`
Short-lived tokens for guest booking access without authentication.

```sql
CREATE TABLE public.guest_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  guest_email text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  used_for text, -- 'view' | 'cancel'
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.guest_portal_tokens ENABLE ROW LEVEL SECURITY;
-- No RLS SELECT for anon — edge function uses service role
```

This avoids exposing booking UUIDs directly. Guests request a portal link via email, receive a time-limited token.

## 2. Edge Function: `guest-portal-access`

Handles two actions:

### `request_access` — Email verification
- Guest submits email + last name (or booking ID)
- Edge function finds matching bookings, generates `guest_portal_tokens`, and sends an email with a link: `/my-booking?token=xxx`
- Uses `send-booking-email` for delivery (new `guest_portal_access` email type)

### `validate_token` — Token check
- Validates token, checks expiry
- Returns booking details (masked: last 4 of card, partial email) + cancellation policy evaluation from experience-engine
- Returns property branding for white-label rendering

## 3. Edge Function: `guest-cancel-booking`

A stripped-down version of `cancel-booking` that works with portal tokens instead of JWT auth:

- Accepts `{ token, reason, cancel_rooms? }`
- Validates the `guest_portal_token` (not expired, matches booking)
- Calls experience-engine `guest_portal` handler to get AI alternatives before processing
- If guest confirms (second call with `confirmed: true`), proceeds with the same cancellation logic as `cancel-booking` (PMS sync, availability restore, email notification)
- Marks token as `used_for: 'cancel'`

## 4. Experience Engine: `guest_portal` Handler

Replace the generic fallthrough with a dedicated handler. Two sub-actions:

### `alternatives` — AI-powered save attempt
- Fetches booking details + property availability around the dates
- Calls Lovable AI (`google/gemini-3-flash-preview`) to generate alternatives:
  - Date change suggestions (cheaper/better availability nearby dates)
  - Room downgrade options
  - Credit/voucher offer (if property supports it)
- Returns structured `{ alternatives: [...], save_message: string }`

### `resolve` — Portal config
- Returns guest portal settings from `rolos_experience_configs` (custom messages, allowed actions, branding)

## 5. Public Page: `/my-booking`

**New file**: `src/pages/GuestPortal.tsx`

### Flow A: Landing (no token)
- Simple form: "Enter your email and last name to find your booking"
- Submits to `guest-portal-access` → `request_access`
- Shows "Check your email for a secure link" confirmation

### Flow B: With token (from email link)
- Validates token via `guest-portal-access` → `validate_token`
- Shows booking card: property name, dates, room details, total paid, status
- Property branding applied (white-label if enabled)
- Action buttons: "Modify Dates" (future), "Cancel Booking"

### Cancel Flow (smart resolution popup)
1. Guest clicks "Cancel Booking" → opens modal
2. Modal first calls experience-engine `guest_portal` → `alternatives`
3. Shows AI alternatives: "Before you cancel, consider these options..."
   - Date change cards with price difference
   - "We understand. Proceed with cancellation" button at bottom
4. If guest proceeds: shows cancellation policy summary (forfeit amount, deadline)
5. Reason textarea + confirm checkbox
6. Submits to `guest-cancel-booking`
7. Success: shows confirmation + updated booking status

The modal reuses styling from `CancelBookingModal` but adds the AI alternatives step.

## 6. Email Integration

Add `guest_portal_access` email type to `send-booking-email`:
- Template: "Access Your Booking" with a secure link button
- Includes booking summary (property, dates)
- Link expires in 24 hours

Also update `booking_confirmed` email template to include a "Manage Your Booking" link that points to `/my-booking` (guest enters email to get a fresh token).

## 7. Route Registration

**File**: `src/App.tsx`

Add public route: `<Route path="/my-booking" element={<GuestPortal />} />`

No authentication required — the page handles its own token-based security.

## Files

| Action | File |
|--------|------|
| Migration | Create `guest_portal_tokens` table |
| Create | `supabase/functions/guest-portal-access/index.ts` — token generation + validation |
| Create | `supabase/functions/guest-cancel-booking/index.ts` — guest self-service cancellation |
| Create | `src/pages/GuestPortal.tsx` — public booking lookup + cancel flow |
| Create | `src/components/guest/SmartCancelModal.tsx` — AI alternatives + cancel confirmation |
| Modify | `supabase/functions/experience-engine/index.ts` — add `guest_portal` handler |
| Modify | `supabase/functions/send-booking-email/index.ts` — add `guest_portal_access` email type + "Manage Booking" link in confirmations |
| Modify | `src/App.tsx` — add `/my-booking` route |

