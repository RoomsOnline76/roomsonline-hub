

# Onboarding Wizard — PMS/Channel Manager Dropdowns & Dynamic Room Labels

## Changes

### 1. StepPropertyIdentity — PMS & Channel Manager as Dropdowns (Multi-Select)

**Current**: Two free-text `<Input>` fields for "PMS" and "Channel Manager" (lines 308-325).

**New**: Replace with two multi-select dropdown sections using the existing `ALL_PMS_SYSTEMS` config:
- **PMS dropdown**: Shows all non-internal, visible PMS systems from `pmsSystemsConfig.ts` (Hostfully, NightsBridge, Benson, etc.). Allow selecting multiple. Store as `amenities.pms_systems: string[]` (array of keys).
- **Channel Manager dropdown**: Shows channel-manager-type systems (SiteMinder, Rentals United, etc.). Allow selecting multiple. Store as `amenities.channel_managers: string[]`.
- Keep backward compat: also write the first selected PMS name to `amenities.pms_name` and first channel manager to `amenities.channel_manager` so existing code doesn't break.
- UI: Use checkbox list inside a collapsible or use Badge-based multi-select (checkboxes with system names, selected ones show as badges above).

### 2. StepRoomsOverview — Dynamic Accommodation Labels

**Current**: The accommodation label selector exists (line 62-81) but the rest of the page still says "Room Type 1", "Room Name", "Add Room Type", "No room types yet" etc.

**New**: Read the selected `accommodation_label` value and use `ACCOMMODATION_TYPES` to dynamically replace all "Room" references:
- "Room Type 1" → "Tent 1", "Chalet 1", etc.
- "Room Name" → "Tent Name", "Chalet Name"
- "Add Room Type" → "Add Tent Type" / "Add Chalet Type"
- Summary text: "2 room types" → "2 tent types"
- Empty state: "No room types yet" → "No tent types yet"
- The label selector description updates to reflect the current choice

## Files to Change

| File | Changes |
|------|---------|
| `src/components/onboarding/steps/StepPropertyIdentity.tsx` | Replace PMS/Channel Manager text inputs with multi-select from `ALL_PMS_SYSTEMS`; save as arrays to amenities |
| `src/components/onboarding/steps/StepRoomsOverview.tsx` | Use selected accommodation label to dynamically replace all hardcoded "Room" / "room" text |

