
## Goal
Replace the "Manage → deep-link to `/admin/edit-property?forceTabs=1`" flow in `PMSPropertySetup.tsx` with **inline editors** so ROLOS-PMS owners never leave the hub. Same DB rows, same tables — just a second host page mounting the same editors.

## Constraint we hit while investigating
`RateManagerTab` (already extracted) contains **zero Supabase writes** — it mutates parent state (`seasons`, `pmsRateTypes`, `seasonRates`, etc.) and relies on `PropertyForm.handleSubmit` to persist on Save. `RoomManagerTab` and `AccommodationSpecialsTab` are similar. So "render inline" is not a matter of ~5 lines: we need a **state host** that owns the load-mutate-save cycle. Packages, Specials-container, and Addons are still fully inline in `PropertyForm.tsx` (roughly lines 6961–7702, ~740 lines) and need extraction too.

We'll do this in **four phases** so nothing regresses along the way.

---

## Phase A — Shared data host (foundation)

Create `src/hooks/usePropertySetupData.ts`:
- Loads (via React Query, keyed by `propertyId`):
  - `property` core fields we currently pull in `PropertyForm` (currency, owner_email, slug, brand, `selectedPMS`, `isRolProperty`, `accommodationLabel`).
  - `roomTypes`, `pmsRateTypes`, `seasons`, `seasonRates`, `mealTypeSuggestions`, `addons`, `packages`, `specials`.
- Exposes:
  - Snapshot values + setters (`setRoomTypes`, `setSeasons`, …) — mirrors the props the extracted tabs already accept.
  - `isDirty`, `setIsDirty`.
  - `save()` — a persistence routine ported from `PropertyForm.handleSubmit`'s rates/packages/specials/addons branches (nothing else). Writes:
    - `properties.amenities.rate_types` / `seasons`
    - `property_rates` upserts
    - `property_specials` / `property_charges` / package rows as their existing shapes.
  - `saveState`: `"idle" | "saving" | "saved" | "error"` for the toolbar.
- Keeps the giant state that PropertyForm currently owns **out of PropertyForm** eventually, but for Phase A the hook is additive: it wraps the same queries/setters and can be adopted incrementally.

## Phase B — Extract the last inline tabs from PropertyForm

Create three new components — pure UI receiving props identical to what `PropertyForm` passes to `RateManagerTab` today:

1. **`src/components/property/AddonsTab.tsx`** — moves lines ~6961–7247 verbatim; props: `{ addons, setAddons, propertyId, propertySlug, currency, setIsDirty }`.
2. **`src/components/property/PackagesTab.tsx`** — moves lines ~7567–7702; props: `{ packages, setPackages, packagesCategory, setPackagesCategory, roomTypes, currency, propertyId, setIsDirty }`.
3. **`src/components/property/SpecialsTab.tsx`** — thin wrapper over the existing `AccommodationSpecialsTab`, adding the category tabs strip currently at lines 7248–7517.

Then in `PropertyForm.tsx`, replace those inline blocks with the three new components. Behaviour and save path stay identical (PropertyForm still owns state + `handleSubmit`). This isolates the risk to one host page and gives us reusable building blocks for Phase C.

## Phase C — Inline editors in `PMSPropertySetup.tsx`

Rewrite the current card grid into a two-column layout:

```text
┌──────────────────────────────┐  ┌──────────────────────────────────────────┐
│ Left rail                    │  │ Editor pane                              │
│  Rates                       │  │  <RateManagerTab .../>                   │
│    ├─ Seasons                │  │   (internal sub-tabs)                    │
│    ├─ Rate Types             │  │                                          │
│    ├─ Calendar               │  │                                          │
│    ├─ Rate Breakdown         │  │                                          │
│    ├─ Charges                │  │                                          │
│    ├─ Policies               │  │                                          │
│    ├─ Payment Providers      │  │                                          │
│    └─ Overview               │  │                                          │
│  Packages                    │  │                                          │
│  Specials                    │  │                                          │
│  Addons                      │  │                                          │
└──────────────────────────────┘  └──────────────────────────────────────────┘
```

Implementation:

