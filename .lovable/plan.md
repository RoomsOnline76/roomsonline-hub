

# Fix: Onboarding Wizard Data Not Persisting to Property Form

## Root Cause

The onboarding wizard and PropertyForm use **different data structures** for the same fields. The wizard writes flat keys to amenities, but the PropertyForm reads from nested objects — and when the PropertyForm saves, it **overwrites the entire amenities JSONB**, erasing any wizard-only keys.

### Data Structure Mismatch

| Data | Wizard writes to | PropertyForm reads from |
|------|------------------|------------------------|
| Check-in time | `amenities.check_in_from` | `amenities.house_rules.check_in_from` |
| Check-out time | `amenities.check_out_to` | `amenities.house_rules.check_out_to` |
| Bank name | `amenities.bank_name` | `amenities.banking.bank_name` |
| Account number | `amenities.account_number` | `amenities.banking.account_number` |
| Pets allowed | `amenities.pets_allowed` | `amenities.house_rules.pets_allowed` |
| Pets policy | `amenities.pets_policy` | `amenities.house_rules.pets_policy` |
| Children policy | `amenities.children_policy` | `amenities.house_rules.children_policy` |
| Min check-in age | `amenities.min_check_in_age` | `amenities.house_rules.min_check_in_age` |
| House rules text | `amenities.house_rules` (string) | `amenities.house_rules` (object) |
| Payment policy | `amenities.payment_policy` | `amenities.house_rules` area |
| Cancellation policy | `amenities.cancellation_policy` | `amenities.cancellation_policies` |
| Key collection | `amenities.key_collection_procedure` | Not read at all |
| Reception hours | `amenities.reception_hours` | Not read at all |

### Working fields (same path in both)
- `amenities.room_types` ✓
- `amenities.facilities` ✓ 
- `amenities.accommodation_label` ✓
- `amenities.meal_plan` → PropertyForm uses `amenities.meal_types` (minor mismatch)
- `properties.address`, `city`, `country` ✓
- `properties.description`, `short_description` ✓
- `properties.images` ✓

### Accommodation label not carrying to Rooms tab
The Rooms tab in PropertyForm uses hardcoded "Room Type" strings instead of the dynamic `accommodationLabel` state variable that's set from `amenities.accommodation_label`.

## Fix Strategy

**Align the wizard to write in the PropertyForm's nested structure** rather than changing the PropertyForm. The PropertyForm's structure is established and used across many places.

### File: `src/components/onboarding/steps/StepPoliciesPricing.tsx`

Change all `updateField` calls to write to the nested paths the PropertyForm expects:

- `amenities.check_in_from` → `amenities.house_rules.check_in_from` (but this requires nested object support)

Since `updateField` only supports one level of nesting (`amenities.X`), the fix needs to:
1. Read the current `house_rules` object from amenities
2. Merge the new field into it
3. Write the whole `house_rules` object back

Same approach for `banking` fields.

**Specific changes in StepPoliciesPricing.tsx:**
- Create helper `updateHouseRule(field, value)` that reads `getAmenityValue("house_rules", {})`, merges `{[field]: value}`, writes `updateField("amenities.house_rules", merged)`
- Create helper `updateBanking(field, value)` that reads `getAmenityValue("banking", {})`, merges, writes `updateField("amenities.banking", merged)`
- Replace all 20+ direct `updateField("amenities.check_in_from", ...)` calls with `updateHouseRule("check_in_from", ...)`
- Replace all banking field calls with `updateBanking("bank_name", ...)`
- Reading: Change `getAmenityValue("check_in_from", "")` → read from `getAmenityValue("house_rules", {}).check_in_from`

### File: `src/components/onboarding/steps/StepGuestExperience.tsx`
- `amenities.meal_plan` → `amenities.meal_types` (to match PropertyForm's `selectedMealTypes`)

### File: `src/components/onboarding/steps/StepLocation.tsx`  
- Already writes to `amenities.property_info` correctly ✓
- No changes needed

### File: `src/pages/PropertyForm.tsx`
- In the Rooms tab section, replace hardcoded "Room Type" labels with `getAccommodationLabel({...}).singular + " Type"` using the already-loaded `accommodationLabel` state

### File: `src/hooks/usePropertyOnboarding.tsx`
- Update `calculateScores` to also check nested paths when scoring (it already checks some nested paths via `getNestedValue`)

## Summary of Changes

| File | What changes |
|------|-------------|
| `StepPoliciesPricing.tsx` | Add `updateHouseRule`/`updateBanking` helpers; rewire all 20+ field read/write calls to use nested structure |
| `StepGuestExperience.tsx` | Change `amenities.meal_plan` → `amenities.meal_types` |
| `PropertyForm.tsx` | Replace hardcoded "Room Type" labels in Rooms tab with dynamic accommodation label |

## Expected Outcome
- All wizard data persists correctly and shows up in PropertyForm tabs
- Accommodation type setting (e.g. "Tent") carries through to Rooms tab labels
- House rules, banking, check-in times, policies all survive the wizard→PropertyForm transition
- Images and rooms already work (confirmed in DB)

