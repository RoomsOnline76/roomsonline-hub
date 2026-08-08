# Admin Rate Plans = the real Rate Plans page, and Calendar/Seasons loses its artifacts

## 1. Calendar / Seasons: drop the leftover sub-tabs

Inside **/admin/edit property → Calendar / Seasons** there are still two legacy sub-tabs — **Seasons** (list form) and **Rate Types** — which only appear for non-ROL'OS properties. They duplicate what the Calendar (season dates) and Rate Plans (rates) now own.

- Remove both sub-tabs for every property. The section renders the seasons Calendar directly, with no tab strip.
- Calendar keeps owning season dates only. Nothing about season painting changes.
- The underlying legacy data and sync shims stay in place (nothing is deleted from the database) — only these two authoring screens go away.

## 2. Rate Plans section becomes the same page as ROL'OS Rate Plans

Today the admin **Rate Plans** section renders the plan cards but not the page header, so there is no **+ Add Rate Plan** button and no refresh — the only way in is the per-property "New plan" link that appears in portfolio mode.

Fix by making both surfaces share one page component:

- Extract the ROL'OS Rate Plans page header (title, description, **+ Add Rate Plan**, refresh, and the legacy rate-type sync that seeds missing plans) into a shared Rate Plans panel.
- `/pms/rate-plans` and the admin Rate Plans section both render that panel, so the buttons, cards, pricing matrix, restrictions, linked units, live preview, extras summary and distribution controls are literally the same code and the same tables.
- In the admin section the panel is scoped to the single property being edited (no portfolio switcher, no property picker inside the new-plan dialog).

## 3. Source of truth rule

Rate Plans becomes the source of truth for widgets, OTAs and the booking engine for **every** property, ROL'OS or not:

- Rate Plans is editable for all properties, including those on an external system.
- The plan seeding that currently runs only for ROL'OS properties runs for any property, so existing legacy rate types appear as plans instead of an empty page.
- If the connected system does supply rates, those plans are shown with a "synced from <system>" badge and their prices stay read-only there — the connected system stays authoritative for what it sends. Everything the connected system does not price is authored in Rate Plans and is what widgets/OTAs read.
- No change to the rate resolution hierarchy or the pricing engine; this is about where rates are authored and which surface is reachable.

## Technical notes

- `src/components/property/RateManagerTab.tsx`: delete the `season` and `rate-types` `TabsTrigger`/`TabsContent` blocks and the now-dead helpers (season dialog/form state, sync dialogs, expand maps, rate-breakdown group-by), and render `seasons-calendar` without a `TabsList` when `view === "rates"`.
- New `src/components/pms/rateplans/RatePlansPanel.tsx`: header + `RatePlansSurface` + `RatePlansSurfaceHandle` ref wiring + the amenity-seeding effect moved out of `src/pages/pms/PMSRatePlans.tsx`. Props: `properties`, `showPortfolioControls`, `showHeader`.
- `src/pages/pms/PMSRatePlans.tsx` becomes a thin wrapper over the panel (keeps portfolio/single toggle and property stepper).
- `src/pages/PropertyForm.tsx`: the `rate-plans` `TabsContent` renders `RatePlansPanel` with the single property and `showPortfolioControls={false}`.
- Seeding gate: drop the `is_rol_property` early return; badge PMS-sourced plans from the existing `pms_*_cache` / rate-type mapping data.
- No database or edge-function changes; `rolos_v_effective_rates` and all rate compatibility shims stay untouched.
