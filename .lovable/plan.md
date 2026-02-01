
# Plan: Fix Booking Flow UX, Map Display, Recommendations, and Experience Section

## Issues Identified

1. **Travel Concierge takes up too much screen space** - Cannot be minimized, blocks content
2. **Map shows property pin** - Should hide property pin, display permanent labels for attractions/eatery
3. **"You Might Also Love" shows R0** - `price_per_night` column in `public_properties` view is 0 for all properties; rates are in `amenities.pms_rate_types[0].baseRate`
4. **"The Experience" section displays nonsensical text** - e.g., "Awaken to gym and breakfast included, retire to bar and fireplace lounge." - The `composeAmenitiesProse()` function is too simplistic
5. **From the previously approved plan**: Room cards show "Contact for rates", calendar blocked dates not obvious, buttons don't work

---

## Technical Implementation

### Phase 1: Minimizable AI Concierge Panel

**File: `src/components/booking/AIConciergePanel.tsx`**

Transform the concierge into a minimizable floating AI icon:

**Mobile collapsed state (lines 566-593)**:
- Replace current "Ask Concierge" button with a small floating AI icon
- Add a compact date/guest/book strip that's always visible
- AI chat expands on tap of the icon

```typescript
// NEW collapsed mobile layout
{!isExpanded ? (
  <motion.div className="flex items-center gap-2">
    {/* Compact booking controls - always visible */}
    <div className="flex items-center gap-2 px-4 py-3 bg-background/95 backdrop-blur-sm rounded-full border shadow-lg">
      <button onClick={() => setDatePickerOpen(true)} className="flex items-center gap-1.5 text-sm">
        <Calendar className="h-4 w-4 text-primary" />
        {checkInDate ? format(checkInDate, 'MMM d') : 'Dates'}
      </button>
      <span className="text-muted-foreground">|</span>
      <button onClick={() => setGuestPickerOpen(true)} className="flex items-center gap-1 text-sm">
        <Users className="h-4 w-4 text-primary" />
        {firstRoom.numberOfAdults + firstRoom.numberOfChildren}
      </button>
      <Button size="sm" onClick={handleAddToJourney} className="ml-2">
        Book Now
      </Button>
    </div>
    
    {/* Floating AI icon - minimized concierge */}
    <motion.button
      onClick={() => setIsExpanded(true)}
      className="h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <Sparkles className="h-5 w-5" />
    </motion.button>
  </motion.div>
) : (
  // Expanded chat panel (existing code with close button)
)}
```

**Desktop sidebar (lines 381-553)**:
- Add minimize button to header
- When minimized, collapse to a floating icon in bottom-right
- Track `isMinimized` state

```typescript
const [isMinimized, setIsMinimized] = useState(false);

// In desktop return:
{isMinimized ? (
  // Floating icon only
  <motion.button
    onClick={() => setIsMinimized(false)}
    className="fixed right-6 bottom-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl"
  >
    <Sparkles className="h-6 w-6" />
  </motion.button>
) : (
  // Full sidebar with minimize button in header
  <div className="fixed right-0 top-0 h-screen w-80 xl:w-96 z-30 ...">
    <div className="p-4 border-b ...">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2>Your Travel Concierge</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMinimized(true)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
    {/* rest of sidebar */}
  </div>
)}
```

---

### Phase 2: Map Improvements - Hide Property Pin, Show Attraction Labels

**File: `src/components/showcase/InvitationMap.tsx`**

1. **Remove property marker** (lines 111-124):

```typescript
// REMOVE this block - no property pin
// new window.google.maps.Marker({
//   position,
//   map: mapInstanceRef.current,
//   icon: { path: ..., fillColor: '#e91e8c', ... },
//   title: propertyName,
// });
```

2. **Add permanent labels to attraction markers** (lines 210-253):

```typescript
// Instead of just circle markers with hover InfoWindows, add permanent labels
const marker = new google.maps.Marker({
  position: place.geometry.location,
  map: mapInstanceRef.current,
  title: place.name,
  label: {
    text: displayName,
    color: '#333',
    fontSize: '11px',
    fontWeight: '600',
    className: 'map-label',
  },
  icon: {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: ATTRACTION_COLORS[index],
    fillOpacity: 0.9,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 12,
  },
});

// Eatery label with emoji prefix
if (isEatery) {
  marker.setLabel({
    text: `🍽️ ${displayName}`,
    color: '#333',
    fontSize: '11px',
    fontWeight: '600',
  });
}
```

3. **Update CSS for label positioning** - Add custom CSS class for label offset.

---

### Phase 3: Fix "You Might Also Love" R0 Rate Display

**File: `src/components/booking/PropertyRecommendations.tsx`**

