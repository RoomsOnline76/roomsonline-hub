# Specials Not Applying: Root Cause Is Date/Stay Constraints, Not UUID Bridging

## Finding

The UUID→legacy ID bridging code from the last fix IS correctly in place, but it is **never reached** because both specials are filtered out earlier:


| Special              | Why it's excluded                                                    | Stage                  |
| -------------------- | -------------------------------------------------------------------- | ---------------------- |
| Early Bird (15% off) | Stay window is June 1 – July 15; booking is April 22–24 — no overlap | DB query (line 1592)   |
| Pensioner (40% off)  | Requires min 4-night stay; booking is 2 nights                       | Code check (line 1616) |


The `SpecialsBanner` (the UI cards the user sees) uses a **different, more permissive query** — it shows specials where **today** falls in either the booking window or stay window. So both specials appear in the banner as advertising, but correctly don't apply to this particular booking.

## The Real Problem

The calculation query (line 1590-1593) only checks if the **stay dates** overlap with `valid_from`/`valid_to`. It does **not** consider `book_from`/`book_until` at all. This means:

- A special with a booking window matching today but a future stay window will show in the banner but never apply to a current-dates booking.

## Proposed Fix [This fix I do not think address all the issues: the early bird is show as avilible but not applied. it is like the stacking is again ignored and showing some specails/packages are excluding others] Before applying this fix first check that this is not the real issue again]

Align the calculation query with the banner logic: a special should apply if the stay dates overlap the valid period **OR** if today is within the booking window and the stay dates overlap.

More practically, the fix is to also fetch specials where today is within `book_from`–`book_until`, then let the downstream code decide applicability:

### In `src/pages/Booking.tsx` (line 1587-1593)

Replace the single DB query with one that also fetches specials in the booking window:

```typescript
// Fetch specials where stay dates overlap valid period
// OR today is within the booking window
const todayStr = new Date().toISOString().split('T')[0];
const { data: specials } = await supabase
  .from("property_specials")
  .select("*")
  .eq("property_id", property.id)
  .eq("is_active", true)
  .or(
    `and(valid_from.lte.${bookingCheckOut},valid_to.gte.${bookingCheckIn}),` +
    `and(book_from.lte.${todayStr},book_until.gte.${todayStr})`
  );
```

Then add a downstream check: if the special was fetched via booking window only (stay doesn't overlap), still apply the discount — the intent is "book now, get the deal."

### To properly test the UUID bridging

Change the "Early Bird" special's `valid_from` to a date before April 22 (e.g., `2026-04-01`) so it passes the date filter, then verify the 15% discount appears in the calculation. This will confirm the bridge map works.

## Files Changed


| File                    | Change                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/Booking.tsx` | Update specials query to also fetch specials within booking window (book_from/book_until); keep all downstream matching logic |
