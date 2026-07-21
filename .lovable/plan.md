## Problem

`/admin/edit-property/:id` → **Integrations** tab renders the **WhiteLabelDomainPanel** ("Your own booking subdomain" — save/verify DNS, CNAME/A record snippet) and a "White-label mode" badge in the header, both driven by `useWhitelabel(propertyId)`.

`/rolos/integrations` (`src/pages/pms/PMSIntegrations.tsx`) does **not** import `useWhitelabel` or `WhiteLabelDomainPanel` at all, so ROLOS users can't see or configure their own subdomain from the ROLOS shell.

## Plan

Add the same white-label surface to `PMSIntegrations.tsx`, matching `PropertyFormIntegrationsTab.tsx`:

1. **Wire up the hook**
   - Import `useWhitelabel` and call `const wl = useWhitelabel(propertyId)` alongside the existing property query.

2. **Single-property mode** (the current-route case)
   - In the property context card (around line 304), add a "White-label mode" `Badge` (ShieldCheck icon) next to the property name when `wl.enabled`.
   - Directly below that card, render `<WhiteLabelDomainPanel propertyId={propertyId} currentDomain={wl.domain} currentStatus={wl.domainStatus} />` when `wl.enabled` — same conditional as in `PropertyFormIntegrationsTab`.

3. **Portfolio mode**
   - Add a new **"Domains"** tab (Globe icon) to the portfolio `TabsList` that renders one `WhiteLabelDomainPanel` per portfolio property inside `PortfolioPerPropertyCards`, so multi-property owners can manage every subdomain in one place. Gated per-property by each property's own `useWhitelabel` result (small inline wrapper component to fetch WL state per card).

4. **No behavior changes** to `WhiteLabelDomainPanel`, `useWhitelabel`, or the verify edge function — this is purely surfacing existing functionality in the ROLOS shell.

### Files touched

- `src/pages/pms/PMSIntegrations.tsx` — imports, badge, panel in single mode, new Domains tab in portfolio mode.

### Out of scope

- Any changes to the `/admin/edit-property` Integrations tab (already correct).
- DNS / verification logic.
- Payment provider / other tabs (already present in both surfaces).

## Verification

- Load `/rolos/integrations` on a WL-enabled property → "White-label mode" badge + subdomain panel appear, matching `/admin/edit-property/:id` Integrations tab.
- Load on a non-WL property → panel hidden, no regression.
- Portfolio toggle → new **Domains** tab lists one panel per WL-enabled sibling.
