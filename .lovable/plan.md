# Keep guest booking domains public

## What I verified

- The link you sent works: `https://book.rolos.co.za/embed/portfolio/jongensfontein?...` loads the Jongensfontein portfolio publicly, and clicking through to a property embed also works without login.
- The login prompt comes from the **bare domain**: `https://book.rolos.co.za/` immediately redirects to `/auth`. On the root path the app sends every visitor to the staff dashboard, which is protected, so it bounces to the login screen. Anyone who types the domain, taps a logo/"home" link, or comes back from a payment/return URL without the full path lands on the sign-in page.
- `book.rolos.co.za` is registered as an active white-label domain for three Jongensfontein properties.
- Secondary issue seen on that page: the reCAPTCHA widget on `/auth` reports "We couldn't verify you're human" on this host, and Google Maps returns `RefererNotAllowedMapError` for `book.rolos.co.za`.

## What to change

1. **Guest-domain detection.** Add a helper that classifies the current host as a guest booking host (any active white-label domain, plus `book.*` hosts) versus the admin host. Resolution: check a small built-in list first, then a cached public lookup of active white-label domains so newly verified domains work without a code change.

2. **Root path on guest hosts** no longer redirects to the dashboard. Instead it opens that host's booking surface — the portfolio embed when the host maps to a portfolio, otherwise the property embed for its single property. If the host can't be resolved, show a neutral public landing, never `/auth`.

3. **Never bounce guests to login.** On guest hosts, the protected-route guard redirects to the host's public booking surface instead of `/auth`, and the unmatched-route fallback does the same. Admin/staff sign-in stays where it belongs on the admin domain.

4. **Hide staff affordances on guest hosts** so the "Login" entry in the header/mobile nav isn't offered on a public booking domain.

5. **Fix the reCAPTCHA + Maps referrer gaps for white-label hosts** — reuse the existing token-bridge path so verification isn't attempted against an unauthorised host, and list the white-label hosts for the Maps key (I'll flag the exact keys/hosts that need to be authorised, since key restrictions are set outside the app).

## Technical notes

- New `src/lib/guestDomain.ts`: `isGuestBookingHost()`, `resolveGuestHostTarget()` (portfolio slug or property slug + brand params), cached in `sessionStorage` with a synchronous built-in fallback so the first paint doesn't flash.
- Public resolution via a `verify_jwt = false` edge function that reads `property_billing_configs` / `portfolio_billing_configs` for `white_label_domain_status = 'active'` and returns only host → slug (no PII).
- `src/App.tsx`: replace the unconditional `Navigate to="/dashboard/reports"` on `/` with the guest-host branch, and apply the same rule to the catch-all route.
- `src/components/ProtectedRoute.tsx`: on guest hosts redirect to the resolved public target rather than `/auth`.
- All `/embed/*` routes stay as they are — they are already public.
