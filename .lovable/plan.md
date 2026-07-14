
## Audit — ROLOS Property Setup as source of truth

### How the migration works (baseline)

Every "migrated" tab in the hub renders **the same `src/pages/PropertyForm.tsx` component** inline via same-origin iframe:

```
/admin/edit-property/:id?forceTabs=1&embed=1&tab=<key>
```

- `TabsList` is hidden in embed mode (`embedded ? "hidden" : ...`), only the selected `TabsContent` body shows.
- All state (`useState` for addons/packages/specials/announcements/houseRules/facilities/…) is loaded once by the same `loadProperty()` effect at line ~1963–2508.
- All persistence goes through the single `handleSubmit` at line ~2900+, which writes the monolithic `properties` row + `amenities` JSONB (including `addons`, `packages`, `announcements`, `house_rules`, `offerings`, `contact`, `banking`, etc.) plus child-table writes (rooms, rates, specials).
- In embed mode a sticky "Save changes" bar (line 7831) triggers `handleSubmit` when `isDirty` is true.

**Consequence:** field parity between ROLOS hub and `/edit-property` is guaranteed by construction — they are literally the same code path. A field cannot be missing in one without also being missing in the other. Data written from the hub is the same row `/edit-property` reads.

### Registered hub sections vs `TabsContent` bodies

| Hub key           | `TabsContent value` in PropertyForm | Line | Verdict |
| ----------------- | ----------------------------------- | ---- | ------- |
| `info-facilities` | `info-facilities`                   | 5803 | OK      |
| `rates`           | `rates`                             | 7558 | OK      |
| `packages`        | `packages`                          | 7607 | OK      |
| `specials`        | `specials`                          | 7288 | OK      |
| `addons`          | `addons`                            | 7001 | OK      |
| `house-rules`     | `house-rules`                       | 6243 | OK      |
| `templates`       | `templates`                         | 6882 | OK      |
| `announcements`   | `announcements`                     | 7744 | OK      |

All 8 registered keys resolve. Every one is also on the "hide in `/edit-property` for ROLOS-PMS" list, and the CTA text lists all 8.

### Data-sync path per tab

| Tab             | Local state → save path                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Info & Facilities | `formData`/facilities/stars/etc → `properties.*` + `amenities.*` in `handleSubmit` (line 2911+)             |
| House Rules       | `formData` + houseRules block → `amenities.house_rules` (line 2990)                                         |
| Templates         | `ExperienceEmailDesigner` (when flag) writes directly; legacy template UI writes via `handleSubmit`         |
| Announcements     | `announcements[]` → `amenities.announcements` (line 3039)                                                   |
| Addons            | `addons[]` → `amenities.addons` (line 3037)                                                                 |
| Packages          | `packages[]` → `amenities.packages` (line 3038)                                                             |
| Specials          | `AccommodationSpecialsTab` → `property_specials` table (direct)                                             |
| Rates             | `RateManagerTab` mutates parent state → child tables via `handleSubmit`                                     |

## Findings

### 🟢 By construction OK
- No field is skipped in the ROLOS hub that exists on `/edit-property` — the DOM is literally the same.
- Saves in embed mode go through the identical `handleSubmit`, so the DB write is byte-identical to the standalone route.
- `/edit-property` correctly hides all 8 tabs for ROLOS-PMS (`isRolosPms && !forceTabs`) and shows the CTA, with the `forceTabs=1` escape hatch used by the iframe.

### 🔴 Real gap — Announcements never mark form dirty
`saveAnnouncement` (line 2510), `deleteAnnouncement` (line 2536) and `toggleAnnouncementEnabled` (line 2541) all mutate `announcements[]` **without calling `setIsDirty(true)`**. In embed mode the sticky Save bar is gated `embedded && isDirty` — so:

- Add / edit / delete / enable-toggle an announcement in the ROLOS hub → the "Save changes" bar never appears → user navigates away → **change is lost**. Same class of bug on `/edit-property` where the per-tab save button relies on `isDirty` visibility.

This is a genuine data-sync bug introduced by the announcements tab (predates the hub migration but the migration made it hurt more because embed mode has no other save trigger).

### 🟡 Scope gap — Rooms tab not migrated
A prior plan proposed migrating the **Rooms** tab (Room Types / Rate Types / Facilities / Amenities / Images / Agreement sub-tabs) into the hub. Implementation was interrupted and never landed:

- Current `SECTION_GROUPS` in `PMSPropertySetup.tsx` does **not** include `rooms`.
- The `/edit-property` hidden-in-ROLOS filter does **not** include `rooms`.

Rooms therefore still lives only on `/edit-property`. Not a data-sync bug, but the hub is not yet the single source of truth until this ships.

### 🟡 Templates dual-path caveat
When the experience-engine flag is on, the Templates tab renders `ExperienceEmailDesigner`, which writes to its own tables outside `handleSubmit`. When the flag is off, the legacy template form writes via `handleSubmit`. Both paths work today; just noting that the "sticky Save bar" behavior differs between them — `ExperienceEmailDesigner` has its own save, so `isDirty` isn't the right signal. No action needed unless we want a unified indicator.

## Fixes

### Fix 1 — Announcements dirty-flag (required)

`src/pages/PropertyForm.tsx`:

Add `setIsDirty(true);` at the end of the three announcement mutation functions:
- `saveAnnouncement` (line 2510) — after both branches, before closing.
- `deleteAnnouncement` (line 2536) — after `setAnnouncements(...)`.
- `toggleAnnouncementEnabled` (line 2541) — after `setAnnouncements(...)`.

Verification: in the hub open Announcements → click "Add", save → sticky bar appears → click "Save changes" → row persists after reload. Repeat for delete and toggle.

### Fix 2 — Complete the Rooms migration (recommended, same-turn)

`src/pages/pms/PMSPropertySetup.tsx`:
- Widen `TabKey` with `"rooms"`.
- Add a `rooms` entry to the "Booking backend" group at position 1 (before `rates`), icon `BedDouble`, description "Room types, rate-type links, facilities, amenities, images and per-room agreements.", with sub-tab hints Type / Rate Types / Facilities / Amenities / Images / Agreement.

`src/pages/PropertyForm.tsx`:
- Add `"rooms"` to the ROLOS-PMS hidden-in-`/edit-property` filter (line 3741).
- Update the CTA text (line 3702) to include Rooms.

`?tab=rooms` already resolves the existing `TabsContent value="rooms"` at line 7584 which renders `RoomManagerTab` — no PropertyForm body changes needed.

### Verification checklist (post-fix)

1. Load `/pms/property-setup?property=<id>` on a ROLOS-PMS property → all 9 sections (info-facilities, rooms, rates, packages, specials, addons, house-rules, templates, announcements) render.
2. In each section: change one field, confirm sticky Save bar appears (or the tab's internal save button), save, hard-reload, confirm value persisted.
3. Open `/admin/edit-property/<id>` (no `forceTabs`) on the same property → the 9 migrated triggers are hidden and the CTA lists all 9.
4. Open `/admin/edit-property/<id>?forceTabs=1` → tabs render normally (escape hatch intact).
5. Non-ROLOS-PMS property: `/edit-property` still shows all tabs unchanged.

### Out of scope

- No schema, RLS, or edge-function changes.
- No refactor of `handleSubmit` payload shape.
- `ExperienceEmailDesigner`'s independent save flow stays as-is.
- Deferred "extract editors to standalone save cycle" refactor remains deferred.
