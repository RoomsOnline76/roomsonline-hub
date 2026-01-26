

# Display Nearby Attractions on Property Showcase Map

## Overview

Enhance the `InvitationMap` component to display the 5 highest-rated tourist attractions near the property using Google Maps Places API, with color-coded pins and clean CTA labels.

## Technical Approach

### Data Source
Use Google Maps Places API `nearbySearch` with:
- Location: Property coordinates
- Radius: 2000 meters (adjustable)
- Type: `tourist_attraction`
- Sort by: Rating (descending)
- Filter: Only places with ratings and minimum 10 reviews

### Visual Design

**Attraction Pin Colors** (muted to complement grayscale map):
| Rank | Color | Hex |
|------|-------|-----|
| 1st | Gold | `#D4AF37` |
| 2nd | Silver | `#A0A0A0` |
| 3rd | Bronze | `#CD7F32` |
| 4th | Teal | `#4DB6AC` |
| 5th | Indigo | `#7986CB` |

**Pin Size**: Smaller than property pin (scale: 7 vs 10) to maintain visual hierarchy

**CTA Labels**: Use Google Maps `InfoWindow` on hover (not permanent labels) to avoid overcrowding. Each InfoWindow shows:
- Attraction name (truncated to 25 chars)
- Rating stars
- "View on Google" link (optional)

### Implementation Details

**State Addition**:
```typescript
const [attractions, setAttractions] = useState<google.maps.places.PlaceResult[]>([]);
const attractionMarkersRef = useRef<google.maps.Marker[]>([]);
```

**New useEffect - Fetch Nearby Attractions**:
After map initialization, create a PlacesService and call `nearbySearch`:
1. Request tourist attractions within 2km radius
2. Filter results to only include places with rating and sufficient reviews
3. Sort by rating descending
4. Take top 5
5. Store in state

