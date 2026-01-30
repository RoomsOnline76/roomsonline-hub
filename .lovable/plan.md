

# Display Payment Status in Property Pulse Dashboard

## Problem

The "Recent" bookings section in the Property Pulse dashboard currently only displays `booking.status` (pending, confirmed, cancelled). When a guest completes payment through PayFast, the `payment_status` field is updated to "paid", but this is not reflected in the dashboard. Paid bookings should display differently from unpaid/pending ones.

## Current State

From the database query:
- Most bookings have `status: pending` and `payment_status: unpaid`
- A few have `payment_status: pending` (payment in progress)
- Once PayFast ITN confirms payment, `payment_status` will be set to "paid"

Currently the badge only shows:
- Green: "confirmed"
- Yellow: "pending"
- Red: "cancelled"

## Solution

Update the Recent bookings display to show a **combined status** that prioritizes payment status for clarity:

| Status Logic | Display | Color |
|-------------|---------|-------|
| `payment_status === "paid"` | **paid** | Green (success) |
| `status === "confirmed"` | confirmed | Green |
| `payment_status === "pending"` | paying... | Blue (info) |
| `status === "pending"` | pending | Yellow (warning) |
| `status === "cancelled"` | cancelled | Red |
| `status === "failed"` | failed | Red |

This ensures paid bookings are immediately visible as such, regardless of whether the booking status has been updated to "confirmed".

---

## Implementation

### File: `src/pages/Dashboard.tsx`

#### Change 1: Create a status display helper function

Add a helper function around line 500 (after other useMemo hooks) to determine the display status:

```typescript
// Helper to get display status prioritizing payment info
const getBookingDisplayStatus = (booking: any) => {
  // Payment status takes priority
  if (booking.payment_status === "paid") {
    return { label: "paid", variant: "success" };
  }
  if (booking.payment_status === "pending") {
    return { label: "paying...", variant: "info" };
  }
  // Fall back to booking status
  if (booking.status === "confirmed") {
    return { label: "confirmed", variant: "success" };
  }
  if (booking.status === "cancelled") {
    return { label: "cancelled", variant: "error" };
  }
  if (booking.status === "failed") {
    return { label: "failed", variant: "error" };
  }
  return { label: "pending", variant: "warning" };
};
```

#### Change 2: Update the Recent bookings badge rendering

Update lines ~1473-1480 to use the new helper:

```tsx
{(() => {
  const displayStatus = getBookingDisplayStatus(booking);
  return (
    <span className={cn(
      "text-[10px] px-1 rounded",
      displayStatus.variant === "success" && "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
      displayStatus.variant === "info" && "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
      displayStatus.variant === "warning" && "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
      displayStatus.variant === "error" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
    )}>
      {displayStatus.label}
    </span>
  );
})()}
```

---

## Visual Reference

**Before:**
```
Dawie TEST [SANDBOX] Victorian House   R3,150   pending
Dawie TEST [SANDBOX] Victorian House   R4,050   pending
```

**After (with paid booking):**
```
Dawie TEST [SANDBOX] Victorian House   R3,150   paid      (green)
Dawie TEST [SANDBOX] Victorian House   R4,050   paying... (blue)
Dawie TEST [SANDBOX] Victorian House   R4,050   pending   (yellow)
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Add `getBookingDisplayStatus` helper; update badge rendering in Recent bookings section |

