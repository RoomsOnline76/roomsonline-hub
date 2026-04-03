

# Sync Rate Types & Seasons to Other Properties

## Problem
When an owner manages multiple properties (or properties in a portfolio), they must manually recreate the same rate types and season definitions on each property. There's no way to copy/sync this configuration across properties.

## Solution
Add a **"Sync to Other Properties"** button on both the **Rate Types** and **Seasons** sub-tabs. Clicking it opens a dialog showing all other properties the current owner has access to (via `owner_email` match or `property_owners` links) plus any properties in shared portfolios. The user selects target properties and confirms, then the system copies the data into those properties' `amenities` JSONB.

### Sync Dialog Flow
1. Button click opens a dialog/sheet
2. Two groupings shown: **"Same Owner"** properties and **"Portfolio"** properties (with portfolio name labels)
3. User checks target properties, clicks "Sync"
4. System reads each target property's amenities, merges rate types / seasons (by name match = update, no match = add), and saves
5. Toast confirms: "Synced to 3 properties"

### Sync Rules
- **Rate Types**: Matched by `name` (case-insensitive). Existing rate types with the same name are updated; new ones are appended. PMS-synced rate types on target properties are skipped (not overwritten).
- **Seasons**: Matched by `name`. Existing seasons with the same name get their periods/dates/color/min-max updated; new ones are appended. Season rates (`season_rates`) are NOT synced (rates are room-specific and differ per property).

### Visual Layout
```text
┌─ Sync Rate Types to Other Properties ──────────┐
│                                                  │
│  Same Owner:                                     │
│  ☐ Property A                                    │
│  ☐ Property B                                    │
│                                                  │
│  Portfolio "Luxury Collection":                   │
│  ☐ Property C                                    │
│  ☐ Property D (current - disabled)               │
│                                                  │
│  ☑ Select All                                    │
│                                                  │
│  [Cancel]                    [Sync to 2 Properties] │
└──────────────────────────────────────────────────┘
```

## Files to Change

| File | Changes |
|------|---------|
| `src/components/property/SyncRatesDialog.tsx` | **Create** — reusable dialog component that accepts `mode: "rate-types" | "seasons"`, current property ID, data to sync. Fetches sibling properties, handles merge logic and save. |
| `src/pages/PropertyForm.tsx` | Add "Sync to Other Properties" button next to "Add Rate Type" and in the Seasons section header. Wire to `SyncRatesDialog`. |

