## Goal
When creating a Yield Rule with type "Season", allow the user to link it to a configured Season (from `rolos_rate_seasons`) instead of a generic "Season-based" placeholder.

## Changes (single file: `src/pages/pms/PMSRevenue.tsx`)

1. **Fetch seasons for the selected property**
   - Add a `useSeasons(propertyId)` hook querying `rolos_rate_seasons` filtered by `property_id`, ordered by `start_date`.
   - Return `id`, `name`, `start_date`, `end_date`.

2. **Extend the create form state**
   - Add `season_id: ""` to the `form` state and its reset defaults.

3. **Render a Season selector when `form.rule_type === "season"`**
   - Show a `<Select>` of the property's configured seasons (label: `name (start – end)`).
   - Empty state: helper text linking the user to configure seasons first if none exist.
   - Required to save when rule type is season.

4. **Persist the link in `condition`**
   - In `handleCreate`, when `rule_type === "season"`, set `condition = { season_id: form.season_id }`.

5. **Display in the rule list**
   - Update `formatCondition` for `case "season"` to look up the linked season by `condition.season_id` and render `Season: {name} ({start} – {end})`, falling back to "Season-based" if not found.

6. **Validation**
   - Disable the "Create Rule" button when `rule_type === "season"` and no `season_id` selected.

No schema migration is required — `condition` is already a JSONB field, so storing `{ season_id }` is compatible with existing rows. No backend/edge-function changes.

## Out of scope
- Applying the yield adjustment against a season at pricing calculation time (existing rule execution layer) — this plan only adds the linkage/config option as requested.