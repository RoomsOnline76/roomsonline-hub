
# Plan: Fix Map Markers, Property Pin, and Bottom Navigation Actions

## Issues to Fix

1. **Map attraction pins stacking/overlapping** - Labels are unreadable when attractions are near each other
2. **Property pin missing** - Need to restore the pink ROL-branded property marker
3. **Bottom CTA buttons do nothing** - "Explore Rooms", "Select Dates", and "Book Now" clicks have no effect
4. **Bottom nav bar hiding content** - Sticky elements overlap and hide the "You might also love" section

---

## Root Cause Analysis

### 1. Map Label Stacking
The current implementation places text labels directly on markers. When attractions are geographically close, these labels overlap and become unreadable. The screenshot shows "Skulpies", "Ancient Fish Traps", "Bosbokduin Private N..." all stacking near Still Bay.

**Solution:** Remove permanent labels from markers; show names only in the legend below the map. Keep markers as colored circles with InfoWindow on click for details.

### 2. Missing Property Pin
Line 111 in `InvitationMap.tsx` shows: `// NOTE: Property marker removed per UX feedback - attractions are the focus`

The property marker was intentionally removed, but the user wants it back as a distinctive pink ROL-branded pin.

**Solution:** Re-add the property marker with ROL's pink brand color (#E91E8C).

### 3. Bottom CTA Buttons Not Working
There are **two overlapping fixed elements** at the bottom:
- `StickyBookingCTA` at z-index 50 (shows price + "Explore Rooms"/"Select Dates" button)
- `AIConciergePanel` collapsed strip at z-index 40 (shows dates/guests + AI icon)

When AI Concierge is enabled, both elements appear. The `StickyBookingCTA.onBook` calls `handleBookProperty()` which should work, but the AIConciergePanel's strip is blocking clicks or causing confusion.

**Solution:** 
- When AI Concierge mode is active, hide `StickyBookingCTA` entirely (concierge panel handles booking)
- Add a "Book Now" button to the AIConciergePanel's collapsed strip
- Ensure the button triggers the correct action (open checkout if items in cart, or add room for single-room properties)

### 4. Content Hidden by Bottom Nav
The fixed positioning with `padding-bottom: env(safe-area-inset-bottom)` doesn't account for the full height of the sticky elements. The "You might also love" section's pricing is cut off.

**Solution:** Add a spacer element at the bottom of the page content when AI Concierge or sticky CTA is visible (approximately 80-100px).

---

## Technical Implementation

### Phase 1: Fix Map Markers

**File: `src/components/showcase/InvitationMap.tsx`**

1. **Restore property marker with pink pin** (after line 109):

```typescript
// Property marker - distinctive pink ROL pin
new window.google.maps.Marker({
  position,
  map: mapInstanceRef.current,
  title: propertyName,
  icon: {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#E91E8C', // ROL pink
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 3,
    scale: 12,
  },
  zIndex: 200, // Above attractions
});
```

2. **Remove text labels from attraction markers** (lines 201-221):

```typescript
// Remove the label property entirely - causes stacking
const marker = new google.maps.Marker({
  position: place.geometry.location,
  map: mapInstanceRef.current,
  title: place.name,
  // NO label property - just colored circles
  icon: {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: ATTRACTION_COLORS[index],
    fillOpacity: 0.9,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 8,
  },
  zIndex: 100 + index,
});
```

3. **Keep the legend below map** - The legend already shows names with colored dots, which provides identification without map clutter.

---

### Phase 2: Fix Bottom Navigation Actions

**File: `src/pages/PropertyShowcase.tsx`**

1. **Hide StickyBookingCTA when AI Concierge is active** (lines 808-819):

```typescript
{/* Sticky Booking CTA - Only show when AI Concierge is NOT active */}
{!(aiConciergeEnabled && !aiFailed && (isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty)) && (
  <StickyBookingCTA
    onBook={handleBookProperty}
    lowestRate={lowestRate}
    isExternal={isNightsBridgeProperty}
    bookedRoomsCount={bookedRooms.length}
    propertyName={property.name}
    propertyId={property.id}
    propertySlug={property.slug || property.id}
    propertyImage={property.images?.[0]}
    roomCount={getRoomTypes().length}
  />
)}
```

**File: `src/components/booking/AIConciergePanel.tsx`**

2. **Add "Book Now" button to collapsed mobile strip** (lines 617-639):

