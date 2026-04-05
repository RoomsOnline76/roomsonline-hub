

# Enforce Per-Room/Property Stay & Occupancy Rules in Checkout

## Problem
The checkout page has basic `maxGuests` enforcement but ignores min/max stay nights, max adults specifically, max children, min guests, and season-level min-stay overrides. All stepper controls and the date picker allow values that violate the property/room rules. Different properties have different rules, but the checkout treats them all the same.

## Data Already Available
The database already stores these constraints:
- **`hostfully_room_types`**: `min_stay`, `max_stay`, `min_guests`, `max_guests`, `allow_teens`, `allow_children`, `allow_infants`
- **`rolos_room_types`**: `max_occupancy`
- **`rolos_rate_plans`**: `min_stay`, `max_stay`
- **`rolos_rate_seasons`**: `min_stay_override`
- **Amenities JSONB**: `room_types[].minStayDays`, `room_types[].maxStayDays`, `room_types[].maxGuests`, `room_types[].minGuests`

The checkout page already reads `maxGuests`, `allowTeens`, `allowChildren`, `allowInfants`, `minGuests` into the `RoomType` interface — but doesn't use `minGuests` and completely ignores min/max stay.

## Implementation

### 1) Extend the RoomType interface with stay constraints
In `src/pages/Booking.tsx`, add to the `RoomType` interface:
```typescript
interface RoomType {
  // ...existing fields...
  minStay?: number;   // minimum nights
  maxStay?: number;   // maximum nights (0 = unlimited)
  maxAdults?: number; // if property defines adult-specific cap
}
```

Populate these from both amenities and cached room types (lines 329-350), reading `minStayDays`/`min_stay`, `maxStayDays`/`max_stay`.

### 2) Resolve effective min/max stay per selected room (season-aware)
Create a helper that resolves the tightest stay constraint across all selected rooms:
- Start with each room's `minStay`/`maxStay`
- Check active rate plan seasons (`rolos_rate_seasons.min_stay_override`) for the selected dates
- Use the **strictest** (highest min, lowest max) across all rooms in the booking

### 3) Enforce stay rules in the date picker
Pass `minNights` and `maxNights` props to `BottomSheetDatePicker`:
- After check-in is selected, grey out check-out dates that would violate min/max stay
- Show a small hint label like "Min 3 nights" near the date selection
- When dates change, validate and show a warning if violated

Update `BottomSheetDatePicker` interface to accept:
```typescript
minNights?: number;
maxNights?: number;
```

In the day-click handler: when selecting check-out, disable dates before `checkIn + minNights` and after `checkIn + maxNights`.

### 4) Enforce occupancy rules in guest steppers
Currently the stepper uses a single `maxGuestsForRoom` cap shared across all guest types. Improve to:
- Respect `minGuests` — show a warning if total guests < minGuests, disable "Confirm" button
- Adults min should be `max(1, roomType.minGuests || 1)` when no other guests
- Keep the existing shared-cap logic for total occupancy
- Show capacity info: "Max 6 guests" beneath the room name

### 5) Show rule summary on room card
Below the room type name/dates, display a compact rule line:
```
Min 2 nights · Max 8 guests
```
Only show constraints that differ from defaults (min 1 night, no max).

### 6) Validate before proceeding to Step 2
Before allowing the user to continue to guest details:
- Check all rooms meet min/max stay
- Check all rooms meet min/max occupancy
- If violated, highlight the offending room card with a border and inline message

## Files Changed
| File | Change |
|---|---|
| `src/pages/Booking.tsx` | Extend RoomType interface; populate min/max stay from amenities & cached data; add validation logic; pass constraints to date picker; show rule hints on room cards; enforce min occupancy |
| `src/components/booking/BottomSheetDatePicker.tsx` | Accept `minNights`/`maxNights` props; disable invalid check-out dates; show min-stay hint label |

