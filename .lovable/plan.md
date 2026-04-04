

# Age-Based Specials with ID Verification

## Overview

Add an optional age-restriction toggle to specials. When enabled, the property owner sets a minimum age (e.g., 60 for pensioners). At checkout, if the booking matches an age-restricted special, the guest must upload a photo of their ID/driver's license. An AI edge function extracts the date of birth and confirms eligibility before the discount is applied.

## Database Changes

**Migration: Add age columns to `property_specials`**

```sql
ALTER TABLE public.property_specials
  ADD COLUMN age_restricted boolean DEFAULT false,
  ADD COLUMN min_age integer,
  ADD COLUMN max_age integer,
  ADD COLUMN age_label text;  -- e.g. "Pensioner", "Senior", "Youth"
```

No new tables needed. Verification documents are uploaded to a new storage bucket and the AI result is transient (not persisted beyond the booking record).

**Storage bucket for ID verification uploads**

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('id-verifications', 'id-verifications', false);
```

With RLS policy allowing anon inserts (checkout is unauthenticated) scoped to a generated path, and service_role reads for the edge function.

## Edge Function: `verify-age-document`

New edge function that:
1. Accepts a storage path to the uploaded ID image
2. Downloads it via service_role
3. Sends to Lovable AI gateway (Gemini Flash) with a prompt: "Extract the date of birth from this ID document. Return JSON: `{ dob: 'YYYY-MM-DD', confidence: 0-1 }`"
4. Calculates age from DOB, compares against `min_age` / `max_age`
5. Returns `{ eligible: boolean, extractedAge: number, dob: string }`

## Admin UI Changes

**File: `src/components/property/AccommodationSpecialsTab.tsx`**

Add after the existing Active/Public switches:
- **Age Restricted** toggle (Switch)
- When enabled, show:
  - **Age Label** text input (e.g. "Pensioner Discount")
  - **Min Age** number input
  - **Max Age** number input (optional)
- Save these fields alongside existing special data

Update the `Special` interface, `emptySpecial`, and `save()` to include the four new fields.

## Checkout Changes

**File: `src/pages/Booking.tsx`**

In the specials auto-apply logic (~line 1538):
- If a matching special has `age_restricted = true`, do NOT auto-apply it as a line item immediately
- Instead, store it in a new state `pendingAgeSpecial`
- Render a conditional UI section (only when `pendingAgeSpecial` is set):
  - Banner: "🎂 {age_label} discount available — upload your ID to claim"
  - File upload input (image capture or file picker)
  - On upload: push file to `id-verifications` bucket, call `verify-age-document` edge function
  - On success (eligible): apply the discount line item, show confirmation
  - On failure: show "Sorry, age requirement not met" message, remove pending state

**New component: `src/components/booking/AgeVerificationUpload.tsx`**

Props: `special` (name, min_age, max_age, label), `onVerified(eligible: boolean)`, `propertyId`

- File input with camera/gallery options
- Upload to storage bucket under path `{propertyId}/{timestamp}.jpg`
- Call edge function, show loading spinner
- Display result (checkmark or X)

## Flow Summary

```text
Property Owner (Edit Specials)
  └─ Creates "Pensioner 20% off", toggles Age Restricted ON, sets min_age=60

Guest (Checkout)
  └─ Booking dates match special's validity
  └─ System detects age_restricted=true
  └─ Shows upload prompt: "Senior discount available — upload ID"
  └─ Guest uploads ID photo
  └─ AI extracts DOB → calculates age → returns eligible=true
  └─ Discount auto-applied to billing
```

## Files to Create/Modify

| File | Change |
|------|--------|
| Migration SQL | Add 4 columns to `property_specials` |
| Migration SQL | Create `id-verifications` bucket + policies |
| `supabase/functions/verify-age-document/index.ts` | **Create** — AI-powered age extraction |
| `src/components/property/AccommodationSpecialsTab.tsx` | Add age restriction toggle + fields |
| `src/components/booking/AgeVerificationUpload.tsx` | **Create** — upload + verify component |
| `src/pages/Booking.tsx` | Pending age special state, conditional render of upload UI |

