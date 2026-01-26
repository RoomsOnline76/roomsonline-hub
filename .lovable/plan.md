
# Fix Hostfully Lead API Field Names

## Problem

The Hostfully Leads API is rejecting the booking request even though dates are being sent. The API returns:
```
"One of ['checkInDateTime', 'checkInDate'] is required"
```

## Root Cause

The Hostfully API expects specific field names that differ from what we're sending:

| Current (Wrong) | Required (Correct) |
|-----------------|-------------------|
| `checkInDateTime` | `checkInLocalDateTime` |
| `checkOutDateTime` | `checkOutLocalDateTime` |

The word **"Local"** is missing from the field names.

## Solution

Update the lead payload field names from `checkInDateTime`/`checkOutDateTime` to `checkInLocalDateTime`/`checkOutLocalDateTime`.

| File | Changes |
|------|---------|
| `supabase/functions/push-booking/index.ts` | Rename date fields to use "Local" suffix |

---

## Technical Details

### File: `supabase/functions/push-booking/index.ts`

**Current Code (line 1279-1280):**
```typescript
checkInDateTime: checkInDateTime,
checkOutDateTime: checkOutDateTime,
```

**Fixed Code:**
```typescript
checkInLocalDateTime: checkInDateTime,
checkOutLocalDateTime: checkOutDateTime,
```

The variable names can stay the same, only the JSON property keys need to change.

---

## Hostfully API Field Reference

From [Hostfully API Docs](https://dev.hostfully.com/reference/createlead):

| Field | Type | Description |
|-------|------|-------------|
| `checkInLocalDate` | date | Check in date (YYYY-MM-DD) |
| `checkInLocalDateTime` | string | Check in with time (YYYY-MM-DDTHH:mm:ss) |
| `checkOutLocalDate` | date | Check out date (YYYY-MM-DD) |
| `checkOutLocalDateTime` | string | Check out with time (YYYY-MM-DDTHH:mm:ss) |

Since we're already formatting with time (e.g., `2026-03-22T14:00:00`), using `checkInLocalDateTime` is correct.

---

## Expected Result

After this fix:
- Hostfully API accepts the lead creation request
- Lead is created successfully with correct check-in/check-out times
- Booking completes and user sees confirmation page
