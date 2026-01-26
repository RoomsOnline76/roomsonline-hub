

# Fix Hostfully Status Enum Value

## Problem

The `status` field in the Hostfully lead payload is set to `'INQUIRY'`, which is **not a valid enum value**.

**Error:** `"Wrong enum value, allowed values are: NEW, CANCELLED, IGNORED, PENDING, BOOKED, SAMPLE, DUPLICATE, CLOSED, DECLINED, PENDING_APPROVED, BLOCKED, ON_HOLD"`

## Root Cause

The Hostfully Leads API has a specific set of allowed status values, and `INQUIRY` is not one of them. This was an incorrect assumption based on the previous error message.

## Solution

Change the `status` field from `'INQUIRY'` to `'NEW'` which represents a new booking/inquiry in Hostfully's system.

| File | Changes |
|------|---------|
| `supabase/functions/push-booking/index.ts` | Change `status: 'INQUIRY'` to `status: 'NEW'` |

---

## Technical Change

**File:** `supabase/functions/push-booking/index.ts`

**Line 1279 - Current Code:**
```typescript
status: 'INQUIRY',
```

**Fixed Code:**
```typescript
status: 'NEW',
```

---

## Hostfully Status Values Reference (Corrected)

| Status | Meaning |
|--------|---------|
| `NEW` | New lead/inquiry (use this for new bookings) |
| `PENDING` | Awaiting action |
| `PENDING_APPROVED` | Approved but pending confirmation |
| `BOOKED` | Confirmed booking |
| `CANCELLED` | Cancelled |
| `DECLINED` | Declined by property |
| `CLOSED` | Closed lead |
| `BLOCKED` | Blocked dates |
| `ON_HOLD` | On hold |
| `IGNORED` | Ignored lead |
| `DUPLICATE` | Duplicate entry |
| `SAMPLE` | Sample/test data |

Using `NEW` is appropriate because:
1. It represents a fresh booking inquiry
2. Property owner can then change status to `BOOKED` or other states
3. It correctly signals a new lead entering the system

---

## Expected Result

After this fix:
- Hostfully API accepts the lead creation request
- Lead is created in Hostfully with status "NEW"
- Booking succeeds and user sees confirmation page

