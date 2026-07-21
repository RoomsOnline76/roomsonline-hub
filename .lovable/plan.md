## Problem

The `/rolos` Property Setup hub embeds the full admin `PropertyForm`, so ROLOS owners can currently see (and in some cases change) settings that should be **admin-only capability toggles**. The client property in `/rolos` should only render UI for what an admin has already **allowed** in `/admin/edit-property/:id`.

## Findings — what should live *primary* in `/admin/edit-property`

### 1. Capability gates already admin-only (correct, keep)
- **Billing tab** (`RateManagerTab` → `BillingConfigTab`) — hidden from non-admins via `isAdmin || isDev || isFearlessLeader`. Owns:
  - `billing_strategy`, `commission_rate`, `subscription_fee_monthly`, `transaction_fee_percentage`
  - `white_label_allowed` (the master WL toggle)
  - `white_label_monthly_fee`, `volume_tier_json`, `tier_pricing_json`, `billing_start_date`, `tier_scope`, `room_count_override`
- **Contract** tab (`owner_contracts`) — admin-only.

### 2. Capability gates NOT currently admin-only (fix)
These are visible in both `/admin/edit-property` *and* `/rolos` (via the embedded editor), so an owner sees the same lever the admin sees.
- **Payment Providers sub-tab** in `RateManagerTab` — owner-visible read view is fine, but the tab itself is not admin-gated on the trigger. The `allow_custom_payment_provider` toggle owns whether `GatedPaymentProviderSelect` unlocks in Integrations. **Move this tab behind the same `isAdmin || isDev || isFearlessLeader` gate as Billing**, so `/rolos` no longer surfaces it (owners already see the locked/unlocked state via `GatedPaymentProviderSelect` in Integrations).
- **White-label domain panel** (`WhiteLabelDomainPanel`) — owner-facing DNS UI is correct to keep in `/rolos/integrations` (owner supplies their own subdomain), but it should stay gated on `wl.enabled` which is driven by the admin's `white_label_allowed`. Already correct — just double-check `/rolos` never exposes an edit control for `white_label_allowed` itself. Confirmed: it does not.
- **`properties.allow_custom_payment_provider`** — currently only editable from the Payment Providers tab (see above). After the gate fix it becomes admin-only.

### 3. Admin-only property-level fields (audit — currently editable via ROLOS embed)
The embedded editor in ROLOS lets owners hit these; move them to admin-only within `PropertyForm` (hide the row/section when `!isAdmin`):
- `properties.is_test_property` (⚠ Test / Sandbox flag) — General tab.
- `properties.brand_override_enabled` — synced from billing WL; owner should not toggle directly.
- `properties.sales_rep_id` — sales rep assignment.
- `properties.slug` — public URL slug (admin-controlled to avoid guest-facing URL churn).
- `properties.priority` / `featured` (if surfaced) — merchandising controls.
- **Portfolio membership** UI (`property_portfolio_members`) — assignment stays admin-only.
- **Integration IDs already hidden** (HyperGuest, Beds24, Lekkeslaap) — keep hidden.

### 4. Admin-editor Integrations parity fix
- `/admin/edit-property` Integrations renders `GatedPaymentProviderSelect` **without `bypassGate`**, so even admins see the locked card. Pass `bypassGate` when the current user is admin/dev/fearless_leader so admins can configure the provider directly from the admin editor.

## Plan

### A. Gate the Payment Providers RateManager sub-tab (admin-only)
`src/components/property/RateManagerTab.tsx`
- Wrap the `<TabsTrigger value="payment-providers">` (line 273) in `{(isAdmin || isDev || isFearlessLeader) && …}`, matching the Billing trigger pattern.
- Ensure the `<TabsContent value="payment-providers">` block is also gated (or leave the content, since the trigger being hidden prevents access — but wrap for safety).

### B. Bypass the payment-provider gate for admins in the admin editor
`src/components/property/PropertyFormIntegrationsTab.tsx`
- Read `useAuth`, compute `isAdmin`, and pass `bypassGate={isAdmin || isDev || isFearlessLeader}` to `GatedPaymentProviderSelect`.
- `/rolos/integrations` (`PMSIntegrations.tsx`) continues to render **without** `bypassGate` so owners see the gated card.

### C. Hide admin-only property fields from non-admins in `PropertyForm`
`src/pages/PropertyForm.tsx` and `src/components/property/GeneralTab.tsx`
- Thread the existing `isAdmin`/`isDev`/`isFearlessLeader` flags (they're already read in `PropertyForm`) into `GeneralTab`.
- Hide these controls when non-admin:
  - `is_test_property` checkbox (GeneralTab ~line 560; PropertyForm ~line 4560)
  - `brand_override_enabled` toggle (if editable in Branding tab)
  - `sales_rep_id` selector
  - `slug` input (show read-only text instead)
  - Portfolio membership editor (if any)
- Read-only display for non-admins where a field must remain visible (e.g. slug).

### D. Copy tweak
`src/pages/pms/PMSPropertySetup.tsx` — remove "payment providers" from the Rate Manager description line (~line 101), since owners can no longer edit that sub-tab from ROLOS.

## Out of scope
- Any database schema change.
- WL DNS verification pipeline (`verify-whitelabel-domain`).
- The `useWhitelabel` hook and integration snippet consumers.
- Contract/commission editors (already admin-only).

## Verification
1. Sign in as owner (non-admin), open `/rolos/property-setup`:
   - Billing sub-tab hidden ✓ (already)
   - Payment Providers sub-tab hidden ✓ (new)
   - General tab: no Test/Sandbox, sales rep, slug edit, brand-override toggle ✓ (new)
   - Integrations: `GatedPaymentProviderSelect` still shows locked card until admin allows ✓
2. Sign in as admin, open `/admin/edit-property/:id`:
   - Billing sub-tab visible ✓
   - Payment Providers sub-tab visible with the `allow_custom_payment_provider` switch ✓
   - Integrations tab: `GatedPaymentProviderSelect` now renders the full configurator (bypassGate) ✓
   - White-label toggle is in Billing; enabling it makes `WhiteLabelDomainPanel` appear in both surfaces ✓
3. Owner-side ROLOS Integrations still shows `WhiteLabelDomainPanel` only when admin enabled `white_label_allowed`.
