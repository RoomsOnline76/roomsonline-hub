

# Add Booking Window to Specials (Early Bird Support)

## Problem

The Early Bird special for Latter Days has stay dates June 1 - July 15, but the booking is being made in April. Two issues prevent it from working:

1. **No booking window columns exist** in the `property_specials` table. The checkout code already references `book_from` and `book_until` (lines 1569-1570 of Booking.tsx), but those columns were never created.

2. **SpecialsBanner filters incorrectly** — it checks if TODAY falls within `valid_from..valid_to` (the stay window). For an Early Bird, the stay window is June-July, so the banner never shows in April because `valid_from (June) <= today (April)` is false.

## Changes

### 1. Database migration
Add two date columns to `property_specials`:
- `book_from date` — earliest date the booking can be made
- `book_until date` — latest date the booking can be made (the "book by" cutoff)

### 2. Admin UI — AccommodationSpecialsTab.tsx
- Add two date inputs under a "Booking Window" section: "Book From" and "Book By"
- Include both fields in the `save()` function payload
- Include in `emptySpecial` defaults as null

### 3. SpecialsBanner query fix
Currently: `.lte("valid_from", today).gte("valid_to", today)` — only shows specials where today is IN the stay window.

Updated logic: fetch specials where EITHER:
- Today is within the stay window (valid_from <= today <= valid_to), OR
- Today is within the booking window (book_from <= today <= book_until)

Since Supabase REST doesn't support OR filters cleanly across nullable columns, fetch all active specials for the property and filter client-side.

### 4. Checkout auto-apply (already works)
Lines 1569-1570 in Booking.tsx already check `book_from` and `book_until`. Once the columns exist and data is saved, this will work automatically.

## Files

| File | Change |
|---|---|
| Migration SQL | Add `book_from` and `book_until` date columns |
| `src/components/property/AccommodationSpecialsTab.tsx` | Add booking window date fields + save them |
| `src/components/showcase/SpecialsBanner.tsx` | Fix query to show specials visible during booking window |

