## What's happening

For Dassiesingel (BYO PayFast, merchant `33064079`), the backend successfully gets an onsite UUID from PayFast (`d6fde783-…`, confirmed in the edge function logs), but the browser's request to `https://www.payfast.co.za/onsite/process/<uuid>` returns **404**. A valid UUID that 404s on load is the signature of a merchant account that does not have **Onsite Payments** enabled — the ROL facilitator account has it, the client's own account does not. Nothing in our signature or payload is rejected (PayFast returned a UUID and correct return/cancel URLs).

Note: this is a diagnosis from the logs, not something we can prove from inside the codebase — so step 1 below verifies it before the rest is relied on.

## Plan

1. **Verify** (backend, no UI): in `payfast-api`, after obtaining the UUID, do a short `GET` on `<onsite_url>/<uuid>` server-side and log the status. A 404 confirms the account-level cause; a 200 means the problem is client-side/origin-related and we re-diagnose.

2. **Make checkout resilient (the actual fix).** Regardless of cause, checkout must never dead-end:
   - When the onsite pre-flight check is not 200, `initiate_onsite_payment` returns `onsite_unavailable: true` together with the full redirect-checkout payload (the same fields `initiate_payment` already builds: process URL + signed fields).
   - `PayFastOnsiteModal.tsx` handles that response by auto-submitting a hidden form to PayFast's standard hosted checkout instead of calling `payfast_do_onsite_payment`. Guest sees "Redirecting to secure payment…" rather than a blank/404 modal.
   - Add a client-side watchdog: if onsite is triggered and neither the success/cancel callback nor a visible PayFast frame appears within ~8 seconds, fall back to the same redirect flow automatically.

3. **Remember the capability per merchant account.** Store an `onsite_supported` flag alongside the resolved credentials (property/portfolio BYO config) once a pre-flight check fails, so subsequent checkouts for that property skip onsite entirely and go straight to redirect — no repeated 8-second stalls.

4. **Surface it to admins.** In the property payment provider card, show a small note when the BYO account has onsite disabled: "This account uses redirect checkout — enable Onsite Payments in the PayFast dashboard for in-page checkout."

## Technical details

- `supabase/functions/payfast-api/index.ts` — pre-flight check + extended `initiate_onsite_payment` response; reuse the existing redirect field builder from `initiate_payment` so signature logic stays in one place. ITN/notify handling is unchanged (redirect flow already posts to the same `notify_url` and the credential resolver already picks the BYO passphrase for verification).
- `src/components/booking/PayFastOnsiteModal.tsx` — new `redirect` branch, auto-submit form, watchdog timer.
- `src/components/property/PropertyPaymentProviderSelect.tsx` — capability badge (reads the flag returned by the existing `resolve_credentials` action).
- No database schema change required if the flag lives in the existing payment credentials JSON; a small column is added only if that config is stored in typed columns.
