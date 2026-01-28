

# Dev Side Menu Alignment Plan

## Current State Analysis

The navigation configuration (`src/config/navigation.ts`) correctly defines all 9 dev-only items under the **System Control** section, but the **AppSidebar component** only renders 3 of them. This creates a mismatch where developers cannot access most of the dev-only features from the sidebar.

### Missing Items in Sidebar

| Item | Route | Description |
|------|-------|-------------|
| System Overview | `/dev/overview` | Global health dashboard (where manual health report button is) |
| PMS Control | `/dev/pms` | Adapter status and controls |
| Data & Logs | `/dev/logs` | Sync and error logs |
| Feature Flags | `/dev/features` | Feature flag management |
| **AI Testing** | `/dev/testing` | AI-assisted test generation (the feature you asked about) |
| Danger Zone | `/dev/danger` | Destructive operations |

### Current Sidebar Items (incomplete)
- Integrations (`/admin-keys`)
- Supporting Systems (`/admin/supporting-systems`)
- System Health (`/admin/system-health`)

---

## Solution: Sync AppSidebar with Navigation Config

### Technical Approach

Update `src/components/layout/AppSidebar.tsx` to include all dev-only items from the navigation config. The items will be grouped under the collapsible **System** section.

### Updated `systemItems` Array

```typescript
const systemItems: NavItem[] = [
  { title: "System Overview", icon: Activity, href: "/dev/overview", requireDev: true },
  { title: "PMS Control", icon: Server, href: "/dev/pms", requireDev: true },
  { title: "Integrations", icon: KeyRound, href: "/admin-keys", requireDev: true },
  { title: "Supporting Systems", icon: Settings, href: "/admin/supporting-systems", requireDevOrFearless: true },
  { title: "System Health", icon: HeartPulse, href: "/admin/system-health", requireDevOrFearless: true },
  { title: "Data & Logs", icon: Database, href: "/dev/logs", requireDev: true },
  { title: "Feature Flags", icon: Flag, href: "/dev/features", requireDev: true },
  { title: "AI Testing", icon: FlaskConical, href: "/dev/testing", requireDev: true },
  { title: "Danger Zone", icon: AlertTriangle, href: "/dev/danger", requireDev: true },
];
```

### Required Icon Imports

Add these imports to the file:
- `Activity`
- `Database`
- `Flag`
- `FlaskConical`
- `AlertTriangle`

---

## Implementation Details

### File: `src/components/layout/AppSidebar.tsx`

**Changes:**

1. **Add missing icon imports** (lines 3-31):
   ```typescript
   import {
     // ... existing imports
     Activity,
     Database,
     Flag,
     FlaskConical,
     AlertTriangle,
   } from "lucide-react";
   ```

2. **Replace `systemItems` array** (lines 123-128):
   Update to include all 9 dev-only navigation items with correct permission flags.

---

## Access Pattern Summary

After this change, the sidebar under **System** (for dev/fearless_leader users) will show:

```text
SYSTEM (collapsible)
├── System Overview        [dev only]
├── PMS Control           [dev only]
├── Integrations          [dev only]
├── Supporting Systems    [dev/fearless_leader]
├── System Health         [dev/fearless_leader]
├── Data & Logs           [dev only]
├── Feature Flags         [dev only]
├── AI Testing            [dev only]  ← The feature you asked about
└── Danger Zone           [dev only]
```

---

## Security Notes

- All routes are already protected by `ProtectedRoute` with `requireDev={true}` or `requireDevOrFearless={true}` in `App.tsx`
- The sidebar only controls visibility; actual access enforcement happens at the route level
- RLS policies on `test_runs` and `test_logs` tables further restrict data access to `dev` role

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/layout/AppSidebar.tsx` | Add missing icon imports and expand `systemItems` array |

---

## Expected Outcome

After implementation:
- Developers can access all 9 system control features from the sidebar
- AI Testing (`/dev/testing`) will be visible under the collapsible **System** section
- The sidebar will match the navigation configuration exactly
- No changes to route protection or database access

