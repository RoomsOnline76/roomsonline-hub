
# Fix Property Pulse: Recent Bookings & Pie Chart Labels

## Summary

Two distinct issues need to be fixed on the Property Pulse (Dashboard) page:

1. **Recent Bookings Not Showing New Hostfully Bookings** - Bookings are fetched but not sorted before displaying
2. **Truncated Pie Chart Labels** - Property names are hardcoded to truncate at 8 characters

---

## Problem 1: Recent Bookings Not Displaying Correctly

### Root Cause
The "Recent" bookings section displays bookings using `.slice(0, 4)` without first sorting by `created_at`. This means the 4 displayed bookings are in arbitrary order from the database query, not the most recent ones.

**Current Code (Line 1460):**
```javascript
{displayBookings.slice(0, drillDownDate ? 15 : 4).map((booking) => {
```

The Hostfully bookings ARE in the database (confirmed via query showing 15+ bookings from today), but they may not appear in the first 4 results because no sorting is applied.

### Solution
Sort `displayBookings` by `created_at` descending before slicing:

```javascript
{displayBookings
  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  .slice(0, drillDownDate ? 15 : 4)
  .map((booking) => {
```

---

## Problem 2: Truncated Pie Chart Labels

### Root Cause
Both pie charts (Revenue by Property and Bookings by Property) have hardcoded label truncation at 8 characters:

**Lines 1589 & 1620:**
```javascript
label={({ name, percent }) => `${name.substring(0, 8)}${name.length > 8 ? '..' : ''} ${(percent * 100).toFixed(0)}%`}
```

This makes property names like "Victorian House (Sample)" appear as "Victoria.. 45%".

### Solution
Increase the truncation limit from 8 to 15 characters, which balances readability with chart space:

```javascript
label={({ name, percent }) => `${name.substring(0, 15)}${name.length > 15 ? '..' : ''} ${(percent * 100).toFixed(0)}%`}
```

**Alternatively**, use a tooltip-only approach (no inline label) for better clarity on crowded charts.

---

## File Changes

| File | Line(s) | Change |
|------|---------|--------|
| `src/pages/Dashboard.tsx` | 1460 | Add `.sort()` before `.slice()` to order by most recent |
| `src/pages/Dashboard.tsx` | 1589 | Increase label truncation from 8 to 15 characters |
| `src/pages/Dashboard.tsx` | 1620 | Increase label truncation from 8 to 15 characters |

---

## Technical Implementation

### Change 1: Sort Recent Bookings (Line 1460)

**Before:**
```javascript
{displayBookings.slice(0, drillDownDate ? 15 : 4).map((booking) => {
```

**After:**
```javascript
{[...displayBookings]
  .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  .slice(0, drillDownDate ? 15 : 4)
  .map((booking) => {
```

Note: Using `[...displayBookings]` to avoid mutating the original array.

### Change 2: Revenue Pie Chart Label (Line 1589)

**Before:**
```javascript
label={({ name, percent }) => `${name.substring(0, 8)}${name.length > 8 ? '..' : ''} ${(percent * 100).toFixed(0)}%`}
```

**After:**
```javascript
label={({ name, percent }) => `${name.substring(0, 15)}${name.length > 15 ? '..' : ''} ${(percent * 100).toFixed(0)}%`}
```

### Change 3: Bookings Pie Chart Label (Line 1620)

Same change as above - increase from 8 to 15 characters.

---

## Expected Results

After implementation:
- **Recent Bookings**: Will show the 4 most recently created bookings, including new Hostfully bookings
- **Pie Charts**: Property labels will show up to 15 characters (e.g., "Victorian Hous.." instead of "Victoria..")

---

## Data Verification

Database query confirmed the bookings exist:
- 15+ Hostfully test bookings from 2026-01-26
- Property ID: `1a4d3334-16ec-4554-b228-e3e552c1cad8`
- Property Name: "[SANDBOX] Victorian House (Sample)"
- Property is active and belongs to `marketing@fluent.sandbox.co.za`

The issue is purely a frontend sorting/display problem, not a data fetch issue.
