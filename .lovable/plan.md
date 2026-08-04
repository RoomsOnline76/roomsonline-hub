# Field-level Readiness Highlighting

Make the readiness shortfalls impossible to miss: every field the score counts is
outlined in the form itself — pink for mandatory, blue for nice-to-have — and the
checksheet doesn't just open a tab, it walks you to the exact field.

## What changes for the user

1. **Colour-coded borders on the fields themselves**
   - Mandatory fields (activation blockers): pink border (`#E91E8C`, the brand pink).
   - Counted nice-to-have fields: blue border (`#1F54EF`, from your swatch).
   - Borders are always on so you can see the shape of the work at a glance, and
     **soften to a thin faded outline once the field is complete** — outstanding
     fields stay bold, done fields stop shouting.
   - A small legend sits at the top of the property editor: `Mandatory` (pink dot)
     · `Recommended` (blue dot), with a live count of what's still outstanding.

2. **Guided jump from the checksheet**
   - Clicking a shortfall in the Property Setup checksheet still routes to the right
     section — but now also scrolls the offending field into view and **pulses its
     border** for ~2 seconds.
   - A slim floating bar appears in that tab: `3 outstanding on this tab` with
     `Previous` / `Next` buttons that step through each outstanding field one at a
     time, pulsing each as it lands. It disappears when the tab is clean.

3. **Per-section counts in the left rail**
   - Each section in the property rail gets a tiny pink/blue count badge, so you can
     see which tabs still owe you fields without opening them.

## How it works (technical)

**Single source of truth: `src/config/propertyFieldRequirements.ts` (new)**
- One registry entry per counted field: `{ id, path, tier, section, label, check }`.
- Derived from the checks in `supabase/functions/check-activation-readiness/index.ts`
  so scoring and highlighting can never disagree: `name`, `property_type`,
  `description` (100-char rule), `images` (min 3 + hero), `latitude`/`longitude`,
  address/city/country, contacts, rooms, policies/master policy, banking
  (`amenities.bank_name` etc.), PMS property code, and the RU geo/currency fields.
- `tier` is `mandatory` when the readiness check severity is `blocker`, otherwise
  `recommended` — the exact same rule the edge function uses.

**Painting the borders without touching 8,000 lines**
- New `src/hooks/useRequirementHighlighting.ts`: given the active section and the
  current form data, it resolves the registry for that section, then decorates the
  live DOM inside the form container — matching on each field's existing `id`
  (`#name`, `#property_type`, …) or a `data-field="amenities.bank_name"` attribute
  we add only where no `id` exists.
- Applied classes: `pf-req-mandatory`, `pf-req-recommended`, plus
  `pf-req-satisfied` when the field's `check` passes. Re-runs on section change and
  on form-data change (debounced), so the muting is live as you type.
- Styles live in `src/index.css` as semantic tokens
  (`--req-mandatory`, `--req-recommended`) and three utility classes — no hardcoded
  colour classes in components, correct in dark mode.

**The stepper + deep link**
- New `src/components/property/RequirementStepper.tsx`: reads the outstanding list
  for the active section, renders the count and Prev/Next, and calls a shared
  `focusRequirementField(id)` helper that scrolls + adds a temporary
  `pf-req-pulse` class.
- `RolosReadinessChecklist.tsx` appends `&focus=<field-id>` when it routes; both
  `PMSPropertySetup.tsx` and admin `PropertyForm.tsx` read that param, switch to the
  section, then call `focusRequirementField` once the tab has painted.
- `PropertySectionRail.tsx` gains an optional `requirementCounts` prop
  (`{ mandatory, recommended }` per section key) for the rail badges; the existing
  `blockerKeys` behaviour is unchanged.

**Files touched**
- New: `propertyFieldRequirements.ts`, `useRequirementHighlighting.ts`,
  `RequirementStepper.tsx`, `RequirementLegend.tsx`.
- Edited: `src/index.css` (tokens + classes), `PropertyForm.tsx` (mount hook,
  legend, stepper, `focus` param), `PMSPropertySetup.tsx` (same), 
  `PropertySectionRail.tsx` (count badges), `RolosReadinessChecklist.tsx`
  (`focus` in the deep link), and `data-field` attributes on the handful of
  nested-path inputs that lack an `id`.
- No backend or scoring changes — the readiness edge function stays as is.