The issue is that `price_per_night` in `public_properties` is 0. The rate is actually in `amenities.pms_rate_types[0].baseRate`.

1. **Fetch amenities data** (lines 50-67):

```typescript
let query = supabase
  .from('public_properties')
  .select('id, name, slug, city, country, price_per_night, images, amenities')  // ADD amenities
  .eq('is_active', true)
  .limit(maxItems + 5);
```

2. **Extract rate from amenities** (lines 84-97, 134-144):

```typescript
// Helper to get actual rate
const getPropertyRate = (property: any): number => {
  // Priority 1: Direct price_per_night if non-zero
  if (property.price_per_night && property.price_per_night > 0) {
    return property.price_per_night;
  }
  
  // Priority 2: pms_rate_types baseRate
  const rateTypes = property.amenities?.pms_rate_types || [];
  if (rateTypes.length > 0 && rateTypes[0].baseRate) {
    return rateTypes[0].baseRate;
  }
  
  // Priority 3: First room_type baseRate
  const roomTypes = property.amenities?.room_types || [];
  if (roomTypes.length > 0) {
    const room = roomTypes[0];
    if (room.baseRate || room.base_rate) {
      return room.baseRate || room.base_rate;
    }
    // Check linked rate type
    const linkedRateId = room.linkedRateTypes?.[0];
    if (linkedRateId) {
      const linkedRate = rateTypes.find((rt: any) => rt.id === linkedRateId);
      if (linkedRate?.baseRate) return linkedRate.baseRate;
    }
  }
  
  return 0; // No rate found
};

// Use in mapping
setRecommendations(
  fallbackProperties.map(p => ({
    ...p,
    price_per_night: getPropertyRate(p),  // Use extracted rate
    images: Array.isArray(p.images) ? p.images as string[] : [],
    matchReason: 'Featured property'
  }))
);
```

3. **Only show price if non-zero** (lines 213, 274):

```typescript
{property.price_per_night > 0 ? (
  <span className="font-medium">{formatPrice(property.price_per_night)}</span>
) : (
  <span className="text-sm text-muted-foreground italic">Inquire for rates</span>
)}
```

---

### Phase 4: Intelligent "The Experience" Section

**File: `src/lib/editorialUtils.ts`**

The current `composeAmenitiesProse()` produces awkward text because it naively concatenates facilities. We need smarter logic:

```typescript
export function composeAmenitiesProse(facilities: string[]): string | null {
  if (!facilities || facilities.length === 0) return null;

  // Normalize and categorize facilities
  const normalized = facilities.map(f => f.toLowerCase().trim());
  
  // Categories with contextual verbs
  const categories = {
    wellness: {
      keywords: ['pool', 'spa', 'gym', 'fitness', 'sauna', 'jacuzzi', 'yoga'],
      morning: 'Revive with',
      evening: 'Unwind at the',
    },
    dining: {
      keywords: ['restaurant', 'bar', 'breakfast', 'dining', 'kitchen'],
      morning: 'Savor',
      evening: 'Dine at',
    },
    comfort: {
      keywords: ['fireplace', 'lounge', 'library', 'garden', 'terrace', 'view'],
      morning: 'Enjoy the',
      evening: 'Retreat to',
    },
    convenience: {
      keywords: ['wifi', 'parking', 'concierge', 'room service', 'laundry'],
      phrase: 'Complimentary',
    },
  };

  const found: { category: string; items: string[] }[] = [];
  
  for (const [cat, config] of Object.entries(categories)) {
    const matches = facilities.filter(f => 
      config.keywords.some(kw => f.toLowerCase().includes(kw))
    );
    if (matches.length > 0) {
      found.push({ category: cat, items: matches.slice(0, 2) });
    }
  }

  if (found.length === 0) {
    // Fallback: Simple listing
    return `Featuring ${facilities.slice(0, 3).join(', ').toLowerCase()}.`;
  }

  // Compose prose with proper grammar
  const sentences: string[] = [];
  
  const wellness = found.find(f => f.category === 'wellness');
  const dining = found.find(f => f.category === 'dining');
  const comfort = found.find(f => f.category === 'comfort');
  const convenience = found.find(f => f.category === 'convenience');

  if (wellness && wellness.items.length > 0) {
    const items = wellness.items.map(i => i.toLowerCase()).join(' and ');
    sentences.push(`Revive with the ${items}`);
  }

  if (dining && dining.items.length > 0) {
    const verb = wellness ? 'then savor' : 'Savor';
    const items = dining.items.map(i => i.toLowerCase()).join(' or ');
    sentences.push(`${verb} ${items}`);
  }

  if (comfort && comfort.items.length > 0 && sentences.length < 2) {
    const items = comfort.items.map(i => i.toLowerCase()).join(' and ');
    sentences.push(`retreat to the ${items}`);
  }

  if (sentences.length === 0 && convenience) {
    return `Enjoy ${convenience.items.slice(0, 2).join(' and ').toLowerCase()}.`;
  }

  return sentences.join(', ') + '.';
}
```

