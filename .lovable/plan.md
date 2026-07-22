## Goal
Make the white-label domain UX consistent across ROL Admin (`/admin/edit-property → Integrations`) and ROLOS (`/pms/integrations`, single + portfolio views):

1. When the domain status is **active** (verified), replace the DNS instructions block with a compact green-tick confirmation. Instructions collapse behind a "Show DNS record" toggle (collapsed by default).
2. Until verified, keep the DNS instructions visible (as today).
3. In ROLOS **Portfolio view → Domains tab**, DNS instructions currently do not appear because the per-property panel bails out when `wl.enabled` is false. Show the same DNS panel for every portfolio property until its status is active, matching single-property behaviour.

## Changes

### 1. `src/components/integrations/WhiteLabelDomainPanel.tsx`
- Add local `showDns` state, defaulted to `currentStatus !== "active"`.
- When `currentStatus === "active"`:
  - Render a success row: green `ShieldCheck` + "Domain verified — `{domain}` is live" + a small "Show DNS record" toggle button.
  - Hide the DNS record block, the "Copy target" button, and the propagation helper text unless `showDns` is toggled on.
  - Keep the Save/Verify controls available (so an admin can re-verify after DNS changes) but de-emphasised.
- When `currentStatus !== "active"`:
  - Keep current layout (input, Save, Verify, DNS snippet, helper text) exactly as-is.
- Tone the header badge for `active` to a green/success style (use existing `default` variant with a `text-green-600` icon — no new tokens).

Used by both `PropertyFormIntegrationsTab` (ROL admin) and `PMSIntegrations` (ROLOS), so both pages inherit the collapse behaviour automatically.

### 2. `src/pages/pms/PMSIntegrations.tsx` — `PortfolioWhitelabelPanel`
- Remove the early-return that hides the panel when `wl.enabled` is false.
- Always render `<WhiteLabelDomainPanel>` for each portfolio property, so DNS instructions are visible until each property's domain status becomes `active`.
- Keep a small inline note above the panel when `!wl.enabled` (e.g. "White-label mode is off for this property — configuring a domain here will enable it once verified") so the state is still explicit.

No other pages touched. No backend, schema, or edge-function changes.

## Verification
- ROL Admin Integrations for a property with `active` status → DNS block collapsed, green tick shown, toggle expands it.
- ROL Admin Integrations for a property with `pending`/`unconfigured`/`failed` → DNS block visible as before.
- ROLOS single-property Integrations → same behaviour as Admin (same component).
- ROLOS Portfolio → Domains tab → every property card shows the DNS panel; verified ones show the collapsed green-tick state.
