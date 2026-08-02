## Goal

Make `/admin/edit property` look and behave like ROLOS → Property Setup: a grouped left-rail navigation with labels, descriptions and sub-section hints, instead of the current cramped icon-only horizontal tab strip.

## Approach

Extract the rail from `PMSPropertySetup.tsx` into a reusable component so both screens render the exact same UI from the same config.

### 1. New shared component: `src/components/property/PropertySectionRail.tsx`
Moved verbatim (visually) from the current PMSPropertySetup left rail:
- Grouped by `PROPERTY_SECTION_GROUPS` ("Property profile", "Booking backend", "Guest experience", "Advanced")
- Group heading: 10px uppercase muted label
- Each item: bordered button, icon + label, description line, and — when active — the sub-section hint chips (Seasons / Rate Types / Calendar / Charges / Policies …)
- Active state: `border-primary/50 bg-primary/10`; idle: `bg-muted/40`
- Props: `sections` (grouped), `activeKey`, `onSelect`, optional `blockerKeys` (Set) so the existing red blocker dot/ring is preserved

### 2. Shared config additions: `src/config/propertySectionOrder.ts`
- Move the `ICON_MAP` and `HINTS` maps out of `PMSPropertySetup.tsx` into this config (single source of truth), adding icons for `general`, `branding`, `rol-spec`, `integrations`, `admin`, `onboarding`
- Export a helper `buildSectionGroups(allowedKeys)` that returns the grouped rail model, filtered to the keys a given screen supports

### 3. `PMSPropertySetup.tsx`
Swap its inline rail markup for `<PropertySectionRail />` + `buildSectionGroups(HUB_KEYS)`. No visual change — it's the reference design.

### 4. `src/pages/PropertyForm.tsx` (non-embedded only)
- Keep `<Tabs>` and every `<TabsContent>` untouched (no logic/state changes)
- Hide the `TabsList` in non-embedded mode too, and render `<PropertySectionRail />` instead
- Layout becomes `grid lg:grid-cols-[240px_1fr]` with the tab content in a bordered `rounded-lg border bg-background` panel, matching ROLOS
- Feed the rail with `buildSectionGroups()` over the **same filtered tab list already computed today** — so all existing visibility rules stay: `contacts` excluded, onboarding hidden for new properties, `adminOnly` gating, ROLOS-managed sections hidden unless `forceTabs`, NightsBridge subset
- Pass `blockerKeys={tabsWithBlockers}` so blocker indicators still show, now as a red dot + ring on the rail item
- On mobile (`< lg`) the rail stacks above the content; groups render as a horizontally scrollable compact list so small screens stay usable
- Breadcrumb keeps working: replace the hardcoded `activeTab === "x" && "Label"` chain with a lookup against the shared section config (fixes missing labels for branding / rol-spec / integrations / admin)

### 5. Untouched
Embedded mode (ROLOS embedding PropertyForm) keeps its hidden tab list — no double rail. All save logic, form state, data fetching, and tab content unchanged.

## Technical notes
- Purely presentational refactor; no schema, edge function, or business-logic changes.
- `PropertyForm.tsx` shrinks slightly as the icon map and breadcrumb chain move to config.
