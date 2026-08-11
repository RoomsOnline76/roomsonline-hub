# Scoped admin: RU certification auditor account

Give `ru-admin@roomsonline.co.za` a genuine admin role that is confined to two properties (SEESIG Self Catering CHALETS, Tidal Pools Self Catering Apartments) and to a short list of admin surfaces. Built as a reusable "scoped admin" capability, so future auditor logins are a data change, not a code change.

## Allowed surfaces

- Admin Dashboard
- All Bookings
- Onboarding
- Revenue Pulse
- Channel Cost Monitor — tabs: Cost & listings, Accounts, Certification, Diagnostics (Reservations tab hidden)
- The two properties (view/edit via property overview and the ROL'OS shell)

Everything else in the admin, Edit & Audit and System Control menus is hidden, and direct URL entry redirects back to the Admin Dashboard.

## How scoping works

A new table lists which properties a scoped admin may see. Presence of any row for a user means "this admin is scoped"; absence means a normal, unrestricted admin. The two property rows for the auditor account are seeded as data.

Enforcement happens in two layers:

1. **App layer** — navigation, routes and page queries respect the scope, so the auditor only ever sees Seesig and Tidal Pools in selectors, tables, counters and charts.
2. **Database layer** — access rules are taught the scope, so even a direct API call from that account returns only the two properties' data.

## Technical detail

### Database

- New table `public.scoped_admin_properties` (`user_id`, `property_id`), with grants, RLS (a user can read their own rows; admins/devs manage), and `unique (user_id, property_id)`.
- New helpers, all `security definer`, `stable`, `set search_path = public`:
  - `public.is_scoped_admin(_user_id uuid)` — true when rows exist for the user.
  - `public.admin_scope_allows(_user_id uuid, _property_id uuid)` — true when the user is not scoped, or the property is in their scope.
- Update existing chokepoint functions so the admin/dev branch is intersected with `admin_scope_allows(...)`:
  - `public.can_access_property`
  - `public.can_access_channel_property`
  - `public.can_access_crm_scope`
  These already back the RLS policies of the property-scoped tables (bookings, rolos_*, pms_*, billing, payouts), so one change propagates.
- Add the scope predicate to the admin-wide policies on `public.properties`, `public.bookings`, `public.property_portfolios` and `public.ru_owner_accounts` (the tables whose policies call `has_role(..., 'admin')` directly rather than the helpers).
- Verification query after the migration: read `properties`, `bookings` and `ru_owner_accounts` as the auditor's JWT and confirm only the two property ids come back, and that an unrestricted admin still sees everything.

### Frontend

- `src/lib/adminScope.ts` — new module: fetch the caller's scoped property ids, expose `isScopedAdmin`, `scopedPropertyIds`, an `applyAdminScope(query, column)` helper, and the allow-list of nav item ids / route paths for scoped admins.
- `src/hooks/useAuth.tsx` — surface `isScopedAdmin` and `scopedPropertyIds` from the existing user-context fetch (cached the same way as roles so menus paint correctly on first load).
- `src/hooks/useNavVisibility.ts` — filter items and sections through the allow-list when the user is a scoped admin; keep `is_active` and role rules as they are.
- `src/components/ProtectedRoute.tsx` — new `allowScopedAdmin` behaviour: when a scoped admin hits a non-allow-listed admin route, redirect to `/admin/dashboard`.
- `src/pages/AdminChannelMonitor.tsx` — hide the Reservations tab for scoped admins.
- Revenue Pulse (`/pulse`, currently dev-only) — allow scoped admins in `ROLPulse.tsx` and show the nav entry for them.
- Property/booking queries on the allowed pages (Admin Dashboard, All Bookings, Onboarding, Revenue Pulse, Channel Cost Monitor, property overview and pickers) get `applyAdminScope`, so counts and lists match the visible scope rather than relying on RLS filtering alone.

### Data

- Seed `scoped_admin_properties` for `ru-admin@roomsonline.co.za` with `76f524f3-8229-4097-b45d-18489f897195` (SEESIG) and `af57b357-9c95-47f5-b7d5-43d3b2f05bb7` (Tidal Pools).

## Out of scope

The owner login `ru-owner@roomsonline.co.za` keeps its existing owner-level access to the same two properties; no change there.
