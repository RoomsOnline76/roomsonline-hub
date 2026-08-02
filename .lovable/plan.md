## Goal

Make both property editing surfaces (Admin → Edit Property, ROLOS → Property Setup) feel like one dense, desktop-first admin tool: smaller type, tighter spacing, aligned field grids, fewer oversized cards, clear section flow.

Both surfaces already render the same components (`PropertyForm` in embedded mode + shared `PropertySectionRail`), so every density fix lands in both automatically — that's the leverage point.

## Approach

### 1. Shared density layer (do this first)

Add a small set of form primitives in `src/components/property/form/` used by every tab:

- `FormSection` — titled block with a thin rule, `text-xs` uppercase label, no nested card padding.
- `FieldGrid` — responsive `lg:grid-cols-2 / xl:grid-cols-3` grid with consistent `gap-x-4 gap-y-3`, so fields align in columns instead of stacking full-width.
- `Field` — label (`text-xs font-medium`) + control + helper text (`text-[11px]`), fixed vertical rhythm.
- Dense input/select/switch sizing via a `dense` wrapper class (`h-8`, `text-sm`, `px-2.5`) applied through the primitives, not by editing shadcn defaults globally.

Add one CSS utility group in `index.css` (e.g. `.form-dense`) that scales control heights, label sizes and card padding inside property editors only — keeps the rest of the app untouched.

### 2. Shell tightening

- `PropertySectionRail`: narrower rail (200px), tighter rows, hint chips only on active section (already), reduce description line-height.
- `PMSPropertySetup` + Admin form shell: reduce outer padding (`p-4` → `p-3`), drop the redundant bottom Alert into a one-line footnote, keep a single sticky header with property name + save actions so it stops scrolling away.

### 3. Tab-by-tab pass (paired, both surfaces at once)

Each tab gets: converted to `FormSection`/`FieldGrid`, related fields grouped, orphan/scattered fields folded into the right group, duplicate headings removed, oversized cards flattened.

Order of work:
1. General + Info & Facilities (largest, most scattered)
2. Rooms / Room Manager (incl. bed config + amenity picker density)
3. Rates / Rate Manager + Seasons Calendar
4. Packages, Specials, Addons
5. House Rules, Policies, Templates, Announcements
6. Images, Branding / House Style
7. Contacts, Integrations, Billing / Commission / Payment Providers, Admin Overview

### 4. Verification

After each group: typecheck, then a Playwright desktop capture (1280px) of the before/after tab to confirm alignment and that no controls overflow. Fix anything that regresses.

## Constraints

- Presentation only — no changes to form state, validation, save logic, or edge functions.
- Semantic tokens only, no hardcoded colors.
- Keep all existing fields and behaviour; nothing removed, only regrouped.
- `PropertyForm.tsx` is already ~8.8k lines; extract tab bodies into their existing sibling components where a tab is edited heavily, rather than growing the file.

## Technical notes

- Files: `src/pages/PropertyForm.tsx`, `src/pages/pms/PMSPropertySetup.tsx`, `src/components/property/*Tab.tsx`, `src/components/property/PropertySectionRail.tsx`, `src/config/propertySectionOrder.ts`, `src/index.css`.
- Work ships in batches (one tab group per pass) so the preview stays usable throughout.