**Example outputs:**
- Input: `["Pool", "Gym", "Breakfast", "Bar", "Fireplace"]`
- Output: "Revive with the pool and gym, then savor breakfast or bar."

- Input: `["Garden view", "Fireplace lounge", "Free WiFi"]`
- Output: "Retreat to the garden view and fireplace lounge."

---

### Phase 5: Previously Approved Fixes (Rate Display & Calendar)

#### 5a. Fix Room Rate Display

**File: `src/pages/PropertyShowcase.tsx` (lines 556-614)**

The `getLowestRateForRoom()` function needs to prioritize linked rate types:

```typescript
const getLowestRateForRoom = (room: RoomType): number | null => {
  // 1. Check linked rate types FIRST (wizard-configured rates)
  const roomData = property?.amenities?.room_types?.find((rt: any) => 
    (rt.id || rt.room_type_id) === room.id
  );
  
  if (roomData?.linkedRateTypes?.length > 0) {
    const pmsRateTypes = property?.amenities?.pms_rate_types || [];
    for (const rateTypeId of roomData.linkedRateTypes) {
      const rateType = pmsRateTypes.find((rt: any) => rt.id === rateTypeId);
      if (rateType?.baseRate) {
        return rateType.baseRate;
      }
    }
  }
  
  // 2. Direct room rate
  if (roomData?.baseRate || roomData?.base_rate || roomData?.daily_rate) {
    return roomData.baseRate || roomData.base_rate || roomData.daily_rate;
  }
  
  // 3. Existing availability cache lookup (unchanged)
  const availData = getAvailabilityForRoom(room);
  // ... rest of existing logic
};
```

#### 5b. Improve Calendar Blocked Date Visibility

**File: `src/components/booking/BottomSheetDatePicker.tsx` (lines 299-337)**

```typescript
const status = getDateStatus(date);
const disabled = isDisabled(date);
const unavailable = status && !status.available;

return (
  <button
    key={date.toISOString()}
    onClick={() => !disabled && !unavailable && handleDateClick(date)}
    disabled={disabled || unavailable}
    className={cn(
      "h-11 rounded-xl text-sm font-medium transition-all duration-200",
      "flex flex-col items-center justify-center gap-0.5",
      !isMobile && "sm:h-14",
      selected
        ? "bg-primary text-primary-foreground"
        : inRange
        ? "bg-primary/10"
        : unavailable
        ? "bg-muted/60 text-muted-foreground/50 line-through cursor-not-allowed"
        : "hover:bg-muted",
      disabled && "opacity-30 cursor-not-allowed",
      // ... rest
    )}
  >
    <span>{format(date, "d")}</span>
    {/* Remove tiny dot, use cell background instead */}
  </button>
);
```

Add legend after calendar grid (line ~340):

```typescript
{/* Availability Legend */}
<div className="px-4 py-2 flex justify-center gap-4 text-xs text-muted-foreground">
  <span className="flex items-center gap-1.5">
    <span className="w-3 h-3 rounded bg-background border" />
    Available
  </span>
  <span className="flex items-center gap-1.5">
    <span className="w-3 h-3 rounded bg-muted/60 line-through text-[8px] flex items-center justify-center">X</span>
    Unavailable
  </span>
</div>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/booking/AIConciergePanel.tsx` | Add minimize/collapse functionality; compact date/guest/book strip always visible |
| `src/components/showcase/InvitationMap.tsx` | Remove property pin; add permanent text labels to attraction markers |
| `src/components/booking/PropertyRecommendations.tsx` | Fetch amenities; extract rate from `pms_rate_types[0].baseRate`; handle R0 gracefully |
| `src/lib/editorialUtils.ts` | Rewrite `composeAmenitiesProse()` with smarter sentence composition |
| `src/pages/PropertyShowcase.tsx` | Fix `getLowestRateForRoom()` to check linkedRateTypes first |
| `src/components/booking/BottomSheetDatePicker.tsx` | Grey out blocked dates with `line-through`; prevent selection; add legend |

---

## Expected Outcomes

1. **Concierge**: Minimizable to floating icon; date/guest/book always accessible
2. **Map**: No property pin; attractions and eatery have permanent labels
3. **Recommendations**: Display actual rates (R2,650) or "Inquire for rates" instead of R0
4. **Experience section**: Produces sensible prose like "Revive with the pool and gym, retreat to the fireplace lounge."
5. **Room cards**: Show "From R2,650/night" correctly
6. **Calendar**: Blocked dates clearly greyed out and unclickable
