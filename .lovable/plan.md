
# Plan: Fix Booking Flow Issues - Back Navigation, Calendar UX, and Rate Passthrough

## Summary
Three interconnected issues in the booking flow need to be addressed:
1. **Double URL 404 Error**: Clicking "Back" during booking creates malformed URL like `/booking/latter-days/https://book.sleepinafrica.roomsonline.co.za/property/latter-days`
2. **Calendar Picker UX**: The BottomSheetDatePicker is not device-aware and lacks rates display on larger screens
3. **Rate Not Carried to Payment**: The calculated rate (R5,300) from QuickBookDrawer/ItineraryContext is not being used by Booking.tsx for the final price calculation

---

## Issue 1: Double URL 404 Error

### Root Cause
In `src/pages/Booking.tsx` (line 1261), the `backTo` prop uses `getPropertyUrl()` which returns a **full URL** including the domain:
```javascript
backTo={`${getPropertyUrl(property.slug)}${searchParams...}`}
```

`getPropertyUrl()` in `src/lib/config.ts` returns:
```javascript
`https://book.sleepinafrica.roomsonline.co.za/property/${slugOrId}`
```

When React Router's `navigate()` receives this full URL, it treats it as a relative path and appends it to the current location, creating the malformed double URL.

### Solution
Change the `backTo` prop to use a relative path instead of the full URL:

**File: `src/pages/Booking.tsx` (line 1261)**
```typescript
// FROM:
backTo={`${getPropertyUrl(property.slug || property.id)}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}

// TO:
backTo={`/property/${property.slug || property.id}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
```

Apply same fix to line 1181:
```typescript
// FROM:
backTo={`/property/${property.slug || property.id}`}
```
(This one is already correct)

---

## Issue 2: Calendar Picker Device-Awareness and UX

### Root Cause
The `BottomSheetDatePicker` component in `src/components/booking/BottomSheetDatePicker.tsx`:
1. Does not display rates in calendar cells (unlike `RoomAvailabilityCalendar`)
2. Shows only 14 days in the quick scroll, making it hard to skip ahead months
3. Uses a simple month-by-month navigation without jump-ahead options
4. Does not differentiate between mobile and desktop views

### Solution
Enhance the BottomSheetDatePicker to be device-aware with rate display:

**File: `src/components/booking/BottomSheetDatePicker.tsx`**

1. **Add device detection**:
   ```typescript
   import { useIsMobile } from "@/hooks/use-mobile";
   // ...
   const isMobile = useIsMobile();
   ```

2. **Show rates on larger screens** (in the calendar grid):
   ```typescript
   {/* Days grid */}
   <div className="grid grid-cols-7 gap-1">
     {getDaysInMonth(currentMonth).map((date, index) => {
       // ... existing code ...
       return (
         <button ...>
           <span>{format(date, "d")}</span>
           {/* Show rate on larger screens */}
           {!isMobile && status?.rate && status.available && (
             <span className="text-[9px] text-muted-foreground leading-none">
               {status.rate >= 1000 
                 ? `${(status.rate / 1000).toFixed(1)}k`.replace('.0k', 'k')
                 : status.rate.toFixed(0)}
             </span>
           )}
           {/* Show availability dot on mobile */}
           {isMobile && status && (
             <span className={cn(
               "w-1 h-1 rounded-full",
               status.available ? "bg-green-500" : "bg-red-400"
             )} />
           )}
         </button>
       );
     })}
   </div>
   ```

3. **Add month jump-ahead buttons**:
   ```typescript
   {/* Month navigation with jump buttons */}
   <div className="flex items-center justify-between mb-4 gap-2">
     <div className="flex items-center gap-1">
       <Button variant="ghost" size="sm" onClick={() => jumpToMonth(-3)}>-3m</Button>
       <Button variant="ghost" size="icon" onClick={prevMonth}>
         <ChevronLeft className="h-5 w-5" />
       </Button>
     </div>
     <span className="font-medium tracking-tight">
       {format(currentMonth, "MMMM yyyy")}
     </span>
     <div className="flex items-center gap-1">
       <Button variant="ghost" size="icon" onClick={nextMonth}>
         <ChevronRight className="h-5 w-5" />
       </Button>
       <Button variant="ghost" size="sm" onClick={() => jumpToMonth(3)}>+3m</Button>
     </div>
   </div>
   ```

4. **Expand quick-scroll to 21+ days** for easier navigation:
   ```typescript
   const quickDates = eachDayOfInterval({
     start: today,
     end: addDays(today, 20), // Expanded from 13 to 20
   });
   ```

5. **Increase cell sizes for desktop**:
   ```typescript
   className={cn(
     "h-11 sm:h-14 rounded-xl text-sm font-medium transition-all duration-200",
     "flex flex-col items-center justify-center gap-0.5",
     // ... rest of styles
   )}
   ```

---

## Issue 3: Rate Not Carried to Final Payment Calculation

### Root Cause
The booking flow has a disconnect:
1. `QuickBookDrawer` calculates the price (R2650/night x 2 nights = R5,300) and adds it to `ItineraryContext`
2. The "Your Journey" panel correctly shows R5,300 (from ItineraryContext.stays[].price_breakdown.total)
3. BUT `Booking.tsx` only uses `useItinerary()` for `guestDetails`, NOT for the price
4. `Booking.tsx` re-calculates cost using `calculateCost()` which looks for availability data from PMS cache - but for manual properties with no PMS, this data structure differs

When `costBreakdown.length === 0` AND `preSelectedTotalCost === null`, it shows "On request" (line 1793).

### Solution
Modify `Booking.tsx` to pull the pre-calculated price from `ItineraryContext`:

**File: `src/pages/Booking.tsx`**

1. **Extract stays and pricing from ItineraryContext**:
   ```typescript
   // Line ~80, update the destructuring:
   const { guestDetails, setGuestDetails, stays, totalPrice } = useItinerary();
   ```

2. **Initialize rooms and cost from ItineraryContext when available**:
   ```typescript
   // After property loads, check if we have stay data in context
   useEffect(() => {
     if (property && stays.length > 0) {
       // Find the stay for this property
       const currentStay = stays.find(s => 
         s.property_id === property.id || s.property_slug === property.slug
       );
       
       if (currentStay && rooms.length === 0) {
         // Initialize rooms from itinerary context
         const mappedRooms = currentStay.rooms.map(r => ({
           roomTypeId: r.room_type_id,
           roomTypeName: r.room_type_name,
           numberOfAdults: currentStay.guests.adults,
           numberOfTeens: 0,
           numberOfChildren: currentStay.guests.children,
           numberOfInfants: currentStay.guests.infants,
           numberOfPets: 0,
           checkIn: currentStay.dates.check_in,
           checkOut: currentStay.dates.check_out,
         }));
         setRooms(mappedRooms);
         setCheckIn(currentStay.dates.check_in);
         setCheckOut(currentStay.dates.check_out);
         
         // Use the pre-calculated price from context
         if (currentStay.price_breakdown.total > 0) {
           setTotalCost(currentStay.price_breakdown.total);
           // Build cost breakdown from rooms
           setCostBreakdown(currentStay.rooms.map(r => ({
             description: `${r.room_type_name} (${currentStay.guests.adults + currentStay.guests.children} guests)`,
             nights: currentStay.nights,
             quantity: r.quantity,
             unitPrice: r.rate_per_night,
             total: r.total_price,
           })));
         }
       }
     }
   }, [property, stays]);
   ```

3. **Add fallback to itinerary pricing when local calculation fails**:
   ```typescript
   // In the cost display section (~line 1788), add fallback:
   ) : costBreakdown.length > 0 ? (
     // ... existing breakdown display
   ) : (
     <div className="flex justify-between items-center">
       <span className="text-muted-foreground">Total</span>
       <span className="text-xl font-bold">
         {preSelectedTotalCost !== null 
           ? <FormattedPrice amount={preSelectedTotalCost} />
           : totalCost > 0
           ? <FormattedPrice amount={totalCost} />
           : 'On request'}
       </span>
     </div>
   )}
   ```

---

## Technical Details

### Files to Modify:
1. `src/pages/Booking.tsx` - Fix back navigation URL and add ItineraryContext price integration
2. `src/components/booking/BottomSheetDatePicker.tsx` - Add device-awareness, rate display, and improved navigation

### Dependencies:
- No new dependencies required
- Uses existing `useIsMobile` hook from `src/hooks/use-mobile.tsx`

### Testing Considerations:
- Test back navigation from booking page on both preview and production domains
- Test calendar on mobile (should show dots) and desktop (should show rates)
- Test booking flow for manual properties (non-PMS) to verify rate carries through to payment

### Risk Assessment:
- Low risk: Changes are additive and fall back to existing behavior
- The URL fix is straightforward and won't affect other navigation
- Calendar changes are UI-only and don't affect booking logic
- Price integration adds a new data source but preserves existing calculation as fallback
