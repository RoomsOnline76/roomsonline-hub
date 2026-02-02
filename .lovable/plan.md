

# Add 350km Radius Filter to Property Recommendations

## Problem
The "You Might Also Love" section currently shows properties from anywhere in the portfolio, regardless of distance. This creates poor UX - recommending a property in Knysna when someone is booking in Cape Town is unhelpful (550km+ away). Users want to see nearby alternatives.

## Solution
Add geographical distance filtering to only show properties within a 350km radius of the currently viewed property. If no properties exist within that radius, hide the entire section.

---

## Implementation Details

### File to Modify
`src/components/booking/PropertyRecommendations.tsx`

### Changes Required

#### 1. Add Haversine Distance Calculation Function
Add a utility function to calculate distance between two coordinate pairs:

```typescript
// Haversine formula to calculate distance between two points in km
const calculateDistanceKm = (
  lat1: number, lon1: number, 
  lat2: number, lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
```

#### 2. Fetch Current Property Coordinates
Before fetching recommendations, get the current property's latitude/longitude:

```typescript
// First, get current property's coordinates
let currentLat: number | null = null;
let currentLng: number | null = null;

if (currentPropertyId) {
  const { data: currentProperty } = await supabase
    .from('public_properties')
    .select('latitude, longitude')
    .eq('id', currentPropertyId)
    .single();
  
  if (currentProperty) {
    currentLat = currentProperty.latitude;
    currentLng = currentProperty.longitude;
  }
}
```

#### 3. Include Coordinates in Candidate Query
Update the query to include `latitude, longitude` in the SELECT:

```typescript
let query = supabase
  .from('public_properties')
  .select('id, name, slug, city, country, price_per_night, images, amenities, latitude, longitude')
  .eq('is_active', true)
  .not('latitude', 'is', null)  // Only properties with coordinates
  .not('longitude', 'is', null)
  .limit(50); // Fetch more for distance filtering
```

#### 4. Filter by Distance
After fetching, filter properties to only those within 350km:

```typescript
const RADIUS_KM = 350;

// Filter by distance if current property has coordinates
let nearbyProperties = properties;
if (currentLat && currentLng) {
  nearbyProperties = properties.filter(p => {
    if (!p.latitude || !p.longitude) return false;
    const distance = calculateDistanceKm(currentLat, currentLng, p.latitude, p.longitude);
    return distance <= RADIUS_KM;
  });
}

// If no nearby properties, return empty (section will be hidden)
if (nearbyProperties.length === 0) {
  setRecommendations([]);
  return;
}
```

#### 5. Update Fallback Logic
Remove the fallback that shows ANY active properties - if nothing is nearby, show nothing:

```typescript
// REMOVE this fallback - we don't want to show distant properties
// if (!properties || properties.length === 0) {
//   const { data: fallbackProperties } = await supabase...
// }

// NEW: Just set empty and return
if (!nearbyProperties || nearbyProperties.length === 0) {
  setRecommendations([]);
  return;
}
```

#### 6. Add Distance to Match Reason
Optionally show approximate distance in the recommendation reason:

```typescript
// In scoring logic
const distance = calculateDistanceKm(currentLat, currentLng, p.latitude, p.longitude);
let reason = distance < 50 
  ? `${Math.round(distance)}km away` 
  : `About ${Math.round(distance / 10) * 10}km away`;
```

---

## Flow Summary

```text
User views property in Still Bay
         ↓
Fetch Still Bay property coordinates (-34.38, 21.40)
         ↓
Fetch all active properties with coordinates
         ↓
Calculate distance to each property
         ↓
Filter: keep only properties ≤ 350km
         ↓
If 0 nearby properties → Hide section entirely
         ↓
If 1+ nearby properties → Show "You Might Also Love"
```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Current property has no coordinates | Show no recommendations (section hidden) |
| Candidate property has no coordinates | Exclude from recommendations |
| No properties within 350km | Section hidden entirely |
| Only 1 property within 350km | Show just that one |
| Property viewing itself | Already excluded via `currentPropertyId` filter |

---

## Technical Notes

- The Haversine formula provides accurate "as the crow flies" distance
- 350km is approximately 3-4 hours driving - a reasonable "nearby destination" radius
- Properties without coordinates are excluded to ensure accuracy
- The distance calculation is done client-side to avoid complex PostGIS queries
- Fetching 50 candidates and filtering locally is efficient for the expected portfolio size

