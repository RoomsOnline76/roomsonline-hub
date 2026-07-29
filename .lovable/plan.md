## What's wrong

The "Test Mode: Use card 4000000000000002…" banner in the Secure Payment modal is not driven by the actual merchant account. Every caller passes a hardcoded `isSandbox={true}`:

- `src/components/booking/InlineCheckout.tsx:371`
- `src/components/booking/InlineCheckoutPanel.tsx:472`
- `src/pages/Booking.tsx:3018`
- `src/pages/JourneyCheckout.tsx:685`
- `src/components/booking/PaymentGatewayRouter.tsx:62` (default `= true`)

So a BYO property settling to its own live merchant account still shows the ROL sandbox test-card notice, and the modal also loads `sandbox.payfast.co.za/onsite/engine.js` regardless of the account.

The backend already knows the truth. `payfast-api` returns `is_sandbox` and `credential_source` on `initiate_onsite_payment` (both the UUID response and the redirect-fallback response) and on `resolve_credentials`. `resolvePayfastCredentials` derives `isSandbox` per property config for BYO, and falls back to the global `PAYFAST_SANDBOX` env only for ROL-facilitated accounts. The frontend simply ignores those fields.

## Fix

Frontend only — no backend or credential-resolution changes.

**1. `PayFastOnsiteModal.tsx`**
- Replace the `isSandbox` boolean prop with resolved state: `sandboxMode: "unknown" | true | false`, seeded from an optional prop and overwritten by `data.is_sandbox` from the `initiate_onsite_payment` response (both the UUID path and the `onsite_unavailable` redirect path).
- Track `credentialSource` (`"byo" | "rol"`) from the same response.
- Render the amber test-card banner only when `sandboxMode === true`. Never render it while unknown, and never for a live BYO account.
- Defer loading `engine.js` until sandbox mode is resolved, then pick the sandbox vs production script accordingly. This also removes the current mismatch where a live account gets the sandbox engine.
- When `credential_source === "byo"`, adjust the security line to note payments settle to the property's own PayFast account (no ROL branding implication), keeping "Secured by PayFast · SSL Encrypted".

**2. Pre-fetched UUID callers**
`InlineCheckout.tsx` and `InlineCheckoutPanel.tsx` already call `initiate_onsite_payment` themselves before opening the modal. Capture `is_sandbox` and `credential_source` from that response and pass them down instead of `true`, so the banner state is correct on first paint.

**3. Pass-through plumbing**
- `PaymentGatewayRouter.tsx`: change `isSandbox = true` to an optional `isSandbox?: boolean` with no default (undefined = let the modal resolve it), and forward `credentialSource`.
- `Booking.tsx` and `JourneyCheckout.tsx`: drop the hardcoded `isSandbox={true}`.

## Result

- BYO property (e.g. Dassiesingel): no test-mode banner, production PayFast assets, hosted redirect to the property's own merchant account — as it already does functionally.
- ROL-facilitated property while the platform sandbox stays enabled: banner still shows, unchanged.
- A BYO account explicitly configured as sandbox in its own integration config: banner shows correctly, because it comes from that property's config rather than the platform flag.

### Technical notes
No database migration and no edge function redeploy required — `payfast-api` already emits `is_sandbox` and `credential_source` on the relevant responses. The change is limited to reading fields that are currently discarded.
