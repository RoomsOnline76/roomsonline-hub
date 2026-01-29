
# Hide Deprecated PMS Systems from Integrations & PMS Control

## Problem Summary
Four PMS systems are no longer required and should be hidden from the Integrations (`/admin-keys`) and PMS Control (`/dev/pms`) dashboards:
- **Little Hotelier** (`littlehotelier`)
- **Guesty** (`guesty`) - Note: No "Guestly" exists; assuming this was a typo
- **Rentals United** (`rentalsunited`)

Hiding these systems should also adjust the milestone counts and totals so they are not included in statistics.

---

## Solution Overview

Add a `hidden` flag to the centralized PMS configuration and filter these systems from all views and statistics. This approach:
- Keeps the data available for reference if needed later
- Ensures clean removal from UI without breaking any existing database records
- Automatically adjusts all milestone/total counts

---

## Technical Implementation

### File 1: `src/lib/pmsSystemsConfig.ts`

**1. Add `hidden` property to interface**

```typescript
export interface PMSSystemConfig {
  key: string;
  name: string;
  description: string;
  isInternal?: boolean;
  hasCustomCard?: boolean;
  deploymentStatus: DeploymentStatus;
  isWidgetOnly?: boolean;
  hidden?: boolean; // NEW: Hide from UI without removing config
}
```

**2. Mark systems as hidden**

```typescript
// G
{
  key: 'guesty',
  name: 'Guesty',
  description: 'Property management and guest experience platform for vacation rentals',
  deploymentStatus: 'planned',
  hidden: true, // No longer required
},
// L
{
  key: 'littlehotelier',
  name: 'Little Hotelier',
  description: 'Cloud-based property management system designed for small hotels, B&Bs, and guest houses',
  hasCustomCard: true,
  deploymentStatus: 'in_development',
  hidden: true, // No longer required
},
// R
{
  key: 'rentalsunited',
  name: 'Rentals United',
  description: 'Channel manager and distribution platform for vacation rentals',
  hasCustomCard: true,
  deploymentStatus: 'in_development',
  hidden: true, // No longer required
},
```

**3. Add filtered export for visible systems**

```typescript
// Get only visible systems (excludes hidden)
export const VISIBLE_PMS_SYSTEMS = ALL_PMS_SYSTEMS.filter(s => !s.hidden);

// Update total count to use visible systems
export const TOTAL_PMS_SYSTEMS_COUNT = VISIBLE_PMS_SYSTEMS.length;
```

---

### File 2: `src/pages/DevPMS.tsx`

**1. Use VISIBLE_PMS_SYSTEMS instead of ALL_PMS_SYSTEMS**

Update the import:
```typescript
import { VISIBLE_PMS_SYSTEMS, PMSSystemConfig, getIntegrationStatusInfo, IntegrationStatus } from "@/lib/pmsSystemsConfig";
```

**2. Update systemsWithConnections mapping**
```typescript
// Build systems list from centralized config (visible only)
const systemsWithConnections: SystemWithConnections[] = VISIBLE_PMS_SYSTEMS.map(config => ({
  config,
  connections: adapters.filter(a => a.system_type === config.key),
  trackerStatus: trackerStatuses.find(t => t.system_type === config.key) || null,
}));
```

**3. Update stats to use visible systems**
```typescript
// Stats - use visible systems count
const totalSystems = VISIBLE_PMS_SYSTEMS.length;
const deployedSystems = trackerStatuses.filter(t => 
  t.integration_status === 'deployed' && 
  VISIBLE_PMS_SYSTEMS.some(s => s.key === t.system_type)
).length;
```

---

### File 3: `src/pages/AdminKeys.tsx`

**1. Update import**
```typescript
import { TOTAL_PMS_SYSTEMS_COUNT, VISIBLE_PMS_SYSTEMS } from "@/lib/pmsSystemsConfig";
```

**2. Filter out hidden systems from card rendering**

The AdminKeys page uses `hasCustomCard` to determine which systems show cards. By marking the hidden systems, we need to ensure they're excluded. The cleanest approach is to check `hidden` when iterating through systems.

Since AdminKeys renders individual cards manually (not from a loop), we need to:
- Remove or skip the Little Hotelier card section
- Rentals United card section (if present)
- Guesty doesn't have a custom card, so no change needed there

Alternatively, wrap the existing card sections in a conditional that checks visibility:
```typescript
{!VISIBLE_PMS_SYSTEMS.find(s => s.key === 'littlehotelier')?.hidden && (
  // Little Hotelier Card JSX
)}
```

However, since we're marking these as `hidden: true` and they won't be in `VISIBLE_PMS_SYSTEMS`, a simpler approach is to check if the system exists in `VISIBLE_PMS_SYSTEMS` before rendering.

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/lib/pmsSystemsConfig.ts` | Add `hidden` flag to interface; mark 3 systems as hidden; add `VISIBLE_PMS_SYSTEMS` export; update `TOTAL_PMS_SYSTEMS_COUNT` |
| `src/pages/DevPMS.tsx` | Use `VISIBLE_PMS_SYSTEMS` for rendering and stats |
| `src/pages/AdminKeys.tsx` | Filter out hidden systems from card display |

## Result

After implementation:
- **Total Systems count** will decrease from 15 to 12
- **Deployed Systems ratio** will adjust to exclude hidden systems
- No cards or rows will appear for Little Hotelier, Guesty, or Rentals United
- All milestone tracking excludes these systems
- Database records remain intact (no data loss)
