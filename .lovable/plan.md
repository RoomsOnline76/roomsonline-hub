
# Add Rentals United API Card to Integrations

## Summary

Add Rentals United to the Integrations page (AdminKeys) as a PMS card and add it to the Supporting Systems database.

---

## Changes Required

### 1. Add Rentals United Card to AdminKeys.tsx

Insert a placeholder PMS card for Rentals United in the Property Management Systems section, positioned alphabetically between NightsBridge and RoomKey.

**Location**: `src/pages/AdminKeys.tsx` around line 4013

**Add this call**:
```typescript
{renderPlaceholderPMSCard(
  "Rentals United",
  "rentalsunited",
  "Channel manager and distribution platform for vacation rentals",
)}
```

**Updated order will be**:
1. Benson
2. Checkfront
3. Cloudbeds
4. Guesty (placeholder)
5. Hostfully
6. HotelBeds
7. Little Hotelier
8. NightsBridge
9. **Rentals United (new - placeholder)**
10. RoomKey (placeholder)
11. RoomRaccoon (placeholder)

---

### 2. Add Rentals United to Supporting Systems

Insert a record into the `supporting_systems` table via the database.

**Fields**:
| Field | Value |
|-------|-------|
| system_name | Rentals United |
| system_url | https://www.rentalsunited.com |
| category | pms |
| system_function | Channel manager and distribution platform for vacation rentals |
| is_active | false |

---

## Technical Details

### File Modified
- `src/pages/AdminKeys.tsx` - Add one line to render Rentals United placeholder card

### Database Insert
- Insert new row into `supporting_systems` table

### Why Placeholder Card?
The `pmsSystemsConfig.ts` already has `hasCustomCard: true` for Rentals United, but since the integration is still "In Development" (per the edge function), using the placeholder pattern is appropriate. When the integration is ready, a custom card similar to Hostfully/HotelBeds can be created.

---

## Visual Result

After implementation:
- Rentals United will appear in the PMS Integrations accordion with:
  - "Not Available" badge
  - Integration status dropdown
  - PMS tracker status display
  - Contact details section
  - Dev notes section
- It will also appear in Supporting Systems under the "pms" category
