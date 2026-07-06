## Goal
When a user is in a Portfolio context in the ROLOS Dashboard, the Restrictions dialogs (Stop Sell, Min Stay, Max Stay, Lead Days Advance, Lead Days Post) must let them choose which property (or properties) the restriction applies to — a specific property, several, or all properties in the portfolio. In single-property context, behaviour stays unchanged.

## Files to change

1. `src/pages/pms/PMSDashboard.tsx`
2. `src/components/BulkStopSellDialog.tsx`
3. `src/components/BulkMinimumStayDialog.tsx`
4. `src/components/BulkMaximumStayDialog.tsx`
5. `src/components/BulkLeadDaysAdvanceDialog.tsx`
6. `src/components/BulkLeadDaysPostDialog.tsx`

## Changes

### 1. Extend the dialog props (all 5 Bulk dialogs)
Add optional props:
- `portfolioProperties?: { id: string; name: string }[]` — the properties in the current portfolio (only passed when portfolio has >1 property).
- `roomTypesByProperty?: Record<string, { name: string; id?: string; units?: number }[]>` — room types keyed by property id, so we can show the correct rooms per selected property.

Keep existing `propertyId`, `propertyName`, `roomTypes` props for single-property (backwards compatible).

### 2. Add a Property Scope selector in each dialog
Rendered only when `portfolioProperties` has >1 entry:
- A "Apply to" section at the top of the right-hand form pane with:
  - Radio: **This property only** (default when a single `propertyId` is passed), **All properties in portfolio**, **Select specific properties**.
  - When "Select specific properties" is chosen, show a checkbox list of portfolio properties (with a "Select all" toggle).
- The resolved list of target `propertyIds` drives the write.

When no `portfolioProperties` prop is passed, the dialog behaves exactly as today (single property).

### 3. Room selection with multi-property scope
- When multiple properties are targeted, the left-hand "Select Rooms" list shows the **union of room type names** across the selected properties (deduped by name — `property_availability` matches on `room_type` name, so name-level selection is correct).
- Each room row shows a small subtitle listing which selected properties it belongs to (e.g. "3 properties").

### 4. Write logic
Loop the existing upsert/delete over each target `propertyId`:
- Stop Sell: upsert `property_availability` records with `property_id` per target.
- Min/Max Stay + Lead Days Advance/Post: the same field-per-date upsert pattern already used, iterated per property.
- Toast summarises `{dates} dates × {rooms} rooms × {properties} properties`.

### 5. Wire dialogs from `PMSDashboard.tsx`
- Compute `portfolioProperties` from the already-available `portfolioProperties` variable (only when `isPortfolioMode`).
- Compute `roomTypesByProperty` from portfolio room-type data (already fetched for the portfolio view — reuse the same query result; if not available for the currently-rendered dialog, fetch on demand using a lightweight `properties → amenities.room_types` query keyed by portfolio ids).
- Pass both props to the 5 `<Bulk*Dialog />` elements at the bottom of `PMSDashboard.tsx`.
- Default `propertyId`/`propertyName` still point at the currently-selected property so "This property only" is preselected and single-property flow is unchanged.

### 6. `onRuleCreated` invalidation
No changes — same query keys are invalidated; RLS already scopes per property, so writes to multiple properties in the same call are safe.

## Out of scope
- Any change to the calendar rendering, restriction visualisation, or rate/ARI logic.
- Any schema/migration change (still writing to `property_availability`).
- Non-restriction dialogs (Bulk Rate, Manual Booking).