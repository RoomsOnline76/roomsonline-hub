

# Enrich Portfolio Map with Labels & Nearby Attractions

## What Changes

The `EmbedPortfolioMap` currently shows plain colored dots for properties with no labels and no nearby points of interest. The `InvitationMap` (property showcase) already has the full pattern: Google Places nearby search for 4 attractions + 1 eatery, colored markers, legend with tooltips, and grayscale styling.

We will port the attractions/eatery discovery pattern from `InvitationMap` into `EmbedPortfolioMap`, and add floating name labels to each property pin.

## Implementation

### 1. `src/components/embed/EmbedPortfolioMap.tsx`

**Property labels**: After creating each property's `AdvancedMarkerElement`, add a second `AdvancedMarkerElement` below/beside it as a label — a styled `<div>` with the property name in white text on a dark semi-transparent pill. This gives each pin a persistent visible name.

**Nearby attractions**: After all property markers are placed, compute the geographic center of the portfolio. Use `google.maps.places.PlacesService.nearbySearch` (same pattern as InvitationMap) to fetch:
- 4 `tourist_attraction` results within 3km of center, filtered by rating >= 4.0 and >= 10 reviews
- 1 `restaurant` result within 2km, filtered by rating >= 4.0 and >= 20 reviews

Render each as a colored circle marker (using the existing `ATTRACTION_COLORS` palette). Keep markers in colour against the already-greyscale map.

**Legend**: Add a legend row below the map (like InvitationMap does) showing the 5 attraction names with colored dots. Each is wrapped in a tooltip showing rating, vicinity, and a "View on Maps" link.

**InfoWindows**: Clicking an attraction marker opens an InfoWindow with name, rating stars, type label (eatery badge), and Google Maps link.

**Libraries**: Change the script `libraries=marker` to `libraries=marker,places` to enable Places API.

### 2. No other files need changes

The portfolio page (`EmbedPortfolio.tsx`) already passes the correct props. The map styles are already greyscale. This is a self-contained enhancement to one component.

## Files to Change

| File | Change |
|------|--------|
| `src/components/embed/EmbedPortfolioMap.tsx` | Add property name labels, nearby attractions search, attraction markers, legend with tooltips, load Places library |

