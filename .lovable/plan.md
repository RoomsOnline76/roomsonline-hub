

# Fix Property Showcase Map - Embed Real Google Map

## Problem

The `InvitationMap` component on the PropertyShowcase page (`/property/:slug`) displays an **artistic placeholder** (CSS gradient with a pin icon overlay) instead of an actual interactive Google Map. This is by design according to the "Paris Fashion Week" editorial aesthetic, but users expect a functional map they can interact with.

**Current Behavior:** CSS gradient background with animated pin marker (purely decorative)
**Expected Behavior:** Real Google Map centered on property coordinates with a marker

## Solution

Refactor `InvitationMap.tsx` to embed an actual Google Map when coordinates are available, following the same resilient loading pattern used in `PropertyMap.tsx` and `PropertiesMap.tsx`.

### Changes to `src/components/showcase/InvitationMap.tsx`

1. **Import the `useGoogleMapsApiKey` hook** to get the API key from feature flags
2. **Add state management** for map loading (`mapsLoaded`, `mapError`)
3. **Add refs** for the map container and map instance (following the `useRef` pattern to prevent flickering)
4. **Load Google Maps script** when API key is ready
5. **Initialize the map** with grayscale styling to match the editorial aesthetic
6. **Replace the CSS gradient placeholder** with the actual map container
7. **Add graceful fallback** to the artistic placeholder if the map fails to load or API key is missing

### Implementation Details

**New Imports:**
```typescript
import { useEffect, useRef, useState } from 'react';
import { useGoogleMapsApiKey } from '@/hooks/useFeatureFlags';
import { Loader2 } from 'lucide-react';
```

**State & Refs:**
```typescript
const mapRef = useRef<HTMLDivElement>(null);
const mapInstanceRef = useRef<google.maps.Map | null>(null);
const { apiKey, isReady: apiKeyReady } = useGoogleMapsApiKey();
const [mapsLoaded, setMapsLoaded] = useState(false);
const [mapError, setMapError] = useState(false);
```

**Map Initialization (when coordinates exist):**
```typescript
useEffect(() => {
  if (!mapRef.current || !mapsLoaded || !hasCoordinates || mapInstanceRef.current) return;
  
  try {
    const position = { lat: Number(latitude), lng: Number(longitude) };
    
    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: position,
      zoom: 14,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      styles: [
        // Grayscale styling to match editorial aesthetic
        { elementType: "geometry", stylers: [{ saturation: -100 }] },
        // ... (same styling as PropertiesMap)
      ]
    });

    // Create styled marker
    new window.google.maps.Marker({
      position,
      map: mapInstanceRef.current,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: '#e11d48',
        fillOpacity: 0.9,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 10,
      },
      title: propertyName,
    });
  } catch (error) {
    setMapError(true);
  }
}, [mapsLoaded, hasCoordinates, latitude, longitude, propertyName]);
```

**Render Logic:**
```typescript
{hasCoordinates ? (
  <div className="relative aspect-[16/9] max-w-2xl mx-auto mb-8 rounded-xl overflow-hidden border border-border/40">
    {/* Loading state */}
    {(!apiKeyReady || (apiKey && !mapsLoaded)) && !mapError && (
      <div className="absolute inset-0 flex items-center justify-center bg-muted">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )}
    
    {/* Map container - always rendered so ref is available */}
    <div 
      ref={mapRef}
      className={cn(
        "w-full h-full min-h-[200px]",
        (!mapsLoaded || mapError) && "hidden"
      )}
    />
    
    {/* Fallback to artistic placeholder on error or no API key */}
    {(mapError || !apiKey) && (
      // Keep existing artistic placeholder as fallback
    )}
    
    {/* Property info overlay on the map */}
    <div className="absolute bottom-4 left-4 px-3 py-2 bg-background/95 backdrop-blur-sm rounded-lg shadow-md border border-border/50">
      <p className="font-medium text-sm">{propertyName}</p>
      <p className="text-xs text-muted-foreground">{city}, {country}</p>
    </div>
  </div>
) : (
  // Journey Guide fallback (unchanged)
)}
```

### Map Styling

Use the same grayscale styling as `PropertiesMap.tsx` to maintain design consistency:
- Desaturated geometry
- Subdued labels
- Hidden POI icons
- Primary color marker pin (`#e11d48`)

### Fallback Behavior

If the map fails to load (API key missing, script error, etc.), gracefully fall back to the existing artistic placeholder. This ensures the page never appears broken.

## Files Modified

| File | Changes |
|------|---------|
| `src/components/showcase/InvitationMap.tsx` | Add Google Maps integration with loading states, refs, and initialization logic |

## Expected Result

1. PropertyShowcase pages display an actual interactive Google Map in "The Invitation" section
2. Map uses grayscale styling to match the editorial aesthetic
3. Property location is marked with a styled pink pin
4. Property name/location info overlays the map
5. Graceful fallback to artistic placeholder if map fails to load
6. Consistent behavior with other maps in the application

