# Fix Specials & Package Application for Latter Days Checkout

## Problems Found

### 1. Package "Winter Special" has no discount value stored

The package record has `pricingType: "discount"` but no `discountPercent` or `discount_percentage` field. The code falls back to a hardcoded `10%` instead of the intended 20%. This is a data issue — the package was created before the discount input field was added to the editor. THIS IS NOT TRUE: SINCE THE VAULE HAS BEEN ENTERED AND SAVED. CHECK AGAIN

### 2. Only one promotion applies — package blocks special

The code applies packages first (line 1473-1526), then only checks specials `if (!promoApplied)` (line 1530). Since the package matches, the "Early Bird -15%" special is never evaluated. The business intent appears to be: **both** should apply (or the best one, or they stack). THEY STACK

### 3. Label clarity

Package line item shows `📦 Winter Special (-10%)` with a wrong percentage. Special would show as `🏷️ Early Bird (-15%)` if it applied.

## Data State


| Promotion      | Type                | Stored Value                          | Expected | Currently Applied            |
| -------------- | ------------------- | ------------------------------------- | -------- | ---------------------------- |
| Winter Special | Package (amenities) | `pricingType: "discount"`, no % field | -20%     | -10% (correct default)       |
| Early Bird     | Special (DB table)  | `discount_percent: 15`                | -15%     | Skipped (blocked by package) |


## Fix Plan

### Fix 1: Apply both package (The image uploaded is not shown with package inte admin UI and should be used in the chekcout)  AND special (stacking)

**File: `src/pages/Booking.tsx**` (~line 1529)

Remove the `if (!promoApplied)` guard so specials are always checked. When both apply, show both as separate line items. Update `promoApplied` to reflect the combined discount or store both names.

```
Before:  if (!promoApplied) { // Check specials... }
After:   // Always check specials (can stack with packages)
```

Both line items will appear in the cost breakdown:

- `📦 Winter Special (-20%)` 
- `🏷️ Early Bird (-15%)`

The special discount will calculate on the **post-package** subtotal (i.e., 15% off the already-discounted amount), preventing over-discounting.

### Fix 2: Fix default discount percentage fallback

**File: `src/pages/Booking.tsx**` (~line 1504-1505)

Remove the hardcoded `10` fallback. If `pricingType === 'discount'` but no percentage is stored, default to `0` (skip) instead of silently applying 10%.

```
Before:  pkg.discountPercent || (pkg.pricingType === 'discount' ? 10 : 0)
After:   pkg.discountPercent || 0
```

### Fix 3: Prompt owner to set missing discount value

The Latter Days "Winter Special" package needs its `discountPercent` set to `20`. This requires the property owner to edit the package and enter 20 in the discount field — or we can patch it via a targeted amenities update. THIS HAS BEEN DONE AND SAVED.

**Recommended**: Patch the data directly by updating the package in amenities to include `discountPercent: 20` and `discount_percentage: 20`.

### Fix 4: Update promoApplied to support multiple promotions

Adjust the `appliedPromotion` state to hold an array or combine names when both a package and special are active, so the checkout summary accurately reflects what was applied.

## Files Changed


| File                        | Change                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| `src/pages/Booking.tsx`     | Remove `!promoApplied` guard; fix 10% fallback; support stacked promos |
| Property data (Latter Days) | Patch package `discountPercent: 20` via amenities update               |
