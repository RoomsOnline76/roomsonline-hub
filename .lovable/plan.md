
# Fix Milestone Count to Include "Certify" (9 milestones)

## Problem

The "Certify" milestone was added to the database and toggle UI, but the **global milestone counts** still show 8 milestones per system:

| Location | Current | Should Be |
|----------|---------|-----------|
| AdminKeys page subtitle | "33 of 104 milestones" | "34 of 117 milestones" |
| Status report email | 8 milestones/system | 9 milestones/system |

Marking Benson as "Certified" doesn't increase the count because `is_certified` isn't being counted.

---

## Root Cause

Two files need updates to include `is_certified`:

1. **`src/pages/AdminKeys.tsx`** - Lines 1613-1625
2. **`supabase/functions/send-pms-status-report/index.ts`** - Lines 11-32, 105-117, 148-210

---

## Solution

### Part 1: Fix AdminKeys.tsx Progress Stats

**File:** `src/pages/AdminKeys.tsx` (lines 1613-1625)

Update the `getProgressStats` function to include `is_certified`:

```typescript
const getProgressStats = () => {
  const trackableSystems = Object.entries(trackerData)
    .filter(([key]) => !['roomsonline', 'recaptcha', 'google_maps'].includes(key));
  
  let completedFlags = 0;
  const totalFlags = trackableSystems.length * 9; // 9 flags per system (was 8)
  let deployedCount = 0;
  
  trackableSystems.forEach(([_, data]) => {
    // Count completed flags - Setup phase
    if (data.has_account) completedFlags++;
    if (data.has_docs) completedFlags++;
    if (data.has_edge) completedFlags++;
    // Integration phase
    if (data.has_health) completedFlags++;
    if (data.has_get) completedFlags++;
    if (data.has_post) completedFlags++;
    if (data.has_soft_test) completedFlags++;
    if (data.is_certified) completedFlags++;  // NEW
    if (data.is_production) completedFlags++;
    
    // Count deployed systems
    if (data.integration_status === 'deployed') deployedCount++;
  });
  
  return { 
    completedFlags, 
    totalFlags: totalFlags || 117, // 13 systems × 9 = 117 (was 96)
    deployedCount,
    systemCount: trackableSystems.length || 13
  };
};
```

Also update the comment above the function (line 1606):
```typescript
// Calculate total progress across all trackable systems (9 flags × 13 systems = 117 milestones)
```

---

### Part 2: Fix Status Report Email

**File:** `supabase/functions/send-pms-status-report/index.ts`

#### A. Update TrackerData interface (lines 11-32)

Add `is_certified`:

```typescript
interface TrackerData {
  // ... existing fields ...
  has_soft_test: boolean;
  is_certified: boolean;  // NEW
  is_production: boolean;
  // Legacy
  has_access: boolean;
  additional_info: Record<string, string> | null;
}
```

#### B. Update totalMilestones calculation (lines 105-117)

Add `is_certified` to the count:

```typescript
// Calculate total milestones (9 per system)
let totalMilestones = 0;
trackerData.forEach((t) => {
  // Setup phase
  if (t.has_account) totalMilestones++;
  if (t.has_docs) totalMilestones++;
  if (t.has_edge) totalMilestones++;
  // Integration phase
  if (t.has_health) totalMilestones++;
  if (t.has_get) totalMilestones++;
  if (t.has_post) totalMilestones++;
  if (t.has_soft_test) totalMilestones++;
  if (t.is_certified) totalMilestones++;  // NEW
  if (t.is_production) totalMilestones++;
});
const maxMilestones = trackerData.length * 9;  // was 8
```

#### C. Update table row generation (lines 148-210)

Add `is_certified` to integration flags and update labels:

```typescript
// Setup phase: Account, Docs, Edge
const setupFlags = [row.has_account || row.has_access, row.has_docs, row.has_edge];
// Integration phase: Health, GET, POST, Test, Certify, Live (6 flags)
const integrationFlags = [
  row.has_health, 
  row.has_get, 
  row.has_post, 
  row.has_soft_test, 
  row.is_certified,  // NEW
  row.is_production
];
const allFlags = [...setupFlags, ...integrationFlags];

// ... later in the function ...

// Integration progress dots (Health, GET, POST, Test, Certify, Live)
const integrationLabels = ["He", "Gt", "Ps", "Te", "Ce", "Lv"];  // Added "Ce"
const integrationTitles = ["Health", "GET", "POST", "Test", "Certify", "Live"];

// ... and update the count display ...
<div style="...">${flagsCompleted}/9</div>  // was /8
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/AdminKeys.tsx` | Add `is_certified` to `getProgressStats()`, change multiplier from 8→9 |
| `supabase/functions/send-pms-status-report/index.ts` | Add `is_certified` to interface, calculations, and email template |

---

## Expected Result

After fix:

| Metric | Before | After |
|--------|--------|-------|
| Page subtitle | "33 of 104 milestones" | "34 of 117 milestones" |
| Benson marked certified | Count stays same | Count increases by 1 |
| Email report | Shows 8 per system | Shows 9 per system |
| Email dots | 5 integration dots | 6 integration dots |

---

## Technical Notes

### Milestone Flow (9 total per system)

```text
Setup (3):       Account → Docs → Edge
Integration (6): Health → GET → POST → Test → Certify → Live
```

### System Count

Currently 13 trackable systems (excluding roomsonline, recaptcha, google_maps):
- benson, nightsbridge, checkfront, littlehotelier, cloudbeds, hostfully
- rentalsunited, semper, siteminder, mews, guesty, hotelbeds, roomracoon

Total milestones: 13 × 9 = **117**
