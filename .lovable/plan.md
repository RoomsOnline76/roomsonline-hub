# Fix: reCAPTCHA failing on white-label URLs

## Root cause (confirmed)

reCAPTCHA v3 (`react-google-recaptcha-v3`) binds the site key to a Google-registered domain allow-list. Our key is registered for `roomsonline.co.za`, `sleepinafrica.roomsonline.co.za`, `book.*`, etc. — but **not** for:

- Client white-label domains (e.g. `book.jongensfontein.com`, `rolos.co.za/jongensfontein-com/`, WordPress host domains embedding the widget iframe).
- Portfolio embeds served under white-label hosts.

Result: `grecaptcha.execute()` returns an "Invalid domain for site key" error, and any form that gates submit on `useRecaptcha().verify()` (booking, portfolio booking, contact) fails on those hosts. This is exactly the error shown in the WordPress Portfolio Shortcode screenshot.

Global `RecaptchaProvider` (`src/components/RecaptchaProvider.tsx`) currently loads on every host, including embeds — so the widget also emits console errors when hosted on customer domains, even when the flow itself doesn't require a token.

## Approach

Serve reCAPTCHA only where the site key is valid (canonical Rooms Online domains), and use a **trusted-iframe token bridge** on white-label / embed hosts so we still get a token without needing to whitelist every customer domain in Google.

## Changes

### 1. Domain gating in `RecaptchaProvider`
- Add a `getRecaptchaMode()` helper: returns `"native"` on canonical hosts (`*.roomsonline.co.za`, `*.lovable.app`, `localhost`), `"bridge"` on all other hosts (white-label + embedded on customer WordPress sites).
- In `"bridge"` mode, do NOT mount `GoogleReCaptchaProvider` (prevents the "Invalid domain" console spam).

### 2. New token-bridge iframe
- Route: `/recaptcha-bridge` on canonical `sleepinafrica.roomsonline.co.za` (a domain the key already covers).
- Renders a minimal page that loads reCAPTCHA v3, listens for `postMessage({type:"rc:execute", action})`, calls `executeRecaptcha`, and posts `{type:"rc:token", token}` back to the parent.
- Locked to `targetOrigin` = requesting parent origin, action allow-list, and a nonce per request.

### 3. `useRecaptcha` hook update
- When mode is `"bridge"`: lazily inject a hidden iframe pointing at `https://sleepinafrica.roomsonline.co.za/recaptcha-bridge`, wire request/response via `postMessage`, expose the same `verify()` API so no call sites change.
- When mode is `"native"`: unchanged behavior.
- Add a hard timeout (5s) → returns `false` with error `"Verification unavailable"`; call sites already handle a `false` result.

### 4. Server-side verification
- No change needed — existing edge functions that verify the token (`booking-orchestrator-api`, contact, etc.) call Google's `siteverify` with the same secret; a token minted by the bridge iframe is still valid.

### 5. Belt-and-braces for white-label booking
- In `verify-recaptcha` / booking edge functions, when the request `Origin` is a known white-label / embed host AND no token is supplied, fall back to existing rate-limit + honeypot checks instead of hard-rejecting. This keeps bookings working if the bridge iframe is blocked (e.g. strict CSP on the parent WordPress site).

### 6. Files touched
- `src/components/RecaptchaProvider.tsx` — mode gating.
- `src/hooks/useRecaptcha.tsx` — bridge transport.
- `src/pages/RecaptchaBridge.tsx` (new) + route in `src/App.tsx`.
- `supabase/functions/verify-recaptcha/index.ts` (and any booking function that hard-requires a token) — soft-fail for white-label origins when token missing.
- No UI/call-site changes at booking, portfolio, or contact forms.

## Out of scope

- Not switching to reCAPTCHA Enterprise.
- Not registering every customer domain in the Google console (unscalable).
- No visual changes.

## Validation

- Load `https://rolos.co.za/jongensfontein-com/` (WL portfolio shortcode context) → confirm bridge iframe loads, `verify()` returns a token, submit succeeds, no "Invalid domain" console error.
- Load canonical `sleepinafrica.roomsonline.co.za/property/...` → confirm native mode still used (no bridge iframe).
- Confirm booking submission works in both modes end-to-end.
