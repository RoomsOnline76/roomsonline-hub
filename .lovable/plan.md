
# Add Restaurant Fallback for Dining Selection

## Problem
When a property has no experiences with `category === 'dining'`, the PDF and delight features fail to show any dining recommendation. The user wants a fallback: if no "dining" category is found, look for experiences with `venue_type === 'restaurant'` and pick the highest-rated one.

## Current State
- **4 locations** use `find(e => e.category === 'dining')` with no fallback:
  1. `generate-itinerary-pdf/index.ts` (line 1014)
  2. `_shared/delight-engine.ts` (lines 187, 206)
  3. `ai-booking-concierge/index.ts` (lines 577, 595)

- **Database categories:** adventure, culture, dining, nature, wellness
- **No explicit rating field** in `local_experiences`, but can use:
  - `display_order` (lower = higher priority)
  - Presence of `why_locals_love_it` (quality indicator)

## Solution
Create a reusable `findDiningExperience()` helper function that:
1. First looks for `category === 'dining'`
2. If not found, falls back to `venue_type === 'restaurant'`
3. When multiple restaurants exist, pick the one with lowest `display_order` (best positioned)

---

## Implementation Details

### 1. Add Helper to `_shared/delight-engine.ts`

Add a new utility function that can be imported by other edge functions:

```typescript
/**
 * Find dining experience with restaurant fallback
 * Priority: dining category > restaurant venue_type (sorted by display_order)
 */
export function findDiningExperience(
  experiences: LocalExperience[] | undefined
): LocalExperience | undefined {
  if (!experiences || experiences.length === 0) return undefined;
  
  // First: look for explicit dining category
  const diningCategory = experiences.find(e => e.category === 'dining');
  if (diningCategory) return diningCategory;
  
  // Fallback: look for restaurant venue_type, pick highest rated (lowest display_order)
  const restaurants = experiences
    .filter(e => e.venue_type === 'restaurant')
    .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
  
  return restaurants[0] || undefined;
}
```

### 2. Update `generate-itinerary-pdf/index.ts`

**Line ~1014** - Replace direct find with helper:

```typescript
// BEFORE:
const diningExp = stay.experiences?.find(e => e.category === 'dining');

// AFTER:
const diningExp = findDiningExperience(stay.experiences);
```

Import the helper at the top:
```typescript
import { ..., findDiningExperience } from "../_shared/delight-engine.ts";
```

### 3. Update `_shared/delight-engine.ts`

**Lines 187, 206** - Use the new helper internally:

```typescript
// BEFORE (line 187):
const dining = experiences?.find((e: LocalExperience) => e.category === 'dining');

// AFTER:
const dining = findDiningExperience(experiences);
```

```typescript
// BEFORE (line 206):
const dining = experiences?.find((e: LocalExperience) => e.category === 'dining');

// AFTER:
const dining = findDiningExperience(experiences);
```

### 4. Update `ai-booking-concierge/index.ts`

**Lines 577, 595** - Use the helper:

```typescript
// BEFORE (line 577):
const dining = experiences?.find((e: any) => e.category === 'dining');

// AFTER:
const dining = findDiningExperience(experiences);
```

```typescript
// BEFORE (line 595):
const dining = experiences?.find((e: any) => e.category === 'dining');

// AFTER:
const dining = findDiningExperience(experiences);
```

Import the helper at the top:
```typescript
import { ..., findDiningExperience } from "../_shared/delight-engine.ts";
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/_shared/delight-engine.ts` | Add `findDiningExperience()` helper, update internal usages (lines 187, 206) |
| `supabase/functions/generate-itinerary-pdf/index.ts` | Import and use helper (line 1014) |
| `supabase/functions/ai-booking-concierge/index.ts` | Import and use helper (lines 577, 595) |

---

## Selection Logic Summary

```text
experiences = [nature, culture, adventure, wellness, restaurant(venue_type)]

Step 1: Look for category === 'dining'
        ├─ Found? → Return it
        └─ Not found? → Continue to Step 2

Step 2: Look for venue_type === 'restaurant'
        ├─ Found multiple? → Sort by display_order, return lowest
        ├─ Found one? → Return it
        └─ None found? → Return undefined (no dining shown)
```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Has `dining` category | Uses dining category (no change) |
| No `dining`, has `restaurant` venue_type | Falls back to restaurant |
| Multiple restaurants | Picks one with lowest `display_order` |
| No `dining` and no `restaurant` | Returns undefined (dining section hidden) |
| Empty experiences array | Returns undefined |
