# Admin Rates & Pricing: mirror Rate Plans, retire the fragmented UI for ROLOS properties

Goal: in Admin → Edit Property → Rates & Pricing, non-ROLOS properties get the same Rate Plans experience as ROL'OS, while ROLOS properties get a read-only summary plus a button that sends the admin to ROL'OS to manage rates. Pure UI/presentation change — no schema changes, no new writes from the Admin side for ROLOS properties.

## What the user will see

**ROLOS property (external system = ROL'OS)**
- Rates & Pricing shows one clean card: each rate plan listed read-only with name, description, pricing model, base rate, min/max stay, linked units, seasons priced, active state.
- A prominent "Manage Rate Plans in ROL'OS" button that opens `/pms/rate-plans?property=<id>`.
- The old fragmented sub-tabs (Rate Types, Seasons, Rate Breakdown) are hidden. Calendar/Seasons, Charges, Policies and Overview stay, because seasons are still owned by the Calendar and those sections are not rate authoring.
- Nothing in this view saves anything.

**Non-ROLOS property (Admin-managed)**
- Rates & Pricing gains a "Rate Plans" sub-tab rendering the same Rate Plans configurator components used in ROL'OS (card list, + New Rate Plan, Sync to Others, and the 5-section editor with Basics, Pricing by Season, Restrictions, Linked Units, Live preview).
- All existing sub-tabs and editing continue to work unchanged.

## Technical approach

1. **Extract a shared surface**: pull the plan-list + editor + sync/stop-sell wiring out of `src/pages/pms/PMSRatePlans.tsx` into a new `src/components/pms/rateplans/RatePlansSurface.tsx` that takes `propertyIds: string[]`, an optional `readOnly` flag, and an optional `onManageInRolos` slot. `PMSRatePlans.tsx` keeps its page chrome (property switcher, portfolio/single toggle, packages) and renders the surface — behaviour there is unchanged.
   - `readOnly` hides the New/Edit/Delete/active-toggle/sync/stop-sell controls and never opens the editor; it only reads from `rolos_rate_plans`, `rolos_rate_plan_room_types`, `rolos_rate_plan_season_rates`.
   - The `syncFromAmenities` auto-sync stays owned by `PMSRatePlans` only, so opening the Admin read-only view performs zero writes.
2. **Admin wiring** in `src/components/property/RateManagerTab.tsx`:
   - Compute `isRolos` from the existing `selectedPMS` via `isRolosPms`.
   - When `isRolos`: hide the `rate-types`, `season` and `rate-breakdown` triggers/content, default the sub-tab to a new `rate-plans` tab that renders `RatePlansSurface` in `readOnly` mode with the CTA.
   - When not `isRolos`: add the `rate-plans` sub-tab rendering `RatePlansSurface` in editable mode for the single property, leaving every existing tab in place.
3. No changes to `SeasonsCalendar`, the pure pricing engine, the `rolos-rate-plans` edge function, or any booking/ARI path.

## Verification

- Open a ROLOS property in Admin → Rates & Pricing: Rate Types / Seasons / Rate Breakdown are absent, the read-only plan summary renders, and the "Manage Rate Plans in ROL'OS" button navigates to the ROL'OS page for that property.
- Network check on that view: only SELECT traffic, no inserts/updates.
- Open a non-ROLOS property: existing sub-tabs still save, and the new Rate Plans sub-tab can create/edit a plan with live preview.
- Open `/pms/rate-plans` in ROL'OS: list, editor, sync and packages behave exactly as before.
- Rate numbers: the booking/ARI resolution path is untouched; confirm an effective-rate preview for one property matches the pre-change value.