**New useEffect - Render Attraction Markers**:
When attractions state updates:
1. Clear any existing attraction markers
2. For each attraction, create a smaller colored marker
3. Add hover listener to show InfoWindow with attraction name + rating
4. Add click listener to open Google Maps page for the attraction

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/showcase/InvitationMap.tsx` | Add Places API integration, attraction markers, and hover InfoWindows |

## Code Changes

### 1. Add New State & Refs

```typescript
const [attractions, setAttractions] = useState<google.maps.places.PlaceResult[]>([]);
const attractionMarkersRef = useRef<google.maps.Marker[]>([]);
const attractionInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);
```

### 2. Add Attraction Colors Constant

```typescript
const ATTRACTION_COLORS = ['#D4AF37', '#A0A0A0', '#CD7F32', '#4DB6AC', '#7986CB'];
```

### 3. Add useEffect to Fetch Attractions

After map initialization, call Places API:

```typescript
useEffect(() => {
  if (!mapInstanceRef.current || !mapsLoaded || !hasCoordinates) return;
  if (!window.google?.maps?.places) return;

  const service = new google.maps.places.PlacesService(mapInstanceRef.current);
  const request: google.maps.places.PlaceSearchRequest = {
    location: { lat: Number(latitude), lng: Number(longitude) },
    radius: 2000,
    type: 'tourist_attraction',
  };

  service.nearbySearch(request, (results, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK && results) {
      const topAttractions = results
        .filter(r => r.rating && r.user_ratings_total && r.user_ratings_total >= 10)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 5);
      
      setAttractions(topAttractions);
    }
  });
}, [mapInstanceRef.current, mapsLoaded, hasCoordinates, latitude, longitude]);
```

### 4. Add useEffect to Render Attraction Markers

```typescript
useEffect(() => {
  if (!mapInstanceRef.current || attractions.length === 0) return;

  // Clear existing attraction markers
  attractionMarkersRef.current.forEach(m => m.setMap(null));
  attractionMarkersRef.current = [];

  // Create shared InfoWindow for hover
  if (!attractionInfoWindowRef.current) {
    attractionInfoWindowRef.current = new google.maps.InfoWindow();
  }

  attractions.forEach((place, index) => {
    if (!place.geometry?.location) return;

    const marker = new google.maps.Marker({
      position: place.geometry.location,
      map: mapInstanceRef.current,
      title: place.name,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: ATTRACTION_COLORS[index],
        fillOpacity: 0.85,
        strokeColor: '#ffffff',
        strokeWeight: 1.5,
        scale: 7,
      },
      zIndex: 100 + index,
    });

    // Create InfoWindow content with rating
    const ratingStars = place.rating ? '★'.repeat(Math.round(place.rating)) : '';
    const displayName = (place.name || '').substring(0, 25) + ((place.name?.length || 0) > 25 ? '...' : '');

    // Show InfoWindow on hover
    marker.addListener('mouseover', () => {
      attractionInfoWindowRef.current?.setContent(`
        <div style="font-family: system-ui, sans-serif; padding: 6px 10px; max-width: 160px;">
          <p style="font-weight: 600; font-size: 12px; margin: 0 0 2px 0; color: #111;">${displayName}</p>
          <p style="font-size: 11px; color: ${ATTRACTION_COLORS[index]}; margin: 0;">${ratingStars} ${place.rating?.toFixed(1) || ''}</p>
        </div>
      `);
      attractionInfoWindowRef.current?.open(mapInstanceRef.current, marker);
    });

    marker.addListener('mouseout', () => {
      attractionInfoWindowRef.current?.close();
    });

    // Click to open in Google Maps
    marker.addListener('click', () => {
      if (place.place_id) {
        window.open(`https://www.google.com/maps/place/?q=place_id:${place.place_id}`, '_blank');
      }
    });

    attractionMarkersRef.current.push(marker);
  });

  // Cleanup on unmount
  return () => {
    attractionMarkersRef.current.forEach(m => m.setMap(null));
  };
}, [attractions]);
```

### 5. Optional: Add Legend Below Map

Add a small legend showing what the colored pins represent:

```tsx
{/* Attractions Legend - below map, subtle */}
{attractions.length > 0 && (
  <div className="flex flex-wrap justify-center gap-3 mt-4 text-xs text-muted-foreground">
    <span className="font-medium">Nearby:</span>
    {attractions.slice(0, 3).map((a, i) => (
      <span key={a.place_id} className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ATTRACTION_COLORS[i] }} />
        {(a.name || '').substring(0, 18)}{(a.name?.length || 0) > 18 ? '...' : ''}
      </span>
    ))}
  </div>
)}
```

## Visual Hierarchy

```text
┌─────────────────────────────────────────────┐
│                                             │
│     ○ (Gold - Top attraction)               │
│                                             │
│           ● (ROL Pink - Property)           │
│                                             │
│  ○ (Silver)              ○ (Bronze)         │
│                                             │
│       ○ (Teal)     ○ (Indigo)               │
│                                             │
├─────────────────────────────────────────────┤
│ Property Name                    -33.91°... │
└─────────────────────────────────────────────┘
 Nearby: ○ Table Mountain  ○ V&A Waterfront...
```

## UX Considerations

1. **No Overcrowding**: Labels only appear on hover via InfoWindow - map stays clean
2. **Visual Hierarchy**: Property pin is larger (scale 10) and uses brand color; attraction pins are smaller (scale 7)
3. **Muted Colors**: Attraction colors complement the grayscale map aesthetic
4. **Click-to-Explore**: Clicking an attraction opens its Google Maps page for more info
5. **Graceful Degradation**: If no attractions found, map displays normally without changes

## Expected Result

1. Map loads with property pin (ROL Pink, large)
2. After ~1 second, 5 smaller colored pins appear for top-rated attractions
3. Hovering over any attraction pin shows a clean tooltip with name and rating
4. Clicking an attraction opens Google Maps in a new tab
5. Optional legend below map shows first 3 attractions with color indicators

