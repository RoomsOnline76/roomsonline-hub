
# Fix Sticky Guest Details for Checkout

## Problem

Returning customers must re-enter their name, email, and phone number every time they make a booking. The sticky guest details feature (which stores data in `localStorage`) exists in `ItineraryContext`, but the checkout forms don't properly use it.

## Root Cause

There are two issues across the checkout pages:

### 1. **Booking.tsx (Single-Property Checkout)** - Current page the user is on
- Does NOT import or use `ItineraryContext` at all
- Initializes empty local state: `useState("")` for all guest fields
- No connection to the sticky `localStorage` system

### 2. **JourneyCheckout.tsx (Multi-Property Checkout)**
- Imports `ItineraryContext` but only reads values once on mount
- Local state is initialized from context but never synced back as user types
- Guest details only saved to `localStorage` when clicking "Complete Booking"

## Solution

### File Changes

| File | Changes |
|------|---------|
| `src/pages/Booking.tsx` | Import `useItinerary`, initialize guest fields from context, sync on blur |
| `src/pages/JourneyCheckout.tsx` | Sync guest details to context on input blur for real-time persistence |

---

## Technical Implementation

### 1. Booking.tsx (Single-Property)

**Add import:**
```typescript
import { useItinerary } from "@/contexts/ItineraryContext";
```

**Get context values:**
```typescript
const { guestDetails, setGuestDetails } = useItinerary();
```

**Initialize local state from context:**
```typescript
const [guestName, setGuestName] = useState(guestDetails.name || "");
const [guestEmail, setGuestEmail] = useState(guestDetails.email || "");
const [guestPhone, setGuestPhone] = useState(guestDetails.phone || "");
```

**Add blur handlers to persist on field exit:**
```typescript
onBlur={() => setGuestDetails({ name: guestName })}
onBlur={() => setGuestDetails({ email: guestEmail })}
onBlur={() => setGuestDetails({ phone: guestPhone })}
```

### 2. JourneyCheckout.tsx (Multi-Property)

**Add blur handlers to existing inputs:**
```typescript
<Input
  id="guestName"
  value={guestName}
  onChange={(e) => setGuestName(e.target.value)}
  onBlur={() => setGuestDetails({ name: guestName })}  // ADD THIS
  ...
/>
```

Same pattern for email and phone inputs.

---

## Why "onBlur" Instead of "onChange"?

- **Performance**: Avoids writing to `localStorage` on every keystroke
- **UX**: Saves data naturally when user moves to next field or clicks away
- **Reliability**: Captures partial input even if user doesn't submit form

---

## Expected Result

After this fix:
- Guest details entered on any checkout page persist to `localStorage`
- Returning customers see their name, email, and phone pre-filled
- Works across both single-property and multi-property booking flows
- Data persists even if browser is closed and reopened
