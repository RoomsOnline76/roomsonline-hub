
# Fix Bookings Dashboard: Sorting, Timestamps, Reference Numbers, and Search

## Summary

Four issues to address on the `/admin/bookings` dashboard:

1. **Sort Order**: Change from check-in date to booking creation date (newest first)
2. **Add "Booked" Column**: Display when each booking was made (date/time)
3. **Reference Number Mismatch**: Dashboard shows 6 chars but email shows 8 chars + uppercase
4. **Search by Reference**: Enable searching by both internal reference and external reservation ID

---

## Issue 1: Sort by Creation Date

### Current Behavior
- Bookings sorted by `check_in_date` descending
- Most recent check-in dates appear first

### Required Change
- Sort by `created_at` descending
- Most recently created bookings appear first

**Files affected:** `src/pages/Bookings.tsx`
- Line 254: Change query order for internal bookings
- Line 276: Change query order for PMS reservations
- Lines 374-376: Change final sort comparator

---

## Issue 2: Add "Booked At" Column

### Required Change
Add a new column between "Status" and "Ref" showing when the booking was created.

**Display format:** `dd MMM HH:mm` (e.g., "27 Jan 07:21")

**Files affected:** `src/pages/Bookings.tsx`
- Add column header "Booked" to table header row
- Add cell displaying formatted `created_at` timestamp

---

## Issue 3: Reference Number Mismatch

### Root Cause Analysis
Looking at the screenshot:
- **Email shows:** `197268BE` (8 characters, uppercase)
- **Dashboard shows:** `197268` (only 6 characters)

The email template uses:
```typescript
booking.id.substring(0, 8).toUpperCase()
```

The dashboard uses:
```typescript
booking.id.slice(0, 6)  // Line 797
```

**This is a 2-character discrepancy!**

### Required Changes

**1. Dashboard display (`src/pages/Bookings.tsx` line 797):**
Change from:
```typescript
booking.external_reservation_id || booking.id.slice(0, 6)
```
To:
```typescript
booking.external_reservation_id || booking.id.slice(0, 8).toUpperCase()
```

This ensures the dashboard shows the exact same reference number as the confirmation email.

---

## Issue 4: Search by Reference Number

### Current Behavior
Search only checks:
- `guest_name`
- `guest_email`
- `property_name`
- `external_reservation_id`

### Required Change
Add search against the booking's internal ID (first 8 characters, case-insensitive).

**Files affected:** `src/pages/Bookings.tsx` (lines 404-411)

Update search filter to also match:
```typescript
booking.id.toLowerCase().startsWith(term)
```

Update search placeholder from "Guest, email..." to "Guest, email, ref..."

---

## Technical Implementation

### File: `src/pages/Bookings.tsx`

#### Change 1: Sort by created_at (Line 254)
```typescript
// Before
.order("check_in_date", { ascending: false });

// After  
.order("created_at", { ascending: false });
```

#### Change 2: Sort PMS reservations by created_at (Line 276)
```typescript
// Before
.order("arrival_date", { ascending: false });

// After
.order("created_at", { ascending: false });
```

#### Change 3: Update final sort (Lines 374-376)
```typescript
// Before
allBookings.sort((a, b) => 
  new Date(b.check_in_date).getTime() - new Date(a.check_in_date).getTime()
);

// After
allBookings.sort((a, b) => {
  const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
  const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
  return dateB - dateA;
});
```

#### Change 4: Add "Booked" column header (after line 746)
```tsx
<TableHead className="py-1.5 px-2 text-xs">Status</TableHead>
<TableHead className="py-1.5 px-2 text-xs">Booked</TableHead>  {/* NEW */}
<TableHead className="py-1.5 px-2 text-xs">Ref</TableHead>
```

#### Change 5: Add "Booked" column cell (after line 794)
```tsx
<TableCell className="py-1.5 px-2">
  {getStatusIndicator(booking.status)}
</TableCell>
<TableCell className="py-1.5 px-2 text-muted-foreground text-xs whitespace-nowrap">
  {booking.created_at 
    ? format(parseISO(booking.created_at), "dd MMM HH:mm")
    : "—"}
</TableCell>
<TableCell className="py-1.5 px-2 text-muted-foreground truncate max-w-[70px]">
  {booking.external_reservation_id || booking.id.slice(0, 8).toUpperCase()}
</TableCell>
```

#### Change 6: Fix reference display (Line 797)
```typescript
// Before
{booking.external_reservation_id || booking.id.slice(0, 6)}

// After
{booking.external_reservation_id || booking.id.slice(0, 8).toUpperCase()}
```

#### Change 7: Enhance search filter (Lines 404-411)
```typescript
// Before
result = result.filter(booking => 
  booking.guest_name.toLowerCase().includes(term) ||
  booking.guest_email.toLowerCase().includes(term) ||
  booking.property_name?.toLowerCase().includes(term) ||
  booking.external_reservation_id?.toLowerCase().includes(term)
);

// After
result = result.filter(booking => {
  const internalRef = booking.id.slice(0, 8).toLowerCase();
  return (
    booking.guest_name.toLowerCase().includes(term) ||
    booking.guest_email.toLowerCase().includes(term) ||
    booking.property_name?.toLowerCase().includes(term) ||
    booking.external_reservation_id?.toLowerCase().includes(term) ||
    internalRef.startsWith(term)
  );
});
```

#### Change 8: Update search placeholder (Line 688)
```typescript
// Before
placeholder="Guest, email..."

// After
placeholder="Guest, email, ref..."
```

---

## Expected Results

| Issue | Before | After |
|-------|--------|-------|
| Sort order | By check-in date | By booking creation (newest first) |
| Booked column | Not shown | Shows "27 Jan 07:21" format |
| Reference display | `197268` (6 chars) | `197268BE` (8 chars, uppercase) |
| Search | Can't find by ref | Finds `197268BE` when searching `197268` |

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/pages/Bookings.tsx` | Sort by created_at, add Booked column, fix reference display (8 chars + uppercase), enhance search to include reference number |
