
## Goal

Make ROLOS PMS the source of truth for booking-backend data (Rates, Packages, Specials, Addons). For ROLOS-PMS properties, hide those tabs in `/admin/edit-property` and have the admin OTA book page read the same data from ROLOS. Also remove `/admin/promotion` from the navigation.

## Scope

**In:** Navigation change, tab visibility rules on Property Form, new ROLOS "Property Setup" hub with mirrored master editors, data pointer alignment (both admin and ROLOS write to the same tables so `/admin/edit-property` stays functional as read source for the book. OTA).
**Out:** Rewriting the booking engine, migrating rates for non-ROLOS PMS properties, redesigning existing admin editors.

---

## 1. Detect "ROLOS as PMS"

Add a single helper `isRolosPms(property)` that returns true when `property.pms_type === 'rolos'` (or the equivalent `pms_provider`/native flag already used elsewhere — confirm during build by reading `src/lib/pmsUtils.ts`). Used by both PropertyForm tab filter and Navbar guard.

## 2. Hide tabs in `/admin/edit-property`

`src/pages/PropertyForm.tsx` (tab list around line 3659–3687): when `isRolosPms(property)` is true, filter out:
- `rates`
- `addons`
- `specials`
- `packages`

Show a small info banner at the top of the form for ROLOS-PMS properties: "Rates, Packages, Specials and Addons are managed in ROLOS → Property Setup" with a link to the ROLOS hub. Keep the tab code intact for non-ROLOS properties.

## 3. Remove `/admin/promotion` from menu

- `src/config/navigation.ts` line 79: remove the `promotion` entry.
- `src/components/Navbar.tsx` line 238: remove the DropdownMenuItem.
- Leave the route/page mounted so any existing deep links still resolve (no dead-link risk).

## 4. New ROLOS "Property Setup" hub (source of truth)

New page `src/pages/pms/PMSPropertySetup.tsx` mounted at `/pms/property-setup`, added to the ROLOS sidebar. Top-level tabs mirror the admin structure so owners have one place to configure everything:

```text
Property Setup
├── Rates
│   ├── Seasons
│   ├── Rate Types
│   ├── Calendar
│   ├── Rate Breakdown
│   ├── Charges
│   ├── Policies
│   ├── Payment Providers
│   └── Overview
├── Packages
├── Specials
└── Addons
```

**Implementation strategy — reuse, don't rewrite:** each sub-tab imports the same editor components already used inside `PropertyForm.tsx`. To do this cleanly:

1. Extract each block from `PropertyForm.tsx` into a standalone component under `src/components/property/setup/` (RatesSeasons, RatesTypes, RatesCalendar, RatesBreakdown, RatesCharges, RatesPolicies, RatesPaymentProviders, RatesOverview, PackagesEditor, SpecialsEditor, AddonsEditor). Each takes `{ propertyId, readOnly? }` and owns its own data loading via existing hooks (`usePropertyCharges`, `useReservationPolicies`, etc.).
2. `PropertyForm.tsx` renders those same components inside its existing tabs — no behavioural change for non-ROLOS properties.
3. `PMSPropertySetup.tsx` renders the same components for the currently selected ROLOS property (`usePmsPropertyId`).

This guarantees ROLOS and admin edit the exact same rows in the exact same tables — no divergence, no dual writes.

## 5. Admin book. OTA continues to work

Because the underlying tables are unchanged, `book.sleepinafrica.roomsonline.co.za` and the `booking-orchestrator-api` keep reading the same season/rate/charge/policy/package/special/addon rows. No edge-function changes required.

## 6. Verification

- Load a ROLOS-PMS property in `/admin/edit-property` → the 4 tabs are hidden, banner shows.
- Load a non-ROLOS property → tabs render exactly as today.
- Open `/pms/property-setup` for the ROLOS property → all sub-editors load current data and saves reflect in `/admin/edit-property` for that same property.
- `/admin/promotion` no longer appears in the admin menu.

## Technical notes

- Files touched: `src/pages/PropertyForm.tsx`, `src/config/navigation.ts`, `src/components/Navbar.tsx`, `src/lib/pmsUtils.ts` (add helper if missing), new `src/pages/pms/PMSPropertySetup.tsx`, new `src/components/property/setup/*`, `src/App.tsx` route, `src/pages/pms/index.ts`.
- No DB migration required — same tables, same RLS.
- Extraction is the biggest task; done tab-by-tab to keep diffs reviewable. Suggest tackling in this order: Addons → Specials → Packages → Rates sub-tabs (Rates is the largest).

## Open questions before build

1. Confirm the flag: is `properties.pms_type === 'rolos'` the correct signal, or should I use `pms_provider` / a native-mode boolean?
2. Should the ROLOS Property Setup hub live as one new page with internal tabs (proposed), or be split into 4 sidebar items (Rates / Packages / Specials / Addons)?
3. For non-ROLOS properties, should the new ROLOS Property Setup page be hidden entirely, or shown read-only?
