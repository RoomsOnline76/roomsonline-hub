## Goal

Restore admin access to per-property capability controls (white-label master toggle, commission/billing overrides, custom payment provider config) in `/admin/edit-property`, which were unreachable for ROLOS properties after the Rate Manager tab was moved to the ROLOS hub.

## Approach

Introduce a new top-level **Admin** tab in `PropertyForm`, visible only to `isAdmin || isDev || isFearlessLeader`. It hosts the two admin-only editors that currently live as sub-tabs inside `RateManagerTab`:

- **Billing Config** (`BillingConfigTab`) — white-label master toggle, commission overrides, billing model, invoice defaults.
- **Payment Providers** (`PaymentProvidersTab`) — custom payment provider allowlist and configuration.

The tab is visible regardless of PMS (ROLOS or otherwise), so admins always have the same entry point. Owners never see it. The existing sub-tabs inside Rate Manager are removed to avoid duplication.

## Changes

**`src/pages/PropertyForm.tsx`**
- Add a new `TabsTrigger value="admin"` in the tabs list, gated by `isAdmin || isDev || isFearlessLeader`, styled distinctly (e.g. amber/orange accent to signal admin scope).
- Add a matching `TabsContent value="admin"` that renders an internal shadcn `Tabs` with two sub-tabs:
  - `billing` → `<BillingConfigTab propertyId={propertyId} />`
  - `payment-providers` → `<PaymentProvidersTab ... />` (same props currently passed inside `RateManagerTab`).
- Place the Admin tab at the far right of the tab list for clear visual separation.

**`src/components/property/RateManagerTab.tsx`**
- Remove the two admin-only sub-tabs (`billing`, `payment-providers`) triggers and their `TabsContent`, plus the now-unused imports (`BillingConfigTab`, `PaymentProvidersTab`).
- Keep the rest of Rate Manager intact so owner-facing sub-tabs (seasons, rate types, calendar, breakdown, charges, policies) still work in ROLOS.

**`src/pages/pms/PMSPropertySetup.tsx`**
- No change needed (description was already updated to drop "payment providers").

## Notes / Non-goals

- No database or edge-function changes.
- No changes to `/rolos/*` — owners keep the Rate Manager they already have (minus the admin-only sub-tabs, which they couldn't see anyway).
- Future admin-only controls (e.g. sales-rep assignment, portfolio membership) can be added inside the same Admin tab as new sub-tabs.
