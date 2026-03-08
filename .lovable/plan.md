

# Plan: Rate Pricing Model Types for ROL'OS PMS

## Problem

The Dungeon rate is "per person" but the system treats all rates as "per room" (base_rate × nights). There is no way to define HOW a rate should be calculated. The hospitality industry uses several pricing models that fundamentally change billing math.

## Design

### Pricing Models to Support

| Model | Calculation | Example |
|-------|------------|---------|
| `per_room` | base_rate × nights | R2,650/night for whole house |
| `per_person` | base_rate × guests × nights | R650/person/night |
| `per_person_sharing` | base_rate × nights (2 guests included), extra guests at extra rate | R1,200/night sharing, +R400/extra |
| `per_unit` | base_rate × units × nights | R500/unit/night |

### Implementation

#### 1. Database Migration
Add `pricing_model` column to `rolos_rate_plans`:
```sql
ALTER TABLE public.rolos_rate_plans 
  ADD COLUMN pricing_model text NOT NULL DEFAULT 'per_room';
```
No enum needed — text with application-level validation keeps it flexible.

#### 2. PMSRatePlans.tsx — Add Pricing Model Dropdown
- Add `pricing_model` to the `RatePlan` interface and form state
- Add a Select dropdown in the create/edit dialog with options: Per Room, Per Person, Per Person Sharing, Per Unit
- Display the pricing model as a badge on rate plan cards
- Sync `pricing_model` to `amenities.pms_rate_types` as `pricingModel`
- Read `pricingModel` from amenities during auto-sync

#### 3. ManualBookingDialog.tsx — Dynamic Guest Count Pricing
- Fetch `pricing_model` alongside rate plan data
- When a rate plan with `per_person` model is selected, highlight that total = rate × guests × nights
- Update `autoPrice` calculation:
  - `per_room`: base_rate × nights (current behavior)
  - `per_person`: base_rate × total_guests × nights
  - `per_person_sharing`: base_rate × nights + extra_person_rate × extra_guests × nights
  - `per_unit`: base_rate × units × nights
- Show a clear breakdown label: "R650 × 3 guests × 2 nights = R3,900"

#### 4. PMSDashboard.tsx — Calendar Rate Display
- Update `getRateForDate` to factor in pricing model when displaying rates
- For `per_person` rates, show "R650/pp" instead of just "R650"
- Append pricing model suffix to rate display

#### 5. PropertyForm.tsx — Sync pricing_model
- When syncing rate types to `rolos_rate_plans`, include `pricingModel` from amenities data
- When writing back from PMS, include `pricing_model` in amenities

#### 6. Booking.tsx — ROL'OS Per-Person Calculation
- When building availability data for wizard/manual properties, set `price_type` based on the rate plan's `pricing_model`:
  - `per_room` → `'PER ROOM'`
  - `per_person` → `'PER PERSON'` (triggers existing per-person calculation logic)
- The existing `calculateCost` already handles per-person math with adult/teen/child amounts — wire the ROL'OS rate into this path

## Files Modified

| File | Change |
|------|--------|
| **DB Migration** | Add `pricing_model` text column to `rolos_rate_plans` |
| `src/pages/pms/PMSRatePlans.tsx` | Pricing model dropdown in dialog, badge on cards, sync to/from amenities |
| `src/components/pms/ManualBookingDialog.tsx` | Model-aware auto price calculation with breakdown display |
| `src/pages/pms/PMSDashboard.tsx` | Show "/pp" suffix for per-person rates in calendar |
| `src/pages/PropertyForm.tsx` | Include `pricingModel` in rate plan sync |
| `src/pages/Booking.tsx` | Map `pricing_model` to `price_type` for ROL'OS properties |

