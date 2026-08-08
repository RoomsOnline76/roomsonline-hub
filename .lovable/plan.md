# Align /admin/edit property with ROL'OS Property Setup

Both surfaces already share one navigation config, so the fix is to promote Rate Plans to a first-class section and clear out the leftovers that no longer belong.

## 1. Rate Plans becomes its own section

Today Rate Plans is buried as a sub-tab inside **Calendar / Seasons**, and it is hidden entirely for ROL'OS properties.

Change it to a dedicated section named **Rate Plans**, placed directly below **Calendar / Seasons** in the left rail — in both /admin/edit property and ROL'OS → Setup Property, so the two menus read identically.

- Left rail order in the "Booking backend" group becomes: Rooms → Calendar / Seasons → **Rate Plans** → Policies → Charges → Specials → Packages → Addons.
- The section renders the same Rate Plans configurator used on the ROL'OS Rate Plans page (cards, pricing by season, restrictions, linked units, live preview, distribution controls), so there is one authoring surface and no second copy of the logic.
- Calendar / Seasons keeps owning season dates only; nightly rates stay owned by Rate Plans. No change to that ownership rule.

## 2. Tab audit — remove what is now redundant

- **Rate Plans sub-tab** inside Calendar / Seasons: removed (promoted to its own section above).
- **Rate Breakdown** sub-tab: removed. It is a read-only view of numbers the Rate Plans live preview already shows.
- **Company / house style tab**: this tab is unreachable — nothing in the menu points at it — and its logo upload is a duplicate of the Branding section. Removed.
- **Legacy Rate Types / Seasons sub-tabs**: kept, but only for properties on an external system (Nightsbridge, Hostfully, Benson) where they still mirror that system's data. They stay hidden for ROL'OS properties, which is already the case.

Everything else in the edit-property rail (Identity & Location, Facilities, Rooms, Media, Policies, Charges, Packages, Specials, Addons, Templates, Announcements, Branding, ROL Spec, Integrations, Admin, Onboarding) is either shared with Setup Property or admin-only by design, so it stays.

## 3. Consistency details

- Deep links keep working: `?section=rate-plans` selects the new section on both surfaces, and the old Calendar/Seasons sub-tab link redirects to it.
- Readiness badges (pink mandatory / blue nice-to-have) apply to the new section using the existing per-section requirement counts.
- For ROL'OS properties, Rate Plans behaves exactly like Calendar / Seasons does today: ROL'OS Setup Property is the source of truth and the admin editor defers to it, so ROL'OS-managed properties see it in the ROL'OS hub.

## Technical notes

- `src/config/propertySectionOrder.ts`: add `rate-plans` to `PropertySectionKey`, `PROPERTY_SECTION_ORDER` (label "Rate Plans", `rolosManaged: true`), `SECTION_ICON_MAP`, and insert it after `rates` in the "Booking backend" group of `PROPERTY_SECTION_GROUPS`.
- `src/pages/pms/PMSPropertySetup.tsx`: add `rate-plans` to `TabKey` and `HUB_KEYS`.
- `src/pages/PropertyForm.tsx`: add a `TabsContent value="rate-plans"` rendering `RatePlansSurface` (scoped to the current property), add the key to the Nightsbridge allow-list, and delete the orphaned `house-style` TabsContent block.
- `src/components/property/RateManagerTab.tsx`: drop the `rate-plans` and `rate-breakdown` triggers/content and their now-unused helpers; keep `seasons-calendar`, plus `season`/`rate-types` for external-PMS properties.
- No database or edge-function changes; no change to `rolos_v_effective_rates` or the pricing engine.
