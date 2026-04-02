

# Fix: Book Now Buttons Not Working (Date Selection Flow)

## Root Cause

When the user clicks any "Book Now" button, `handleBookRoom` checks a `datesConfirmed` flag. On page load this is `false`, so the function just scrolls to the date picker area and adds a brief glow effect — but never opens the date picker or gives clear guidance. The user is left confused with nothing happening.

The `EmbedDatePicker` is a small pill button that must be manually clicked to open a calendar dropdown. The scroll-and-pulse effect is too subtle to communicate this.

## Fix

### 1. Auto-open the date picker when Book Now is clicked without dates confirmed

In `handleBookRoom`, when `!datesConfirmed`, in addition to scrolling, programmatically open the `EmbedDatePicker` calendar. This requires:
- Adding a controlled `isOpen` prop (or a ref-based `.open()` method) to `EmbedDatePicker`
- `EmbedProperty.tsx` passes a state variable to control the picker's open state
- When Book Now is clicked without confirmed dates, set this state to `true` — the calendar drops down automatically

### 2. Store the pending room selection and auto-proceed after dates are picked

Currently the user must click Book Now twice (once to trigger date selection, once after selecting dates). Fix:
- Add `pendingRoom` state: `{ roomId, roomName } | null`
- When Book Now is clicked without dates → store the room in `pendingRoom`, open the date picker
- When check-out date is selected (completing date selection) → if `pendingRoom` is set, auto-navigate to checkout immediately
- This makes it a single-click flow: Book Now → calendar opens → pick dates → auto-redirect to checkout

### 3. Show a visible prompt banner

When `datesPulse` is active (user clicked Book without dates), show a brief inline banner above the date picker:
> "Select your check-in and check-out dates to continue booking"

This provides clear textual feedback in addition to the visual glow.

## Files to Change

| File | Change |
|------|--------|
| `src/components/embed/EmbedDatePicker.tsx` | Add controlled `isOpen` prop alongside internal state |
| `src/pages/EmbedProperty.tsx` | Add `pendingRoom` state, auto-open picker, auto-proceed after date selection, add prompt banner |

## Expected Outcome
- User clicks "Book Now" → calendar opens automatically at the top → user picks check-in → picks check-out → immediately redirected to checkout page
- Single-click booking flow instead of the current broken two-click flow
- Works for both room card buttons and availability grid "Book" buttons