- `PMSPropertySetup` calls `usePropertySetupData(propertyId)` and passes the returned bundle into the four tab components — same prop names PropertyForm uses.
- Deep-link support: URL param `?section=rates.seasons`, `?section=packages`, etc. maps to the left-rail selection and, for rates, propagates the sub-tab down to `RateManagerTab` (which already accepts a `value` for its internal `Tabs`; if it doesn't, add a `defaultSubTab` prop — a 2-line change).
- Sticky toolbar at the top of the editor pane:
  - Property picker (uses `usePmsPropertyId`, already imported).
  - "Save changes" button wired to `save()` from the hook, disabled unless `isDirty`.
  - Save-state indicator ("Saved 2s ago", spinner while saving, red text on error).
- Delete the current `SECTIONS` card grid and the `openEditor()` navigate call.

## Phase D — Retire `?forceTabs=1` fallback (optional, safe to defer)

Once Phase C ships and works end-to-end:
- Remove the `?forceTabs=1` query-parameter escape hatch in `PropertyForm.tsx` (the info banner + query-string branch).
- Keep the ROLOS-PMS tab-hiding logic as-is — admin editing of ROLOS-PMS properties still hides those four tabs, and ROLOS owners get the new hub instead.

Leave this for a follow-up PR so we can watch Phase C in prod for a week first.

---

## Files touched

- **New:** `src/hooks/usePropertySetupData.ts`, `src/components/property/AddonsTab.tsx`, `src/components/property/PackagesTab.tsx`, `src/components/property/SpecialsTab.tsx`.
- **Edited:** `src/pages/pms/PMSPropertySetup.tsx` (full rewrite of the render tree), `src/pages/PropertyForm.tsx` (three JSX-block replacements, no logic change), possibly `src/components/property/RateManagerTab.tsx` for the `defaultSubTab` prop.
- **No DB migration.**

## Technical notes

- The three new tab components must keep the exact prop shapes PropertyForm currently passes so it's a lift-and-drop. Add small `interface FooProps` blocks — no logic refactor inside the JSX.
- `usePropertySetupData.save()` must be a **superset-safe** subset of `PropertyForm.handleSubmit`: it writes only rates/packages/specials/addons and never touches general-tab fields. That way a ROLOS hub save can't overwrite unrelated fields.
- React Query cache keys should match what PropertyForm already uses (or be new namespaced keys) — invalidating on save will keep both hosts consistent if a user has both open.
- `PMSPropertySetup` must guard against non-ROLOS properties (banner: "This property uses Hostfully/Nightsbridge/… — manage rates in the connected PMS"). Keep the existing `isRolosPms` gate at the route level.

## Verification steps (post-build)

1. `/pms/property-setup` for a ROLOS property → shows left rail; clicking each Rates sub-item swaps `RateManagerTab`'s internal tab; Packages/Specials/Addons render their editors.
2. Edit a season in ROLOS hub → click Save → the same season shows up in `/admin/edit-property?forceTabs=1&tab=rates` for the same property.
3. Reverse: edit an addon in `/admin/edit-property` → save → open ROLOS hub → the addon appears there.
4. `?section=rates.charges` deep link opens Rates with the Charges sub-tab pre-selected.
5. Non-ROLOS-PMS property visits `/pms/property-setup` → guarded message, no editors mounted.
6. `bun run build` + typecheck clean; no console errors when switching tabs quickly.

## Open questions

1. **Save granularity**: do we want a **global "Save changes"** at the top of the hub (matches PropertyForm's UX), or **per-tab save** (Rates saves rates, Addons saves addons)? Per-tab is safer but more work; global mirrors what admins are used to. I recommend global for parity — confirm.
2. **Non-ROLOS-PMS properties in the hub**: block entirely, or show read-only editors sourced from the PMS cache? I recommend block-with-message (fewer edge cases), matching the existing route-level gate.
3. **`RateManagerTab` sub-tab prop**: today it manages its own `Tabs` state. Are you OK with adding an optional `defaultSubTab?: string` prop so the URL deep link works? Alternative is lifting the sub-tab state into `PMSPropertySetup` (bigger surface change).
