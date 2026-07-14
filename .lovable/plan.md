
## Goal

Migrate the `/edit-property` **Info & Facilities** tab into the ROLOS **Property Setup** hub, integrated with the previous migrations (Rates/Packages/Specials/Addons, House Rules/Templates/Announcements, Rooms). ROLOS becomes the single source of truth; the tab is hidden in `/edit-property` for ROLOS-PMS properties.

### Consolidation check

I searched ROLOS PMS pages for an existing Info/Facilities/Amenities screen and there is **no dedicated equivalent** — the only hits are:

- `PMSBranding.tsx` — writes `amenities.review_platforms` only (branding-scoped, unrelated to property info/facilities selection).
- `PMSRoomTypes.tsx` — writes `amenities.room_types` and `amenities.pms_rate_types` only.

Both touch the `properties.amenities` JSONB column but on entirely different keys than the Info & Facilities tab (which manages `amenities.facilities`, star rating, accommodation label, self-catering flag, breakfast options, and general property info fields). **Nothing to merge or consolidate** — this is a clean migration of the existing `InfoFacilitiesTab` component, same iframe pattern as before.

## Scope

### 1. Add "Info & Facilities" to the hub

`src/pages/pms/PMSPropertySetup.tsx`:

- Widen `TabKey` with `"info-facilities"` (matches the existing `TabsContent value` in `PropertyForm.tsx` line 5802, so `?tab=info-facilities` deep-links correctly).
- Add a new **"Property profile"** left-rail group (new bucket for property-identity content, keeps the rail organised as it grows) with one section for now:
  - key: `info-facilities`
  - label: **Info & Facilities**
  - icon: `Building2` from `lucide-react` (same icon used in the current `/edit-property` tab strip)
  - description: "Star rating, accommodation type, facilities checklist, self-catering, breakfast options and property-level info."
- Left-rail order becomes:
  1. Property profile → Info & Facilities
  2. Booking backend → Rooms · Rates · Packages · Specials · Addons
  3. Guest experience → House Rules · Templates · Announcements

Alternative: fold it into the existing "Guest experience" group as the top item, if the user prefers fewer buckets. Default: new "Property profile" group per above.

### 2. Hide the tab in `/edit-property` for ROLOS-PMS

`src/pages/PropertyForm.tsx`:

- Add `"info-facilities"` to the existing ROLOS-PMS filter (line ~3740) alongside `rates`, `addons`, `specials`, `packages`, `rooms`, `house-rules`, `templates`, `announcements`.
- Update the CTA text at line ~3702 to include Info & Facilities in the "managed in ROLOS" list.
- Keep the `?forceTabs=1` escape hatch so the hub's iframe still renders `TabsContent value="info-facilities"`.
- Non-ROLOS-PMS properties keep the tab exactly as it is on `/edit-property`.

### Out of scope

- No changes to `InfoFacilitiesTab.tsx` internals or its props — data still flows through `PropertyForm.handleSubmit` writing `properties.amenities` / `properties.*` columns.
- No schema, RLS, or edge-function changes.
- No touching of `PMSBranding` / `PMSRoomTypes` amenities writes — different keys, no overlap.
- The deferred "extract editors into standalone save cycle" refactor stays deferred.

## Technical notes

- `?tab=info-facilities` already resolves the correct `TabsContent`, and the iframe's `TabsList` is hidden via `embedded ? "hidden" : ...`, so no PropertyForm render changes are needed inside the tab body.
- The `postMessage` height-sync (`rolos-embed-height`) auto-sizes the iframe for the tab's content (~1200–1600px typical).
- Verification: from ROLOS Property Setup → Info & Facilities, toggle a facility, change star rating, save via the embedded save bar; then confirm `/admin/edit-property/:id` for a ROLOS-PMS property no longer shows the Info & Facilities trigger and the CTA lists it.
