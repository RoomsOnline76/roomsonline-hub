## Goal

1. Make outgoing property emails feel like they come from the white-label property (as far as our verified sending domain allows).
2. Add property contact details (phone + email) to the footer of every email template.

## Current state (verified)

- All property/guest emails send from the shared verified domain `notify.roomsonline.co.za` via Resend. That domain is the only DNS-verified sender we have.
- `send-booking-email` already partly personalises the From name to the property (`${property.name} <noreply@notify.roomsonline.co.za>`) for guest confirmations, but:
  - `send-onboarding-email`, `send-contact-email`, `send-itinerary-email`, and `email-contract-copy` all send with a generic `RoomsOnline` display name.
  - None of them set a `reply_to` pointing at the property.
  - Footers do not include the property's phone or email.

## What is (and isn't) possible for WL sender addresses

We cannot send `from: booking@<clientdomain>.com` unless that client verifies their own domain in Resend (DKIM/SPF/DMARC). That is per-client onboarding work, out of scope for this change. What we *can* do without any DNS work, and will do here:

- **Friendly From name = property name** on every property-scoped email, so inboxes render "Jongensfontein Resort" as the sender rather than "RoomsOnline".
- **Local-part personalised** using a slugged property handle, e.g. `jongensfontein@notify.roomsonline.co.za`, still on our verified domain. This keeps deliverability intact while making the address look property-specific.
- **`reply_to` set to the property's contact email** (from `property_contact_details` / `properties.email`) so guest replies land with the property, not with RoomsOnline.
- Canonical (non-WL) sends keep the existing `RoomsOnline <hello@notify.roomsonline.co.za>` identity.

A follow-up (not in this plan) can add optional per-client verified sending domains; the helper introduced here will be the single place to plug that in.

## Implementation

### 1. Shared sender helper

New `supabase/functions/_shared/email-sender.ts`:

- `resolveSender(supabase, propertyId, { fallbackName, purpose })` returns `{ from, replyTo }`.
- Looks up property name, slug, contact email, contact phone, and white-label flag.
- Builds:
  - `from = "<Property Name> <<slug>@notify.roomsonline.co.za>"` for WL / property-scoped sends (slug sanitised, max 30 chars, fallback to `noreply`).
  - `from = "RoomsOnline <hello@notify.roomsonline.co.za>"` for platform-level sends (admin notifications, contact form to internal team, non-property contexts).
  - `replyTo = property contact email` when available.
- Also returns `{ contactEmail, contactPhone, propertyName, websiteUrl }` for the footer.

### 2. Shared footer helper

New `supabase/functions/_shared/email-footer.ts`:

- `renderContactFooter({ propertyName, contactEmail, contactPhone, websiteUrl })` returns a small HTML block:
  - "Questions? Contact **{propertyName}**"
  - Phone (tel: link) and email (mailto: link) when present
  - Existing "Powered by RoomsOnline" line preserved where already present.
- Plain-text variant for text bodies.

### 3. Wire helpers into each function

Update these edge functions to use the helpers and inject the footer before the closing `</body>`/end of text body:

- `supabase/functions/send-booking-email/index.ts` — replace the three hard-coded `from` strings; keep the existing `email_config` override, but pass its value through the helper only when no property context is available. Inject footer in all guest-facing HTML branches (confirmation, admin copy, notify copy, template renderer).
- `supabase/functions/send-onboarding-email/index.ts` — use helper with property context when a `property_id` is available; otherwise platform sender. Add footer.
- `supabase/functions/send-itinerary-email/index.ts` — replace the branded/non-branded ternary with helper; add footer using itinerary's primary property contact when available, else brand fallback.
- `supabase/functions/email-contract-copy/index.ts` — platform-level sender, but still append RoomsOnline-branded footer for consistency.
- `supabase/functions/send-contact-email/index.ts` — internal notification stays `RoomsOnline Contact`; the guest auto-reply switches to property-friendly sender + footer when the form is scoped to a property.

### 4. Deploy

Deploy the touched edge functions in a single `deploy_edge_functions` call.

## Technical details

- Slug sanitisation: `[a-z0-9-]{1,30}`, strip diacritics, collapse dashes, fall back to `noreply` if empty. Slug source priority: `properties.slug` → slug of `properties.name`.
- Display name is quoted-encoded per RFC 5322 (`"Name" <addr>`) when it contains non-ASCII or punctuation; helper handles this.
- Footer reads from `property_contact_details` first, then `properties.email` / `properties.phone` as fallback.
- No schema changes. No new secrets. No DNS changes.
- Existing `email_config` DB overrides (used in `send-booking-email`) still win when set, so ops can force a specific address if needed.

## Out of scope

- Per-client verified sending domains (would require DNS onboarding UI + Resend domain provisioning per WL client). Called out for a future turn.
