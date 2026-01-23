
# Property Onboarding Wizard Enhancement Plan

## Executive Summary

This plan extends the existing 9-step Property Onboarding Wizard with additional commercial, operational, and compliance fields to reduce admin follow-up and ensure properties are listing-ready after onboarding.

---

## Current State Analysis

### Existing Wizard Structure (9 Steps)
1. **Property Identity** - Name, type, offerings, business details
2. **Contact & Team** - Main contact, GM, reservationist
3. **Location** - Address, coordinates, surroundings
4. **Policies & Pricing** - Check-in/out, guest policies, banking, terms
5. **Guest Experience** - Description, meal plans
6. **Facilities** - Amenity checkboxes
7. **Rooms** - Basic room type info
8. **Media & Documents** - Images and document uploads
9. **Review & Submit** - Score summary and submission

### Current Data Storage
- Direct columns: `name`, `property_type`, `description`, `address`, `city`, `country`, `latitude`, `longitude`, `images`
- JSONB `amenities` column: All other fields stored as key-value pairs

---

## Implementation Overview

### New Database Fields Required

**Direct columns on `properties` table (via migration):**
- `short_description TEXT` - Marketing summary (~300 chars)

**New fields in `amenities` JSONB:**
- `unique_selling_points TEXT` - What makes this property special
- `hero_video_url TEXT` - Optional video URL
- `bank_confirmation_letter_url TEXT` - Bank letter upload
- `check_in_from TEXT` - Check-in start time
- `check_in_to TEXT` - Check-in end time
- `check_out_from TEXT` - Check-out start time
- `check_out_to TEXT` - Check-out end time
- `key_collection_procedure TEXT` - Key collection instructions
- `reception_hours TEXT` - Reception operating hours
- `after_hours_contact TEXT` - Emergency contact
- `late_check_in_procedure TEXT` - Late arrival procedure
- `no_show_policy TEXT` - No-show handling
- `children_policy TEXT` (existing but ensure used)
- `house_rules TEXT` (existing but ensure used)
- `onboarding_meta JSONB` - Tracking metadata

**Extended `room_types[]` structure:**
```typescript
{
  name: string;
  units: number;          // NEW
  max_guests: number;
  base_rate: number;
  rate_unit: string;      // NEW: "per_night" | "per_stay"
  description: string;
  images?: OnboardingImage[]; // NEW
}
```

---

## Step-by-Step Changes

### Step 5: Guest Experience (ENHANCED)

**Current fields:**
- Property Description (full)
- Meal Plans

**New fields to add:**
- Short Description (marketing summary, max 300 chars)
- "What Makes This Property Special" (unique selling points)

**File:** `src/components/onboarding/steps/StepGuestExperience.tsx`

**Changes:**
1. Add short description textarea with character counter (300 limit)
2. Add unique selling points textarea
3. Store: `properties.short_description` (direct column) and `amenities.unique_selling_points`

---

### Step 4: Policies & Pricing (ENHANCED)

**Current fields:**
- Check-in/out times (single time each)
- Guest policies
- Banking details
- Terms

**New fields to add in "Check-in & Check-out" section:**
- Check-in From / To (time range)
- Check-out From / To (time range)
- Key Collection Procedure (textarea)
- Reception Operating Hours
- Late Check-in Procedure
- On-site Contact After Hours

**New field in "Terms & Policies" section:**
- No-Show Policy (textarea)
- House Rules / T&Cs (textarea)
- Child Policy with age rules

**New option in "Banking Details" section:**
- Bank Confirmation Letter upload (PDF)
- Fallback manual entry if no letter

**File:** `src/components/onboarding/steps/StepPoliciesPricing.tsx`

**Changes:**
1. Expand check-in/out to be time ranges (from/to)
2. Add operational procedure fields
3. Add bank confirmation letter upload
4. Add no-show policy field
5. Add house rules textarea
6. Enhance children policy field

---

### Step 7: Rooms (ENHANCED)

**Current fields per room:**
- Room name
- Max guests
- Base rate

**New fields to add:**
- Number of units of this type
- Rate unit (per night / per stay)
- Room description

**File:** `src/components/onboarding/steps/StepRoomsOverview.tsx`

**Changes:**
1. Add "units" number input
2. Add rate_unit dropdown (per night / per stay)
3. Add description textarea
4. Update OnboardingRoomType interface

---

### Step 8: Media & Documents (ENHANCED)

**Current functionality:**
- Property image upload
- Document upload (rate sheet, etc.)

**New requirements:**
- Enforce minimum 3 images, max 5
- 1 must be marked as HERO
- Optional hero video URL
- Room type images (min 1 per room, max 5, 1 favourite)
- Bank confirmation letter in documents

**File:** `src/components/onboarding/steps/StepMediaDocuments.tsx`

**Changes:**
1. Add image count validation warning (min 3, max 5)
2. Add hero video URL input
3. Add room-level image section
4. Add validation badges/warnings
5. Add "bank_confirmation" document type

---

### Scoring System Enhancement

**File:** `src/hooks/usePropertyOnboarding.tsx`

**Current scoring:**
- Binary completion checks
- Section weights: property_identity (20%), contact (5%), location (15%), policies (15%), experience (10%), facilities (10%), rooms (10%), media (15%)

