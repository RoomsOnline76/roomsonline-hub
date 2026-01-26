

# Add "Certify" Milestone to PMS Progress Toggles

## Overview

Add a new **"Certify"** milestone between "Test" and "Live" in the PMS implementation progress tracker. This changes the total milestones from 8 to 9.

**Current Flow:**
```
Setup: Account → Docs → Edge
Integration: Health → GET → POST → Test → Live
```

**New Flow:**
```
Setup: Account → Docs → Edge
Integration: Health → GET → POST → Test → Certify → Live
```

---

## Changes Required

### 1. Database Migration

Add new boolean column `is_certified` to the `pms_tracker_status` table:

```sql
ALTER TABLE pms_tracker_status 
ADD COLUMN is_certified boolean DEFAULT false;

COMMENT ON COLUMN pms_tracker_status.is_certified IS 'Integration certified/approved for production use';
```

---

### 2. Update TypeScript Interface

**File:** `src/lib/pmsTrackerConfig.ts`

Add `is_certified` to the `PMSTrackerStatus` interface and update `getProgressCount`:

```typescript
export interface PMSTrackerStatus {
  // ... existing fields ...
  has_soft_test: boolean;
  is_certified: boolean;  // NEW
  is_production: boolean;
}

export const getProgressCount = (tracker: PMSTrackerStatus) => {
  const flags = [
    tracker.has_account,
    tracker.has_docs,
    tracker.has_edge,
    tracker.has_health,
    tracker.has_get,
    tracker.has_post,
    tracker.has_soft_test,
    tracker.is_certified,   // NEW
    tracker.is_production,
  ];
  // Total now 9 instead of 8
};
```

---

### 3. Update Progress Toggles Component

**File:** `src/components/PMSProgressToggles.tsx`

Add the new "Certify" field with the `BadgeCheck` icon (best represents certification/approval):

```typescript
import { BadgeCheck } from 'lucide-react';  // Add to imports

const integrationFields: ProgressField[] = [
  { key: 'has_health', dbColumn: 'has_health', icon: HeartPulse, label: 'Health', description: 'Can connect and verify credentials' },
  { key: 'has_get', dbColumn: 'has_get', icon: Download, label: 'GET', description: 'Can pull availability/rates data' },
  { key: 'has_post', dbColumn: 'has_post', icon: Upload, label: 'POST', description: 'Can push bookings to PMS' },
  { key: 'has_soft_test', dbColumn: 'has_soft_test', icon: FlaskConical, label: 'Test', description: 'Tested with sandbox/test property' },
  { key: 'is_certified', dbColumn: 'is_certified', icon: BadgeCheck, label: 'Certify', description: 'Integration certified and approved for production' },  // NEW
  { key: 'is_production', dbColumn: 'is_production', icon: Rocket, label: 'Live', description: 'Live with real properties' },
];
```

---

## Visual Result

After implementation, all API cards will show:

```
Implementation Progress  X/9 complete

Setup:       [Account] [Docs] [Edge]
Integration: [Health] [GET] [POST] [Test] [Certify] [Live]
```

---

## Files Modified

| File | Change |
|------|--------|
| Database migration | Add `is_certified` boolean column |
| `src/lib/pmsTrackerConfig.ts` | Add `is_certified` to interface and progress count |
| `src/components/PMSProgressToggles.tsx` | Add "Certify" field with `BadgeCheck` icon |

---

## Technical Notes

- **Icon choice:** `BadgeCheck` from lucide-react - represents certification/approval
- **Position:** Between "Test" (sandbox testing complete) and "Live" (production deployment)
- **Description:** "Integration certified and approved for production" - represents the formal sign-off before going live
- **Default value:** `false` for existing records

