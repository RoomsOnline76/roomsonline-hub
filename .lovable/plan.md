

## Plan: Fix Hostfully Building Importer — Scroll, Type Aggregation, and Re-import

Three issues across two components (`HostfullyBuildingImporter.tsx` and `HostfullyBuildingImportDialog.tsx`):

### 1. ScrollArea not scrolling

The `ScrollArea` in both components uses a fixed `h-[400px]` / `max-h-[400px]`, but Radix ScrollArea requires `overflow-hidden` on the viewport's parent to work. The issue is that `DialogContent` uses `flex flex-col` with `max-h-[85vh]`, and the `ScrollArea` needs explicit `overflow-hidden` on itself. Replace `ScrollArea` with a plain `div` using `overflow-y-auto` for reliable scrolling in both components.

### 2. Units listed individually instead of aggregated by type

The `HostfullyBuildingImportDialog` expanded view (lines 304-326) lists individual units (`building.units.slice(0, 12).map(...)`) instead of using `groupUnitsByType()` like `HostfullyBuildingImporter` does. Additionally, the fallback import logic (lines 170-198) creates one `hostfully_room_types` row per individual unit instead of per type group.

**Fix:** 
- Import and use `groupUnitsByType` in the dialog's expanded view to show type groups with unit counts (matching the card component's pattern)
- Update the fallback import logic to group units by type before inserting room types (same pattern as `HostfullyBuildingImporter.handleImport`)

### 3. Allow re-importing already-imported buildings

Currently, `isAlreadyImported` disables the checkbox (line 277) and `selectAll` skips them (line 100). Change this to:
- Still show the "Imported" badge for awareness
- Allow selection of already-imported buildings
- On import, delete existing `hostfully_room_types` and `hostfully_unit_map` rows for that property, then re-run `full_ingest_property` (or fallback) to overwrite with fresh data
- Update the property record instead of inserting a duplicate

### Files to Modify

| File | Change |
|------|--------|
| `src/components/pms/HostfullyBuildingImportDialog.tsx` | Fix scroll (replace ScrollArea with overflow div), aggregate units by type in expanded view, fix fallback import to group by type, allow re-import of existing buildings |
| `src/components/pms/HostfullyBuildingImporter.tsx` | Fix scroll (replace ScrollArea with overflow div) |

