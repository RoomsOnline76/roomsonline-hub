

# Phase 1: Dynamic Policy Engine

## Overview

Add a cancellation policy management UI in PropertyForm (Rates tab) and display the evaluated policy during the booking checkout flow. The `experience-engine` edge function already handles `cancellation_policy` routing — this phase populates `rolos_policies` via admin UI and consumes the policy in the guest-facing booking page.

## 1. Policy Management UI — PropertyForm Rates Tab

Add a **"Policies"** sub-tab to the existing Rates tab (alongside Rate Types, Seasons, Rate Breakdown, Charges, Billing, Overview).

**File**: `src/pages/PropertyForm.tsx` (line ~7992)

Add `<TabsTrigger value="policies">Policies</TabsTrigger>` to the Rates sub-tabs.

**New component**: `src/components/property/PoliciesTab.tsx`

Renders a card-based form for each policy type (`cancellation`, `deposit`, `modification`, `no_show`). For cancellation specifically:

- **Policy mode selector**: "Standard" (static rules) or "Dynamic" (AI-assisted with live PMS factors)
- **Standard fields**:
  - `days_before` — free cancellation window (number input)
  - `forfeit_percent` — penalty percentage if cancelled within window (slider 0–100%)
  - `date_range_start` / `date_range_end` — optional peak season overrides
  - `non_refundable` — boolean toggle for non-refundable rates
- **Dynamic fields** (shown when mode = dynamic):
  - `dynamic_factors` — multi-select checkboxes: `occupancy`, `competitor_pricing`, `season`
  - `ai_prompt_override` — optional textarea for custom AI evaluation prompt
- **Preview card** — renders human-readable policy text from the rule JSONB (e.g., "Free cancellation up to 14 days before check-in. After that, 50% of the booking total is charged.")

Reads/writes to `rolos_policies` table with `policy_type = 'cancellation'`.

**New hook**: `src/hooks/usePolicies.ts`
- `usePolicies(propertyId)` — fetches all policy rows for a property
- `upsertPolicy(propertyId, policyType, rule)` — upserts a single policy row
- Returns loading/error states

## 2. Display Policy in Booking Checkout

**File**: `src/pages/Booking.tsx`

Between Step 2 (Your Details) and Step 3 (Payment Summary), add a **Cancellation Policy** info card:

- On mount (when property is loaded), call the `experience-engine` edge function with `experience_type: 'cancellation_policy'` to get the evaluated policy
- If no policy returned (experience engine disabled or no policy configured), fall back to the existing `amenities.cancellation_policy` free-text field from the property record
- Display a styled info card showing:
  - Policy summary text (generated from rule JSONB)
  - "Free cancellation until X" with the calculated date based on check-in minus `days_before`
  - Forfeit amount if applicable (calculated from booking total × forfeit_percent)
  - If dynamic: "Policy may vary based on occupancy" disclaimer

**New utility**: `src/lib/policyFormatter.ts`
- `formatCancellationPolicy(rule, checkInDate, totalPrice)` — converts rule JSONB into human-readable text + calculates deadline date and forfeit amount
- Returns `{ summaryText, deadlineDate, forfeitAmount, isNonRefundable }`

## 3. Policy Enforcement in CancelBookingModal

**File**: `src/components/booking/CancelBookingModal.tsx`

Enhance the modal to:
- Accept an optional `cancellationPolicy` prop (the evaluated rule)
- If provided, show the forfeit amount and deadline prominently
- Display "Within free cancellation period" (green) or "Cancellation fee applies: R{amount}" (amber) based on current date vs deadline
- The actual financial enforcement (refund calculation) happens server-side in the cancel-booking edge function — this is display-only

## 4. Edge Function Enhancement

**File**: `supabase/functions/experience-engine/index.ts`

Minor enhancement to the existing `cancellation_policy` handler:
- Accept optional `check_in_date` and `total_price` in payload
- Return pre-calculated `deadline_date` and `forfeit_amount` alongside the raw rule
- This avoids duplicating calculation logic on the client

## 5. Showcase Page — Policy Display

**File**: `src/pages/PropertyShowcase.tsx`

In the property info section (near house rules / check-in info), add a small "Cancellation Policy" badge/section:
- Fetch from experience-engine if enabled, else show amenities.cancellation_policy text
- Simple one-liner like "Free cancellation up to 14 days before arrival" with an expand for full details

## Technical Details

### `rolos_policies` rule JSONB schema (cancellation)

```json
{
  "mode": "standard",
  "days_before": 14,
  "forfeit_percent": 50,
  "non_refundable": false,
  "date_ranges": [
    { "start": "2026-12-15", "end": "2027-01-05", "days_before": 30, "forfeit_percent": 100 }
  ],
  "dynamic_factors": [],
  "ai_prompt_override": null
}
```

### Policy evaluation logic (in experience-engine)

```typescript
function evaluatePolicy(rule, checkInDate, totalPrice) {
  const now = new Date();
  const checkIn = new Date(checkInDate);
  const daysUntil = differenceInDays(checkIn, now);
  
  // Check peak season overrides first
  const override = rule.date_ranges?.find(r => checkIn >= new Date(r.start) && checkIn <= new Date(r.end));
  const effectiveRule = override || rule;
  
  const isFree = daysUntil >= effectiveRule.days_before;
  const forfeitAmount = isFree ? 0 : (totalPrice * effectiveRule.forfeit_percent / 100);
  
  return { isFree, forfeitAmount, deadlineDays: effectiveRule.days_before, forfeitPercent: effectiveRule.forfeit_percent };
}
```

## Files

| Action | File |
|--------|------|
| Create | `src/components/property/PoliciesTab.tsx` — policy management form |
| Create | `src/hooks/usePolicies.ts` — CRUD hook for rolos_policies |
| Create | `src/lib/policyFormatter.ts` — rule-to-text utility |
| Modify | `src/pages/PropertyForm.tsx` — add Policies sub-tab to Rates |
| Modify | `src/pages/Booking.tsx` — display cancellation policy card in checkout |
| Modify | `src/components/booking/CancelBookingModal.tsx` — show forfeit/deadline info |
| Modify | `src/pages/PropertyShowcase.tsx` — policy summary badge |
| Modify | `supabase/functions/experience-engine/index.ts` — add evaluation logic with dates/amounts |

No database migration needed — `rolos_policies` table already exists from Phase 0.

