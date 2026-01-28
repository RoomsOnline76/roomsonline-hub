
# Enhanced Table Search Implementation

## Overview
This plan implements comprehensive column-searchable tables across all admin dashboard pages. The search functionality will allow filtering across all visible columns instead of just name/email fields.

## Pages Requiring Updates

### 1. AdminUsers.tsx (Priority: HIGH)
**Current State:** Search only filters by `full_name` and `email`
**Enhancement:** Add search across all table columns

**Columns to include in search:**
- User name (full_name)
- Email
- Role (admin, dev, user, fearless_leader)
- PMS system type names
- Property count (as string)
- Joined date (formatted)

**Implementation:**
- Update filter logic in useEffect (lines 173-184) to include role matching and PMS system searching

---

### 2. Bookings.tsx (Priority: MEDIUM)
**Current State:** Good coverage but missing some fields
**Enhancement:** Add status and date-based search

**Add to search:**
- Status field (confirmed, pending, cancelled)
- Check-in date (formatted)
- Check-out date (formatted)
- Room/rate type name

---

### 3. AdminReviewQueue.tsx (Priority: MEDIUM)
**Current State:** Searches name and owner only
**Enhancement:** Add listing_intent and listing_status search

**Add to search:**
- Listing intent (accommodation, venue, hybrid, experience)
- Listing status labels (Pending Review, Ready to Activate, etc.)
- Property type

---

### 4. AdminPayments.tsx (Priority: HIGH)
**Current State:** No search functionality
**Enhancement:** Add full table search capability

**Add search input with filter across:**
- Date (formatted)
- Guest name
- Property name
- Payment method
- Amount (as string)
- Status (completed, pending, failed)

---

### 5. AdminContracts.tsx (Priority: MEDIUM)
**Current State:** Searches owner email and name only
**Enhancement:** Extend search to status and version

**Add to search:**
- Status label (Signed, Pending, Sent, Viewed, Overridden)
- Version number (as string)
- Template version

---

### 6. AdminOnboarding.tsx (Priority: MEDIUM)
**Current State:** Searches property name and owner email
**Enhancement:** Add status search

**Add to search:**
- Status (active, expired, used)
- Token expiry date (formatted)
- Created date (formatted)

---

### 7. AdminAccessRequests.tsx (Priority: HIGH)
**Current State:** No search functionality
**Enhancement:** Add full table search

**Add search input with filter across:**
- Full name
- Email
- Message content
- Status (pending, approved, declined)
- Submitted date (formatted)

---

### 8. AdminJournals.tsx (Priority: MEDIUM)
**Current State:** No search functionality
**Enhancement:** Add full table search

**Add search input with filter across:**
- Title
- Status (Published, Draft)
- Publish date (formatted)
- Last updated date (formatted)

---

## Technical Approach

### Shared Search Pattern
Each table will use a consistent search pattern:

```typescript
const filteredItems = useMemo(() => {
  if (!searchTerm.trim()) return items;
  
  const term = searchTerm.toLowerCase();
  return items.filter(item => {
    // Check all searchable fields
    return (
      item.field1?.toLowerCase().includes(term) ||
      item.field2?.toLowerCase().includes(term) ||
      format(new Date(item.date), "MMM d, yyyy").toLowerCase().includes(term) ||
      String(item.numericField).includes(term)
      // ... additional fields
    );
  });
}, [items, searchTerm]);
```

### UI Consistency
- All search inputs will use the existing design pattern with Search icon
- Placeholder text: "Search all columns..." or "Search [entity]..."
- Position: Consistent placement in filter bar area

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/AdminUsers.tsx` | Extend filter logic (~lines 173-184) |
| `src/pages/Bookings.tsx` | Extend filteredBookings logic (~lines 395-421) |
| `src/pages/AdminReviewQueue.tsx` | Extend filteredProperties logic (~lines 114-134) |
| `src/pages/AdminPayments.tsx` | Add search state + filter logic + search input UI |
| `src/pages/AdminContracts.tsx` | Extend filteredContracts logic (~lines 186-196) |
| `src/pages/AdminOnboarding.tsx` | Extend filteredTokens logic (~lines 155-172) |
| `src/pages/AdminAccessRequests.tsx` | Add search state + filter logic + search input UI |
| `src/pages/AdminJournals.tsx` | Add search state + filter logic + search input UI |

---

## Implementation Order

1. **Phase 1 - Pages without search** (highest impact):
   - AdminPayments.tsx
   - AdminAccessRequests.tsx  
   - AdminJournals.tsx

2. **Phase 2 - Extend existing search**:
   - AdminUsers.tsx (priority based on user request)
   - AdminContracts.tsx
   - AdminOnboarding.tsx

3. **Phase 3 - Enhanced coverage**:
   - AdminReviewQueue.tsx
   - Bookings.tsx

---

## Expected Outcome
- Users can search any visible column content across all admin tables
- Consistent search UX pattern throughout the admin interface
- Improved data discovery and filtering efficiency
- Search includes formatted dates and status labels for intuitive filtering
