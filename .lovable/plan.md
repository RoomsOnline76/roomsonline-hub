

# Phase 1: Refactor PropertyForm.tsx into Isolated Components

## Current State
`PropertyForm.tsx` is **12,536 lines** — a monolithic file containing ~20 tabs, ~30 state variables, PMS adapter logic, room CRUD, rate management, seasons, specials, packages, addons, integrations, and more. It has 31 direct `supabase.*` calls embedded throughout.

## Approach
Extract tab content into dedicated component files, keeping `PropertyForm.tsx` as a thin orchestrator that manages shared state, loads/saves the property, and renders the tab shell. Each extracted component receives props for the data it needs.

This is a large refactor — to keep each implementation step reviewable and safe, I propose splitting Phase 1 into **4 sub-phases**:

---

### Sub-phase 1A: Extract Room Management (~lines 10179–11113)
**New file**: `src/components/property/RoomManager.tsx`
- Room type list, add/edit/delete room dialogs, bed configuration, room images, facilities/amenities sub-tabs
- Receives: `propertyId`, `selectedPMS`, `roomTypes` state + setters, `isPMSManaged()`, save callbacks
- All room-related state moves into this component
- ~930 lines extracted

### Sub-phase 1B: Extract Rate & Season Management (~lines 8484–10150)
**New file**: `src/components/property/RateManager.tsx`
- Rate types CRUD, season calendar, rate breakdown grid, charges/fees, billing config, policies, overview
- Receives: `propertyId`, `roomTypes` (read-only), `seasons`, `rateTypes` state + setters
- ~1,660 lines extracted

### Sub-phase 1C: Extract PMS Adapter Selection & Sync Logic (~lines 135–155, 4603–4615, sync functions)
**New file**: `src/components/property/PMSAdapterPanel.tsx`
- PMS dropdown, sync-from-Benson/Hostfully/NightsBridge buttons, credential display
- Moves the `fetchLiveRates()` and PMS sync logic out of PropertyForm
- Receives: `propertyId`, `selectedPMS` + setter, `onSyncComplete` callback
- ~200 lines of switch/adapter logic + sync functions consolidated

### Sub-phase 1D: Slim down PropertyForm.tsx to orchestrator
- PropertyForm becomes the shell: loads property data, manages `activeTab`, holds shared state (name, address, etc.), renders `<Tabs>` with each `<TabsContent>` delegating to the extracted component
- Target: under 2,000 lines (General tab + smaller tabs remain inline until later phases)
- No functional changes — just wiring props to child components

---

## Files changed per sub-phase

| Sub-phase | New/Modified Files |
|---|---|
| 1A | Create `src/components/property/RoomManager.tsx`, trim `PropertyForm.tsx` |
| 1B | Create `src/components/property/RateManager.tsx`, trim `PropertyForm.tsx` |
| 1C | Create `src/components/property/PMSAdapterPanel.tsx`, trim `PropertyForm.tsx` |
| 1D | Final cleanup of `PropertyForm.tsx`, verify all tabs still render correctly |

## What does NOT change
- No database migrations
- No edge function changes (PMS API calls still go to existing edge functions via `supabase.functions.invoke`)
- No routing changes
- No user-facing behavior changes — purely internal restructuring

## Risk mitigation
- Each sub-phase is independently testable — the property edit form must still load, display all tabs, and save correctly after each extraction
- Shared state (property data, dirty flag, save function) stays in PropertyForm and is passed as props
- Existing child components (`BillingConfigTab`, `PoliciesTab`, `BrandingTab`, etc.) are already extracted and remain untouched

