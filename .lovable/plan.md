

# Plan: Fix Departure/Arrival Counters, Enhance Housekeeping with Maintenance Dockets

## Issues Identified

1. **Departures counter** queries `["confirmed", "checked_in"]` — this is correct (shows guests due to depart who haven't checked out). After checkout, status becomes `checked_out` and they correctly disappear. The query invalidation on `onSaved` already covers `pms-arrivals` and `pms-departures`. **No bug here.**

2. **Housekeeping page** is basic — only shows dirty/maintenance/clean rooms with a "Done" button. Missing: maintenance docket creation, completion feedback, room-ready confirmation checkbox, and the page doesn't auto-update when rooms change via check-in/out.

## Implementation

### 1. Housekeeping Page Rewrite (`PMSHousekeeping.tsx`)

Replace current minimal page with a full housekeeping management board:

**Columns remain**: Needs Cleaning, Maintenance, Ready — but enhanced:

- **Needs Cleaning cards**: Show task details, completion notes textarea, "Mark Done" button
- **Maintenance column**: 
  - "Create Maintenance Docket" button that opens a dialog
  - Docket form: room selector, issue type (plumbing/electrical/hvac/furniture/appliance/structural/other), priority, description, estimated cost
  - Each maintenance card shows: issue, priority badge, status, completion feedback textarea
  - **"Room Ready" checkbox** — only appears on resolved maintenance items. If checked → room becomes `available`. If not checked → room stays `out_of_order`
  - "Mark Resolved" button with required completion notes
- **Ready column**: Shows available rooms (no change)

**Data fetching**: Switch from edge function to direct Supabase queries for rooms + housekeeping tasks + maintenance requests. This allows real-time reactivity and avoids the edge function limitation. Add a refresh button + auto-refresh interval.

### 2. Maintenance Docket Dialog (inline in `PMSHousekeeping.tsx`)

- Dialog with form fields matching `rolos_maintenance_requests` schema
- Room selector from `rolos_rooms` 
- On create: inserts into `rolos_maintenance_requests` and sets room status to `maintenance`
- On resolve: updates request status to `resolved`, adds completion notes
- On "Room Ready" checkbox toggle: if checked, sets room to `available`; if unchecked after resolve, sets room to `out_of_order`

### 3. Edge Function Update (`roomsonline-pms-api`)

- `complete_housekeeping_task`: Currently auto-sets room to `available` for clean tasks. Change: for maintenance tasks, do NOT auto-set to available — leave as `maintenance` until the room-ready checkbox is confirmed on the frontend.

### 4. Add `completion_notes` and `room_ready_confirmed` to maintenance requests

**Migration**: Add two columns to `rolos_maintenance_requests`:
```sql
ALTER TABLE public.rolos_maintenance_requests 
  ADD COLUMN completion_notes text,
  ADD COLUMN room_ready_confirmed boolean DEFAULT false;
```

Also update the validation trigger to allow a new status `'closed'` for fully confirmed maintenance.

## Files Modified

| File | Change |
|---|---|
| **DB Migration** | Add `completion_notes`, `room_ready_confirmed` to `rolos_maintenance_requests` |
| `PMSHousekeeping.tsx` | Full rewrite with maintenance dockets, completion feedback, room-ready checkbox |
| `roomsonline-pms-api/index.ts` | Update `complete_housekeeping_task` to not auto-set room available for maintenance tasks |