```typescript
<motion.div
  key="collapsed"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: 20 }}
  className="flex items-center justify-center gap-2"
>
  {/* Compact booking controls */}
  <div className="flex items-center gap-2 px-3 py-2 bg-background/95 backdrop-blur-sm rounded-full border shadow-lg">
    <button 
      onClick={() => setDatePickerOpen(true)} 
      className="flex items-center gap-1.5 text-sm"
    >
      <Calendar className="h-4 w-4 text-primary" />
      <span className="font-medium">
        {checkInDate && checkOutDate
          ? `${format(checkInDate, 'MMM d')} – ${format(checkOutDate, 'MMM d')}`
          : 'Dates'}
      </span>
    </button>
    <span className="text-muted-foreground/50">|</span>
    <button 
      onClick={() => setGuestPickerOpen(true)} 
      className="flex items-center gap-1 text-sm"
    >
      <Users className="h-4 w-4 text-primary" />
      <span>{firstRoom.numberOfAdults + firstRoom.numberOfChildren}</span>
    </button>
    
    {/* NEW: Book Now button */}
    <Button 
      size="sm" 
      onClick={handleBookNowClick}
      className="ml-1"
    >
      Book Now
    </Button>
  </div>
  
  {/* Floating AI icon */}
  <motion.button
    onClick={() => setIsExpanded(true)}
    className="h-10 w-10 rounded-full bg-primary/10 text-primary shadow-md flex items-center justify-center"
  >
    <Sparkles className="h-4 w-4" />
  </motion.button>
</motion.div>
```

3. **Add `handleBookNowClick` function** in AIConciergePanel:

```typescript
const handleBookNowClick = () => {
  // If no dates selected, open date picker
  if (!checkInDate || !checkOutDate) {
    setDatePickerOpen(true);
    return;
  }
  
  // For single-room properties, auto-add to cart
  if (roomTypes.length === 1) {
    const room = roomTypes[0];
    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Get rate from availability map or room data
    const dateKey = format(checkInDate, 'yyyy-MM-dd');
    const dayData = availabilityMap?.get(dateKey);
    const roomRate = dayData?.rate || (room as any).baseRate || (room as any).base_rate || 0;
    const totalPrice = roomRate * nights;
    
    addStay({
      property_id: propertyId,
      property_name: propertyName,
      property_slug: propertySlug,
      property_image: propertyImage || '',
      external_system: externalSystem || 'none',
      dates: {
        check_in: format(checkInDate, 'yyyy-MM-dd'),
        check_out: format(checkOutDate, 'yyyy-MM-dd'),
      },
      rooms: [{
        room_type_id: room.id,
        room_type_name: room.name,
        quantity: 1,
        rate_per_night: roomRate,
        total_price: totalPrice,
      }],
      guests: {
        adults: firstRoom.numberOfAdults,
        children: firstRoom.numberOfChildren,
        infants: firstRoom.numberOfInfants,
      },
      price_breakdown: {
        subtotal: totalPrice,
        fees: [],
        taxes: [],
        total: totalPrice,
      },
      availability_status: 'available',
      nights,
    });
    
    toast.success(`Added ${room.name} to your journey!`);
  } else {
    // Multiple rooms - scroll to room section
    document.getElementById('rooms-section')?.scrollIntoView({ behavior: 'smooth' });
  }
};
```

---

### Phase 3: Add Bottom Content Spacer

**File: `src/pages/PropertyShowcase.tsx`**

Add a spacer div before the closing of PublicLayout (line 884):

```typescript
{/* Spacer for fixed bottom elements */}
<div className="h-24 sm:h-20" aria-hidden="true" />
```

This ensures the "You might also love" cards and their pricing are fully visible above the fixed bottom nav.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/showcase/InvitationMap.tsx` | Restore property pin with pink color; Remove text labels from attraction markers |
| `src/components/booking/AIConciergePanel.tsx` | Add "Book Now" button to collapsed strip; Add `handleBookNowClick` function |
| `src/pages/PropertyShowcase.tsx` | Hide StickyBookingCTA when AI Concierge active; Add bottom spacer |

---

## Expected Outcomes

1. **Map**: Property shown as prominent pink pin; attractions as colored circles (no overlapping labels); legend provides names
2. **Bottom nav**: Single, unified booking strip with Dates | Guests | Book Now + small AI icon
3. **Button actions**: "Book Now" opens date picker (if no dates) or adds room to cart (single-room) or scrolls to rooms (multi-room)
4. **Content visibility**: "You might also love" cards fully visible with pricing

---

## Visual Behavior After Fix

```
┌─────────────────────────────────────────┐
│                                         │
│  [Map with pink property pin center]    │
│  [Colored circles for 5 attractions]    │
│  [No overlapping text labels]           │
│                                         │
├─────────────────────────────────────────┤
│ Legend: 🟡 Skulpiesbaai  ⚫ Ancient...  │
└─────────────────────────────────────────┘

...scrolls...

┌─────────────────────────────────────────┐
│  You might also love                    │
│  ┌──────┐ ┌──────┐ ┌──────┐            │
│  │Card 1│ │Card 2│ │Card 3│            │
│  │R2,650│ │R1,800│ │R3,200│            │
│  └──────┘ └──────┘ └──────┘            │
│                                         │
│  [Spacer 24px]                         │
├─────────────────────────────────────────┤
│ [Feb 2-7] | [3 guests] [Book Now] (✨)  │  ← Single unified bar
└─────────────────────────────────────────┘
```
