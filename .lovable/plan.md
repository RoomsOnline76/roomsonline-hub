

# Fix Dining Section: Add Google Maps Link + Address Inaccurate Restaurant Data

## Problem Summary

1. **Missing Google Maps Link**: The dining recommendation in the confirmation email/PDF doesn't have a clickable link to find the restaurant
2. **Incorrect Dining Data**: The "Pili Pili Beach Bar & Restaurant" is recorded as being 2.5km from Still Bay, but it's actually located in **Witsand** (~100km away). This is a data error from before the coordinate constraint fix was deployed.

---

## Solution

### Part 1: Add Google Maps Link to Dining Section

**Files to Modify:**
- `supabase/functions/generate-itinerary-pdf/index.ts` - PDF dining section
- `supabase/functions/send-itinerary-email/index.ts` - (if dining is shown in email)

**Implementation:**

Generate a Google Maps search URL using the restaurant name and location:

```typescript
// In generateDiningHTML()
const diningTitle = encodeURIComponent(dining.title);
const searchQuery = property?.city 
  ? encodeURIComponent(`${dining.title}, ${property.city}`)
  : diningTitle;
const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${searchQuery}`;
```

Update the HTML:

```html
<h5 class="dining-name">
  <a href="${mapsUrl}" target="_blank" style="color: inherit; text-decoration: none;">
    ${dining.title} 📍
  </a>
</h5>
```

### Part 2: Fix the Incorrect Dining Record

**Action**: Delete the hallucinated dining record for this property. The next time experiences are regenerated, the new coordinate-aware logic will generate accurate recommendations.

**Database Fix (manual or via SQL):**
```sql
DELETE FROM local_experiences 
WHERE property_id = 'ea9a019d-1299-46eb-b371-a0b25eb60350' 
  AND category = 'dining';
```

**Alternative**: Add a `booking_link` or `maps_url` column to `local_experiences` table to store the Google Maps link directly (for future curated venues).

---

## Implementation Steps

1. **Update `generateDiningHTML()` in generate-itinerary-pdf/index.ts**
   - Accept property context as parameter (for city/location data)
   - Construct Google Maps search URL from dining title + property city
   - Make restaurant name clickable with maps link
   - Add small map pin emoji indicator

2. **Update PDF function call site**
   - Pass property details to `generateDiningHTML()`

3. **Delete the incorrect dining record**
   - Run SQL to remove the Pili Pili record for the Still Bay property

4. **Deploy the updated function**

---

## Technical Details

### generateDiningHTML() Updated Signature

```typescript
// Before
function generateDiningHTML(dining: LocalExperience | undefined): string

// After  
function generateDiningHTML(
  dining: LocalExperience | undefined, 
  propertyCity?: string
): string
```

### Google Maps URL Format

Using the Universal Links format for maximum compatibility:
```
https://www.google.com/maps/search/?api=1&query=Restaurant+Name,+City+Name
```

This opens in the Google Maps app on mobile or the web on desktop.

### Database Schema Note

The `local_experiences` table doesn't have a `maps_url` column currently. For now, we'll dynamically generate the URL. A future enhancement could add this column for manually curated venues with exact addresses.

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/generate-itinerary-pdf/index.ts` | Update `generateDiningHTML()` to include Maps link |
| `local_experiences` table | Delete incorrect "Pili Pili" record for Still Bay property |

---

## Verification

After implementation:
1. Regenerate experiences for the Still Bay property
2. Generate new PDF/email - dining should have clickable Maps link
3. Verify the new dining recommendation is actually in Still Bay (not Witsand)

