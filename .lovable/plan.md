

# Fix Specials Not Appearing on Latter Days Checkout

## Root Causes Found

### Bug 1: Early Bird banner not showing — `book_until` is NULL
The Early Bird special has `book_from: 2026-04-01` but `book_until` is NULL. The SpecialsBanner filter (line 43) requires BOTH `book_from` AND `book_until` to be non-null before considering the booking window. So it falls through to stay-window-only check, which fails because today (April) is before the stay window (June-July).

### Bug 2: Room cross-reference fails in auto-apply — neither special applies
The specials have `applicable_room_ids: [1, 1772973704081]` (numeric amenity IDs). The checkout receives `roomTypeId=c8253bc0-...` (Hostfully UUID) and `linked_rolos_id=def44b86-...` (ROL'OS UUID). The code tries to find the amenity room by checking `r.linked_rolos_id`, but this field doesn't exist in the amenity data. All cross-reference paths fail, so **both specials are skipped** due to room mismatch.

### Bug 3: Pensioner banner should show but may work — date-wise it's fine
The Pensioner has a year-long stay window (Jan-Dec 2026), so the banner filter should pass. If it's not showing, it's likely a rendering/mount issue or the query silently fails.

## Fixes

### 1. SpecialsBanner: handle open-ended booking window (line 43)
Change the booking window check to treat `book_from`-only as "from this date onward" and `book_until`-only as "until this date":
```typescript
const inBookWindow =
  (s.book_from || s.book_until)
    ? (!s.book_from || s.book_from <= today) && (!s.book_until || s.book_until >= today)
    : false;
```

### 2. Booking.tsx: fix room cross-reference using URL roomTypeName
Add a name-based fallback to the room matching logic. When the Hostfully UUID and linked_rolos_id don't match any amenity room directly, match the URL's `roomTypeName` parameter against amenity room names:
```typescript
// Add after existing checks (line 1561):
const embedRoomTypeName = searchParams.get('roomTypeName')?.replace(/\+/g, ' ');
if (embedRoomTypeName && r.name === embedRoomTypeName) return true;
```
This connects `roomTypeName=3 Bedroomed Holiday House` → amenity room `id: 1` → matches `applicable_room_ids: [1, ...]`.

### 3. Database: set Early Bird `book_until`
The Early Bird `book_until` is NULL. Set it to a sensible date (e.g., `2026-05-31`) so it has a proper cutoff. The code fix in step 1 handles NULL gracefully, but having a real cutoff is better data.

## Files Changed

| File | Change |
|---|---|
| `src/components/showcase/SpecialsBanner.tsx` | Fix booking window filter to handle NULL book_from/book_until |
| `src/pages/Booking.tsx` | Add roomTypeName-based fallback for room cross-reference |
| Database | Set Early Bird book_until to 2026-05-31 |

