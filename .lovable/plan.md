# BYO Payment Gateway — property setup recommendations

When an admin enables the BYO payment gateway for a property, the property currently only gets credential input fields. They get no guidance on what must still be done inside their own gateway account (onsite/card-capture activation, ITN/webhook, live vs sandbox mode, passphrase, refunds permission). This adds a provider-aware readiness checklist.

## What gets built

**1. A recommendations checklist shown in ROLOS → Integrations → Payment Providers**

Appears only when BYO is enabled for the property (or inherited from its portfolio) and the selected provider is known. Each item shows a short instruction, why it matters, and a link to the provider's docs. The property ticks items off; ticks are saved per property so the state persists and admin can see progress.

Example items for PayFast (the default):
- Account is approved and switched to **live** mode (not sandbox)
- **Onsite Payments** enabled if you want the in-page card modal — otherwise guests use the hosted redirect (works either way)
- **Security passphrase** set in PayFast settings and entered here — required for signature validation
- **ITN (Instant Transaction Notification)** enabled so paid bookings confirm automatically
- **Refunds via API** permission enabled if you want ROLOS to process refunds
- Settlement bank account verified with the provider

Other providers (Peach, Yoco, Ozow, PayGate, Stripe, etc.) get their own short list covering: live keys vs test keys, webhook/notification enabled, refund permission, settlement account verified.

**2. Readiness summary + status**

A progress line ("3 of 6 recommended steps complete") at the top of the checklist, plus a warning badge when credentials are saved but the account still resolves as sandbox (already reported by the backend), since that blocks real payments.

**3. Admin visibility**

In Admin → Edit Property → Billing (and the Admin Overview payment row), when the BYO add-on is switched on, show a compact "Owner setup checklist" panel with the same items and the property's completion count, so admin can chase outstanding steps. Admin sees it read-only.

## Technical notes

- New `src/lib/byoSetupChecklist.ts`: per-provider checklist definitions (id, title, detail, docs link, whether it is required vs optional).
- New `src/components/integrations/ByoSetupChecklist.tsx`: renders the list, handles ticking, shows progress.
- Persistence: store ticked item ids in the existing `integration_configs` row for `integration_type = 'payment_credentials'` under a `byo_checklist` key in the `config` JSON — no schema migration needed, and the existing save path/RLS already covers it.
- Wire the checklist into `PropertyPaymentProviderSelect.tsx` beneath the settlement banner, using the existing `settlement` response (`credential_source`, `is_sandbox`, `onsite_supported`) to auto-mark the live-mode and onsite items.
- Add the read-only admin panel to `BillingConfigTab.tsx`, rendered when `byo_gateway_enabled` is true.
- No changes to payment processing, credential resolution, or billing logic.
