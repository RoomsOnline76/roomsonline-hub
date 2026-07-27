## Post-checkout issues on white-label / embedded booking flow

Three regressions after a successful PayFast payment on `book.rolos.co.za` (white-label embed for Fonteinhutte via Jongensfontein portfolio):

### 1. Share button shows "Try that again" error

In `src/pages/BookingConfirmation.tsx`, `handleShare` calls `navigator.share(...)`. Inside a cross-origin iframe (which is what `book.rolos.co.za` renders when embedded), Chrome refuses Web Share and surfaces the "We couldn't show you all the ways you could share" sheet before our `catch` runs — the promise resolves to a hidden failure and the fallback clipboard path is never reached.

**Fix:** skip `navigator.share` entirely when the page is inside an iframe or when `isIntegration` is true, and go straight to `navigator.clipboard.writeText` with the toast fallback. Also prefer sharing the canonical public URL (`https://sleepinafrica.roomsonline.co.za/p/<slug>` or a booking-status URL) instead of `window.location.href`, since `book.rolos.co.za/booking-confirmation/...` is not a shareable page.

### 2. "Close" button 404s to `https://book.rolos.co.za/p/<slug>`

The close handler (`BookingConfirmation.tsx` around line 300) falls back to `navigate('/p/' + slug)` when `window.close()` and the parent `postMessage` don't take effect. `book.rolos.co.za` is a white-label host that only serves the booking widget routes — it has no `/p/:slug` route, hence the 404.

**Fix:** when in integration/iframe mode and the parent doesn't respond:
- Send `postMessage({ type: 'roomsonline:close' }, '*')` (already done) AND a `roomsonline:navigate` message with the canonical property URL so hosts that embed us can redirect their own page.
- Do NOT `navigate('/p/<slug>')` on the current host. Instead, if we detect we are on a book./white-label host, `window.top.location.assign('https://sleepinafrica.roomsonline.co.za/p/<slug>')` (or the property's configured white-label domain if we have one), otherwise just close/stay put.
- If neither closing nor top-level navigation is available, stay on the confirmation page rather than routing to a non-existent path.

### 3. Confirmed booking not visible in ROLOS Dashboard for Fonteinhutte

Verified against the database:
- Booking `790f0e89…` exists with `status=confirmed`, `payment_status=paid`, `property_id=00015d06…` (Fonteinhutte), dates 10–14 Aug 2026.
- The row is fine — the issue is display. `PMSDashboard.tsx` defaults to **week view** anchored on today (27 Jul 2026), and the pagination query filters `check_in_date <= dateRange.end` / `check_out_date >= dateRange.start`. A booking two weeks in the future never falls into the default week window, so nothing renders and the owner assumes it's missing.
- Today's Arrivals/Departures panels also only show today's date, so they wouldn't surface it either.

**Fix:**
- Add a small **"Recent bookings"** / **"Upcoming reservations"** panel on `PMSDashboard.tsx` that runs an independent query (last 20 bookings by `created_at desc` for `property_id`, regardless of date range) so newly received confirmations are always visible even when they're outside the current calendar window.
- Also verify PMSGuests / PMSCommandCentre don't have the same date-window blindspot for very recent confirmations; if they do, add the same "recently created" surface.
- No schema changes required.

## Technical details

Files to edit:
- `src/pages/BookingConfirmation.tsx` — share + close logic (iframe-safe, canonical URLs, no `/p/<slug>` navigation on white-label host).
- `src/pages/pms/PMSDashboard.tsx` — add "Recent bookings" panel keyed on `created_at`, not the calendar range.
- Optional: `src/pages/pms/PMSCommandCentre.tsx` / `PMSGuests.tsx` — same panel or ensure default filter includes future dates.

No DB migrations, no edge function redeploys, no changes to the payment flow itself.