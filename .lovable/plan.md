

# Phase 3: Live Collaborative Command Centre

## Overview

Add an "agent" PMS staff role and a new "Command Centre" view within the PMS shell. Agents see a read-only, multi-property availability calendar with AI-powered suggestions (via the `agent_command` experience-engine handler). Admins can assign the "agent" role via access requests and staff management.

## 1. Add `agent` Staff Role

**File**: `src/lib/pmsPermissions.ts`

Add `"agent"` to `PmsStaffRole` union type. Add permission row — agents see: `dashboard` (RO), `calendar` (RO), `rooms` (RO), `groups` (RO), and a new `"command-centre"` module (FULL). Everything else NONE.

Add `"command-centre"` to `PmsModule` union type. Update all existing role rows to include `"command-centre": NONE` except agent (FULL) and property_owner/general_manager (FULL).

Add agent to `ROLE_LABELS` and `ROLE_DESCRIPTIONS`.

## 2. Database: Add `agent` to `property_staff.staff_role` Check

**Migration**: If `staff_role` on `property_staff` uses a check constraint or enum, extend it to include `'agent'`. This allows assigning staff as agents on specific properties.

## 3. Command Centre Page

**New file**: `src/pages/pms/PMSCommandCentre.tsx`

A read-only, multi-property availability overview:

- **Property selector**: If agent is linked to multiple properties, show a multi-select or "all properties" view
- **Availability grid**: Re-uses the same `fetchPmsAvailability()` pattern from `CalendarAccommodation.tsx` — queries `pms_availability_cache` and/or live adapter. Renders a simplified week/month calendar grid showing room availability per room type across properties
- **Occupancy summary cards**: Today's occupancy %, arrivals, departures per property
- **AI Suggestions panel** (optional, collapsible): Calls `experience-engine` with `experience_type: 'agent_command'` to get AI-powered suggestions (e.g., "Property X has 40% vacancy next week — consider promoting"). Uses Lovable AI via the edge function
- **Quick actions**: "Copy availability link", "Share with client" (generates a shareable read-only view URL)

The view is read-only — no rate changes, no bookings from this screen. Agents wanting to book redirect to the property's booking page.

## 4. Experience Engine: `agent_command` Handler

**File**: `supabase/functions/experience-engine/index.ts`

The `agent_command` case already falls through to `resolveExperienceConfig`. Enhance it to:

- Accept payload with `{ properties: string[], date_range: { start, end } }`
- Query `pms_availability_cache` for the given properties and date range
- Call Lovable AI (via gateway) with occupancy data + a system prompt to generate agent-facing suggestions
- Return `{ suggestions: [...], availability_summary: {...} }`

The AI prompt is stored in `rolos_experience_configs` for the property (or a global default), allowing customization.

## 5. Route + Navigation

**File**: `src/App.tsx`

Add route: `<Route path="command-centre" element={<PMSCommandCentre />} />` inside the `/pms` shell.

**PMS sidebar**: Add "Command Centre" nav item, visible when `getModuleAccess(role, 'command-centre').visible` is true.

## 6. Access Request: Agent Role Assignment

**File**: `src/pages/AdminAccessRequests.tsx`

When approving an access request, the role dropdown already supports multiple roles. Add "Agent" as an assignable role option. When selected, show a property multi-select so the admin can link the agent to specific properties (inserts into `property_staff` with `staff_role = 'agent'`).

**File**: `src/components/AddUserModal.tsx`

Add "Agent" to the role options. When selected, show property assignment fields.

## 7. Agent Dashboard Landing

When an agent logs in and navigates to `/pms`, they land on the Command Centre (since `dashboard` is RO for them). The PMS sidebar shows only their permitted modules: Command Centre, Calendar (RO), Rooms (RO), Groups (RO).

## Technical Details

### Permission matrix entry for `agent`
```
agent: {
  dashboard: RO, rooms: RO, "rate-plans": NONE, guests: NONE,
  housekeeping: NONE, reports: NONE, branding: NONE, integrations: NONE,
  staff: NONE, calendar: RO, channels: NONE, groups: RO, events: NONE,
  "night-audit": NONE, messaging: NONE, portfolio: NONE, revenue: NONE,
  "command-centre": FULL,
}
```

### AI suggestion prompt (stored in `rolos_experience_configs`)
```json
{
  "system_prompt": "You are a travel agent assistant. Given property availability data, suggest actionable recommendations for agents to maximize bookings.",
  "model": "google/gemini-3-flash-preview",
  "max_suggestions": 5
}
```

## Files

| Action | File |
|--------|------|
| Migration | Extend `property_staff.staff_role` to allow `'agent'` value |
| Create | `src/pages/pms/PMSCommandCentre.tsx` — multi-property availability + AI suggestions |
| Modify | `src/lib/pmsPermissions.ts` — add `agent` role + `command-centre` module |
| Modify | `src/App.tsx` — add `/pms/command-centre` route |
| Modify | PMS sidebar component — add Command Centre nav item |
| Modify | `src/pages/AdminAccessRequests.tsx` — add Agent role option with property assignment |
| Modify | `src/components/AddUserModal.tsx` — support agent role |
| Modify | `supabase/functions/experience-engine/index.ts` — enhance `agent_command` handler with AI |

