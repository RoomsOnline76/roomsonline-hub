# Gate #8 — every failing to-do must open the failing unit

"Worst unit wins" already decides *whether* a step is blocked, but several failing
messages reach the wizard with no unit attached, so clicking them lands the owner on
the top of a tab instead of on the chalet/unit that actually fails.

## What is confirmed today

- `focusUnitCard(unitName)` exists in `src/lib/requirementFocus.ts` and is called from
  exactly one place: the wizard's `goToField`, and only when `failure.unit` is set.
- Per-unit content checks do carry a unit name — but only for multi-unit properties:
  `summarizeReadiness` passes `unitName = multi ? u.name : null`, so on a single-unit
  listing every unit-owned failure (description, beds, floor, photos) arrives with no
  unit and routes to a property tab.
- The two "worst unit wins" availability rules carry no unit at all:
  `bookableWindowChecks(worstWindow)` and `localBookableWindowChecks(localWindow)` are
  called in `ru-cert-portal` without the unit argument the helpers accept.
- `ari_availability` / `ari_prices` name the failing units by numeric channel ID
  ("RU units 4213771: no open availability day"), which no UI can focus.
- `computeLocalBookableWindow` scores every unit but only keeps the *best* run, so the
  name of the weakest unit is discarded before the check is built.

## The fix

### 1. Always attach the unit name at the source

- `summarizeReadiness`: pass the unit name for single-unit properties too, and keep the
  `"NAME: "` text prefix only when the property has more than one unit. Routing data and
  display text stop being the same thing.
- `computeLocalBookableWindow`: while looping units, also record the weakest unit
  (`worst_unit: { name, longest_run, open_days, unpriced_open_days, min_stay_set }`) and
  the names of units with no MinStay. Scoring (`ok`, `longest_run`) is unchanged.
- `ru-cert-portal`: pass the unit name into both window helpers — the live probe learns
  its unit name by mapping `ru_property_id` back to the dry-run unit rows, the local path
  uses `localWindow.worst_unit`.
- `ari_availability` / `ari_prices`: report failing units by name (channel ID in
  brackets) and set `unit` when a single unit is responsible.

### 2. Make focus resilient on the client

- `resolveFailureTarget`: when a failure has no explicit unit but its check is unit-owned
  (rooms & beds, photos, availability, pricing, unit content), route to the Rooms tab and
  fall back — in order — to a `"NAME: "` prefix parsed off the message, then to the
  property's only unit when it has just one.
- `focusUnitCard`: normalise names before matching (case, punctuation, repeated spaces),
  fall back to a "starts with / contains" match, and focus the single unit card when the
  page renders only one — so a small naming drift no longer silently does nothing.

### 3. Same treatment for the other to-do surfaces

`RuChannelContentChecklist` and `RuReadinessScorecard` render the same failures but their
"Fix" links ignore the unit. They will call the wizard's unit-aware navigation so a unit
row opens that unit, exactly like the wizard rows do.

## Technical notes

- Files: `supabase/functions/_shared/ruReadiness.ts`,
  `supabase/functions/_shared/ruLocalWindow.ts`,
  `supabase/functions/ru-cert-portal/index.ts`,
  `src/hooks/useRolosOnboardingProgress.ts`,
  `src/lib/requirementFocus.ts`,
  `src/components/onboarding/rolos/RolosOnboardingWizard.tsx`,
  plus the two readiness panels.
- `RuCheck.unit` stays the single routing contract; no new payload shape for the client.
- No scoring change: the same checks pass and fail as today, they just say which unit.
- Verification: re-score a multi-unit property (Tidal Pools) and a single-unit property in
  the certification console and confirm every failing line carries a unit name, then click
  through the wizard to confirm the Rooms tab opens on that unit.
