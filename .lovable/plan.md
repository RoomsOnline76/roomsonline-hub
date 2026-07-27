## Problem

The Close button on the booking confirmation currently redirects the top-level window to the canonical property page on `sleepinafrica.roomsonline.co.za`, even when the guest started their booking on a white-label site (e.g. `book.rolos.co.za`, `book.sleepinafrica.roomsonline.co.za`, or a partner's own domain). We should return them to the white-label host they came from.

## Return-target priority (highest → lowest)

1. **`return_url` query param** — if the embed script or Book button set it, honour it (whitelist to `http(s)://` only, no `javascript:` etc.).
2. **`document.referrer`** — when it points at any non-canonical host, treat it as the WL origin and send the user back there. Prefer the referrer verbatim so we land on the exact WL property page they came from.
3. **Current confirmation host** — if the confirmation itself is loading on a WL host (not canonical), close inside the iframe and top-redirect to `/` on that same host.
4. **Canonical fallback** — only when nothing above resolves, redirect to `sleepinafrica.roomsonline.co.za/p/<slug>` (current behaviour).

Canonical hosts (never treated as WL): `sleepinafrica.roomsonline.co.za`, `*.lovable.app`, `*.lovable.dev`, `localhost`. Everything else is WL.

## Changes

### `src/pages/BookingConfirmation.tsx` — Close handler

- Capture `document.referrer` **once at mount** into a ref (in-page navigation later would overwrite it).
- Read `return_url` from `searchParams` and sanitise (must start with `http://` or `https://`).
- Build a `resolveCloseTarget()` helper implementing the priority above; it returns `{ url, sameHostAsCanonical }`.
- Rewrite the Close `onClick`:
  - Always `postMessage` `roomsonline:close` and `roomsonline:navigate` (with the resolved URL) to the parent — the WL host's embed script can intercept and close its own modal/iframe cleanly.
  - Attempt `window.close()`.
  - If we're inside an iframe (`window.top !== window.self`), assign `window.top.location` to the resolved URL.
  - Otherwise, if the current host is WL, `window.location.assign` to the resolved URL.
  - If neither the referrer nor the current host give a WL target, keep the existing canonical fallback.
- Keep Share unchanged (already uses the canonical property URL — that's correct for social sharing).

### `public/rol-embed.js` — pass `return_url`

- When opening the checkout iframe/popup, append `return_url=<current top-level URL>` so that even if the browser strips the referrer (cross-origin, `no-referrer` policies) the confirmation still knows where to send the user back.
- Also listen for `roomsonline:navigate` messages from the confirmation iframe: when received, close the modal/iframe and (optionally) update the parent URL to the payload — this lets the WL site restore its own state instead of a hard reload.

## Out of scope

- No changes to Share, PDF, or booking-data logic.
- No new query strings on the canonical widget snippets — the cookbook stays as-is; the embed script fills `return_url` automatically at runtime.
- Custom domains beyond current WL hosts continue to work because detection is by "not-in-canonical-list", not an allow-list.
