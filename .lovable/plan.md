

# Apply Single-Property Room Type Deduplication to Portfolio View

## Problem
In portfolio view, room types are fetched without the deduplication logic that single-property mode uses. Single-property mode (lines 298-324) filters room types against the canonical list from `amenities.room_types` and deduplicates by normalized name, keeping only the best match (preferring linked overview IDs and higher rates). Portfolio mode (line 643) just uses the raw filtered list, causing duplicate room types like "Kabbeljou" and "Mosselkraker Galjoen" to appear twice.

## Solution
Apply the same deduplication logic per-property inside the `portfolioDataByProperty` memo (lines 638-677). For each property in the portfolio, after filtering room types by `property_id`:

1. Load that property's `amenities.room_types` from `portfolioPropertiesData` to build a `canonicalAmenityNames` set
2. If the property is a ROL'OS property and has canonical names, filter room types to only those matching canonical names
3. Deduplicate by normalized name, keeping the entry with the best score (linked_overview_id weight + default_rate)

This is the exact same logic already working in single-property mode, just applied per-property within the portfolio grouping loop.

## File to change

| File | Change |
|------|--------|
| `src/pages/pms/PMSDashboard.tsx` | In `portfolioDataByProperty` memo (~line 642-674), after filtering `propRoomTypes`, apply canonical name filtering and name-based deduplication using `propData.amenities.room_types` — mirroring the single-property logic at lines 298-324 |

