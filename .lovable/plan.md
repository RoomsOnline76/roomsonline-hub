
# Fix Contract Signing + Color Update + Email Update

## Issue Summary

There are three tasks to complete:

1. **Contract Signing Failure** - The error shows: `null value in column "price_per_night" of relation "properties" violates not-null constraint`. The `process-signature` function is missing required database fields when creating new properties.

2. **Color Replacement** - Replace wine maroon (#722F37) with ROL pink (#e91e8c) throughout the codebase.

3. **Email Update** - Replace all instances of `info@roomsonline.co.za` with `sleepinafrica@roomsonline.co.za`.

---

## Task 1: Fix Contract Signing

### Root Cause
The `process-signature` edge function creates properties but is missing the required `price_per_night` field (and potentially other required fields like `bedrooms` and `bathrooms`).

### Solution
Update `supabase/functions/process-signature/index.ts` to include all required fields when creating properties:

```typescript
// Add these required fields to the property insert:
price_per_night: 0,  // Default to 0, owner will set later
bedrooms: 1,         // Already included
bathrooms: 1,        // Already included  
```

The current code is missing `price_per_night: 0` in the insert statement.

---

## Task 2: Replace Wine Maroon with ROL Pink

### Files to Update

| File | Location | Change |
|------|----------|--------|
| `supabase/functions/send-survey-report/index.ts` | Lines 127, 153, 174, 190, 194 | Replace `#722F37` with `#e91e8c` |

### What Changes

**Before (Wine Maroon):**
```css
background: linear-gradient(135deg, #722F37 0%, #8B3A42 100%);
color: #722F37;
border-left: 3px solid #722F37;
```

**After (ROL Pink):**
```css
background: linear-gradient(135deg, #e91e8c 0%, #f0469d 100%);
color: #e91e8c;
border-left: 3px solid #e91e8c;
```

---

## Task 3: Update Email Address

### Files to Update (20+ files)

| File | Changes |
|------|---------|
| `supabase/functions/process-signature/index.ts` | Lines 309, 331-337, 372 |
| `supabase/functions/send-owner-contract/index.ts` | Line 226 |
| `supabase/functions/send-onboarding-email/index.ts` | Line 128 |
| `supabase/functions/send-booking-email/index.ts` | Line 426 |
| `supabase/functions/send-contract/index.ts` | Line 193 |
| `supabase/functions/email-contract-copy/index.ts` | Line 179 |
| `supabase/functions/send-itinerary-email/index.ts` | Line 222 |
| `supabase/functions/send-access-request/index.ts` | Line 150 |
| `supabase/functions/send-contact-email/index.ts` | Line 198 |
| `supabase/functions/send-survey-report/index.ts` | Line 524 |
| `supabase/functions/help-assistant/index.ts` | Line 14 |
| `src/pages/ContractSign.tsx` | Lines 609, 641, 662, 768 |
| `src/pages/PropertyOnboarding.tsx` | Lines 61, 71, 192, 242 |
| `src/pages/PMSComparison.tsx` | Line 439 |
| `src/pages/ContactUs.tsx` | Line 117 |
| `src/pages/AdminKeys.tsx` | Line 317 |
| `src/lib/contractAgreementText.ts` | Line 93 |

### What Changes
- All `info@roomsonline.co.za` → `sleepinafrica@roomsonline.co.za`
- All `mailto:info@roomsonline.co.za` → `mailto:sleepinafrica@roomsonline.co.za`
- Admin notification emails remain unchanged (carike@ stays)

---

## Implementation Order

1. **Fix process-signature first** (this is blocking contract signing)
2. **Update email addresses** across all files
3. **Update color** in send-survey-report

---

## Expected Results

After implementation:
- Contract signing will succeed (no more price_per_night error)
- All contact emails will show `sleepinafrica@roomsonline.co.za`
- Survey reports will use ROL pink branding instead of wine maroon
