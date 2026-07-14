
## Goal

Bring three more `/edit-property` tabs into the ROLOS Property Setup hub — **House Rules**, **Templates**, **Announcements** — and make ROLOS the single source of truth. Once live in ROLOS, hide them on the standalone `/edit-property` page for ROLOS-PMS properties so operators only edit them in one place.

The existing hub (`src/pages/pms/PMSPropertySetup.tsx`) already embeds `PropertyForm` via same-origin iframe (`?embed=1&forceTabs=1&tab=<key>`), and `PropertyForm` already hides its own tab strip when `embed=1`. That plumbing is reused — no new save cycle, no data-hook extraction. This is a scoped, presentational change on top of the current embed strategy.

## Scope

### 1. Extend the hub with three new sections

`src/pages/pms/PMSPropertySetup.tsx`:

- Widen `TabKey` to `"rates" | "packages" | "specials" | "addons" | "house-rules" | "templates" | "announcements"`.
- Append three entries to `SECTIONS` (icons: `FileText`, `Mail`, `Megaphone` or similar `lucide-react` glyphs already in use):
  - **House Rules** — check-in/out times, child/pet/smoking policy, deposit rules, cancellation policy inputs.
  - **Templates** — confirmation, pre-stay, post-stay mailer editors (uses `ExperienceEmailDesigner` when the flag is on, otherwise legacy template forms — same as `/edit-property`).
  - **Announcements** — dated/ordered announcement banners shown on the booking site.
- Group the left rail into two lightweight buckets so it doesn't get crowded (visual grouping only, no state change):
  - "Booking backend": Rates, Packages, Specials, Addons
  - "Guest experience": House Rules, Templates, Announcements
- Keep the "Open full editor" button pointing at `/admin/edit-property/:id?tab=<activeTab>` for the current tab.

Each tab value must match the `TabsContent value=...` already used in `PropertyForm.tsx` (`house-rules`, `templates`, `announcements`) so the existing `?tab=` deep-link mechanism just works — no `PropertyForm` changes needed for rendering.

### 2. Hide the three tabs in `/edit-property` for ROLOS-PMS properties

`src/pages/PropertyForm.tsx`:

- Add a `hiddenInRolos` set: `{"house-rules", "templates", "announcements"}` (rates/packages/specials/addons are already handled by the existing `isRolosPms && !forceTabs` CTA at line ~3698).
- In the tab trigger list (~line 3722), filter out these three entries when `isRolosPms(selectedPMS) && !embedded && !forceTabs`.
- Extend the existing "Booking-backend tabs live in ROLOS" CTA card at line ~3698 to also cover these three (or add a sibling notice) so users landing directly on `/edit-property` see a clear pointer to the ROLOS Property Setup hub with a link to `/pms/property-setup?section=<tab>` (or the current hub route — confirmed during implementation).
- When `?forceTabs=1` is present (used by the hub's iframe and by admins who need the legacy view), keep the tabs visible so the embed still works and there's an escape hatch.
- Leave the underlying state, load, and `handleSubmit` paths untouched — data still writes to the same rows via the same `PropertyForm.handleSubmit`, just now driven from within the hub's iframe.

### 3. Deep-link parity

- `PMSPropertySetup` already reads `activeTab` from local state; add optional `?section=house-rules|templates|announcements` URL sync so the hub can be linked to directly from the CTA in `/edit-property` and from anywhere else in ROLOS.

### Out of scope

- No changes to save cycles, RLS, edge functions, or database schema. All three tabs already persist through `PropertyForm.handleSubmit` into the existing `properties` / `amenities` JSON columns.
- Not touching Rates/Packages/Specials/Addons behavior.
- Not removing the tabs from `/edit-property` entirely — only hiding them for ROLOS-PMS. Non-ROLOS-PMS properties keep the legacy tabs so nothing regresses.
- The deeper "extract editors into standalone components" refactor from the earlier plan stays deferred.

## Technical notes

- `TabKey` widening + `SECTIONS` extension is the only structural change in the hub file; the iframe render loop is already generic.
- Because `PropertyForm` broadcasts scroll height via `postMessage` (`rolos-embed-height`), the hub auto-sizes for the new tabs without extra work.
- The "hide in /edit-property" filter must be gated on **both** `isRolosPms(selectedPMS)` **and** `!forceTabs` so the iframe path continues to render the tab bodies (even though the tab strip itself is hidden by `embedded` styling).
- Verification: open ROLOS Property Setup → House Rules / Templates / Announcements each load, edit + save works from the embedded save bar (already present at line ~7828), then confirm `/admin/edit-property/:id` (no `forceTabs`) for a ROLOS-PMS property no longer shows those three triggers and instead shows the "manage in ROLOS" CTA.