**Enhanced scoring:**
1. **Property-level images**: Penalize if < 3 images or no hero
2. **Room images**: Penalize if rooms have no images
3. **Description fields**: Short description adds points
4. **Operational procedures**: Check-in procedures add points
5. **Store in `amenities.onboarding_meta`:**
   ```json
   {
     "completion_percent": 85,
     "score": 85,
     "last_updated_at": "ISO timestamp",
     "submitted_at": "ISO timestamp",
     "readiness_band": "Nearly Ready"
   }
   ```

**Updated Score Bands:**
- 90-100% = "Ready to List"
- 70-89% = "Nearly Ready"
- <70% = "Needs Attention"

---

## File Changes Summary

### Files to Modify

| File | Changes |
|------|---------|
| `src/config/onboardingFieldSchema.ts` | Add new interfaces, update OnboardingRoomType, add RATE_UNIT_OPTIONS |
| `src/components/onboarding/steps/types.ts` | Extend PropertyData interface |
| `src/components/onboarding/steps/StepGuestExperience.tsx` | Add short description and USP fields |
| `src/components/onboarding/steps/StepPoliciesPricing.tsx` | Add check-in ranges, procedures, no-show policy, bank letter |
| `src/components/onboarding/steps/StepRoomsOverview.tsx` | Add units, rate_unit, description, room images |
| `src/components/onboarding/steps/StepMediaDocuments.tsx` | Add validation, hero video, room images section |
| `src/components/onboarding/steps/StepReviewSubmit.tsx` | Update scoring to include new fields |
| `src/hooks/usePropertyOnboarding.tsx` | Update scoring algorithm, add new field handling |

### Database Migration

```sql
-- Add short_description column to properties table
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS short_description TEXT;
```

---

## Technical Implementation Details

### 1. Update OnboardingRoomType Interface

```typescript
// src/config/onboardingFieldSchema.ts
export interface OnboardingRoomType {
  name: string;
  units?: number;                    // NEW
  max_guests: number;
  base_rate?: number;
  rate_unit?: 'per_night' | 'per_stay'; // NEW
  description?: string;
  images?: OnboardingImage[];        // NEW
}

export const RATE_UNIT_OPTIONS = [
  { value: 'per_night', label: 'Per Night' },
  { value: 'per_stay', label: 'Per Stay' }
] as const;
```

### 2. Extend PropertyData Interface

```typescript
// src/components/onboarding/steps/types.ts
export interface PropertyData {
  // ... existing fields
  short_description: string | null;  // NEW direct column
}
```

### 3. Image Validation Logic

```typescript
// src/components/onboarding/steps/StepMediaDocuments.tsx
const getImageValidationStatus = () => {
  const heroExists = images.some(img => img.type === 'hero');
  const imageCount = images.length;
  
  return {
    hasMinimum: imageCount >= 3,
    hasMaximum: imageCount <= 5,
    hasHero: heroExists,
    isValid: imageCount >= 3 && imageCount <= 5 && heroExists
  };
};
```

### 4. Enhanced Scoring Algorithm

```typescript
// src/hooks/usePropertyOnboarding.tsx
const calculateScores = (data: PropertyData) => {
  // ... existing calculations
  
  // NEW: Image completeness (within media_documents weight)
  const images = (data.images || []) as OnboardingImage[];
  const hasHero = images.some(img => img.type === 'hero');
  const hasMinImages = images.length >= 3;
  const imageScore = hasHero && hasMinImages ? 1 : 
                     hasMinImages ? 0.7 : 
                     images.length / 3;
  
  // NEW: Description completeness
  const hasShortDesc = !!data.short_description;
  const hasUSP = !!amenities.unique_selling_points;
  
  // NEW: Procedures completeness
  const procedureFields = [
    amenities.key_collection_procedure,
    amenities.reception_hours,
    amenities.late_check_in_procedure
  ].filter(Boolean).length;
  
  // ... weighted scoring
};
```

---

## Wizard UX Enhancements

### Validation Warnings (Non-Blocking)

- Yellow warning badges for incomplete sections
- Submission always allowed (partial submission supported)
- Score reflects actual completion

### PMS Warning Display

All PMS-linked fields show amber warning: "This field may be overwritten when PMS syncs"

### Save & Resume

Already implemented via `usePropertyOnboarding` hook with debounced auto-save (2 seconds).

---

## PDF & Email Output

**Note:** This requirement is already mentioned as "unchanged but confirmed". The existing `StepReviewSubmit` handles submission. PDF generation and email functionality are assumed to be handled by existing edge functions (`send-onboarding-email`, etc.).

No changes needed for this deliverable unless PDF generation is broken.

---

## Testing Verification

After implementation:
1. Create new property and complete wizard
2. Verify all new fields save to `amenities` JSONB
3. Verify `short_description` saves to direct column
4. Verify image validation shows warnings but doesn't block submission
5. Verify room types include new fields (units, rate_unit, description)
6. Verify bank confirmation letter upload works
7. Verify scoring reflects new fields
8. Verify PMS warning displays on sensitive fields
9. Verify save-and-resume works across all new fields

---

## Migration Checklist

1. Create database migration for `short_description` column
2. Update TypeScript interfaces
3. Implement Guest Experience enhancements
4. Implement Policies & Pricing enhancements
5. Implement Rooms enhancements
6. Implement Media & Documents enhancements
7. Update scoring algorithm
8. Update Review & Submit to reflect new sections
9. Test end-to-end flow
