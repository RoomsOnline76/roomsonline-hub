

# Fix Hostfully Booking Availability + Add Date Re-selection UX

## Problem Summary

Two issues need to be addressed:

### Issue 1: False "Unavailable" Errors (Root Cause)
The `push-booking` edge function is using **Hostfully v2 API** endpoints, which return 404 "Endpoint not found" errors. These 404s are incorrectly interpreted as `AVAILABILITY_CHANGED` errors, making all Hostfully bookings appear unavailable.

**Evidence from logs:**
```
ERROR Hostfully availability check failed: 404 {"apiErrorMessage":"Endpoint not found"}
Checking live availability: https://sandbox.hostfully.com/v2/property-calendar/...
```

**The problem:**
- `push-booking/index.ts` line 1171-1173 uses v2: `https://sandbox.hostfully.com/v2`
- `hostfully-api/index.ts` line 27-31 correctly uses v3: `https://sandbox.hostfully.com/api/v3`

### Issue 2: Poor UX on Genuine Unavailability
Even when dates are genuinely unavailable, users see only a toast error with no action path. The user should be offered a date picker to select new dates.

---

## Solution Overview

| File | Changes |
|------|---------|
| `supabase/functions/push-booking/index.ts` | Fix Hostfully base URL to use v3 API |
| `src/pages/Booking.tsx` | Add date re-selection dialog when availability check fails |

---

## Technical Changes

### Part 1: Fix Hostfully API Version in push-booking

**Current Code (lines 1171-1173):**
```typescript
const baseUrl = environment === 'production'
  ? 'https://api.hostfully.com/v2'
  : 'https://sandbox.hostfully.com/v2';
```

**Fixed Code:**
```typescript
const baseUrl = environment === 'production'
  ? 'https://api.hostfully.com/api/v3'
  : 'https://sandbox.hostfully.com/api/v3';
```

This aligns with the correct v3 URLs already used in `hostfully-api/index.ts`.

---

### Part 2: Add Date Re-selection UX on Availability Error

When an `AVAILABILITY_CHANGED` error occurs, instead of just showing a toast, display a modal dialog that:
1. Explains the dates are no longer available
2. Shows a date picker (Calendar component) for selecting new dates
3. Updates the booking form with new dates and recalculates cost

**Implementation in Booking.tsx:**

1. **Add new state for availability error dialog:**
```typescript
const [showDateReselectDialog, setShowDateReselectDialog] = useState(false);
const [pendingCheckIn, setPendingCheckIn] = useState<Date | undefined>();
const [pendingCheckOut, setPendingCheckOut] = useState<Date | undefined>();
```

2. **Modify onError handler to show dialog instead of just toast:**
```typescript
onError: (error) => {
  const message = error instanceof Error ? error.message : "Failed to create booking";
  
  if (message.includes('AVAILABILITY_CHANGED')) {
    // Show date re-selection dialog instead of just toast
    setShowDateReselectDialog(true);
  } else {
    toast.error(message);
  }
},
```

3. **Add DateReselectDialog component (inside Booking.tsx):**
```tsx
<Dialog open={showDateReselectDialog} onOpenChange={setShowDateReselectDialog}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-amber-500" />
        Dates No Longer Available
      </DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-4">
      <p className="text-sm text-muted-foreground">
        The dates you selected are no longer available. Please choose new dates to continue with your booking.
      </p>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Check-in Date Picker */}
        <div className="space-y-2">
          <Label>Check-in</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left">
                <Calendar className="mr-2 h-4 w-4" />
                {pendingCheckIn ? format(pendingCheckIn, "MMM d, yyyy") : "Select date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-50 bg-background" align="start">
              <CalendarComponent
                mode="single"
                selected={pendingCheckIn}
                onSelect={setPendingCheckIn}
                disabled={(date) => date < new Date()}
                className="pointer-events-auto"
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        
        {/* Check-out Date Picker */}
        <div className="space-y-2">
          <Label>Check-out</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left">
                <Calendar className="mr-2 h-4 w-4" />
                {pendingCheckOut ? format(pendingCheckOut, "MMM d, yyyy") : "Select date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-50 bg-background" align="start">
              <CalendarComponent
                mode="single"
                selected={pendingCheckOut}
                onSelect={setPendingCheckOut}
                disabled={(date) => !pendingCheckIn || date <= pendingCheckIn}
                className="pointer-events-auto"
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
    
    <DialogFooter className="gap-2 sm:gap-0">
      <Button variant="outline" onClick={() => setShowDateReselectDialog(false)}>
        Cancel
      </Button>
      <Button 
        onClick={handleDateReselection}
        disabled={!pendingCheckIn || !pendingCheckOut}
      >
        Update Dates
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

4. **Add handler for date reselection:**
```typescript
const handleDateReselection = () => {
  if (pendingCheckIn && pendingCheckOut) {
    // Update form state with new dates
    setCheckIn(format(pendingCheckIn, "yyyy-MM-dd"));
    setCheckOut(format(pendingCheckOut, "yyyy-MM-dd"));
    
    // Close dialog
    setShowDateReselectDialog(false);
    
    // Clear pending dates
    setPendingCheckIn(undefined);
    setPendingCheckOut(undefined);
    
    // Reset cost calculation to trigger recalculation
    setTotalCost(0);
    setCostBreakdown([]);
    
    // Show success toast
    toast.success("Dates updated! Please review the new pricing and try again.");
  }
};
```

5. **Add required imports:**
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
```

---

## UX Flow After Changes

```text
User clicks "Confirm Booking"
         │
         ▼
   ┌─────────────────────┐
   │ push-booking runs   │
   │ with v3 API         │◄── FIX: Correct endpoint
   └─────────────────────┘
         │
         ▼
    ┌───────────┐          ┌────────────────────────┐
    │ Available │──YES───► │ Booking succeeds       │
    └───────────┘          └────────────────────────┘
         │NO
         ▼
   ┌─────────────────────┐
   │ DateReselectDialog  │◄── NEW: User-friendly modal
   │ with Calendar       │
   └─────────────────────┘
         │
         ▼
   User picks new dates
         │
         ▼
   Cost recalculates → User can retry booking
```

---

## Expected Results

1. **Hostfully bookings will work** - Using correct v3 API means the availability endpoint exists
2. **Genuine unavailability is handled gracefully** - Users get a calendar picker to select new dates
3. **Better UX** - No dead-end error states; always an action path forward

