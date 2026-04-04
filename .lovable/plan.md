

# Add GPS Coordinate Editing & Portfolio Map Enhancements

## Problem

1. **Property edit form**: GPS coordinates can only be set via drag-on-map or auto-geocode. There are no manual lat/lng input fields visible alongside the street address — the Google Maps link field only appears when "No street address" is toggled on.
2. **Property showcase page**: The `InvitationMap` only shows the single property. When the property belongs to a portfolio, it should also show sibling properties as secondary pins, zoomed to fit all.
3. **Portfolio page map**: Already works with `fitBounds` — just needs properties to actually have GPS coordinates (which this plan enables editing for).

## Changes

### 1. Property Edit Form — Add GPS Coordinate Fields
**File**: `src/pages/PropertyForm.tsx`

Below the address grid (after the postal code field, around line 5660), add a row with two small input fields for Latitude and Longitude that are **always visible** (not gated by `noStreetAddress`). These fields:
- Show the current `latitude` / `longitude` values
- Allow manual editing (typing exact coordinates)
- Update `setLatitude` / `setLongitude` on change
- Mark form as dirty
- Display alongside a small label like "GPS Override" with a MapPin icon
- Are positioned between the address fields and the map card (or below the address card as a compact row)
- The existing map drag + geocode still works — manual entry is just an additional option

Also: always show the Google Maps link field (not just when `noStreetAddress` is true), so users can paste a Google Maps URL to extract coordinates regardless of whether they have a street address.

### 2. Property Showcase — Show Portfolio Siblings on Map
**File**: `src/pages/PropertyShowcase.tsx`

After fetching the property data, check if it belongs to a portfolio by querying `property_portfolio_members` → `property_portfolios` → sibling properties (with their name, slug, lat, lng, hero image). Pass these siblings as an optional `portfolioProperties` prop to `InvitationMap`.

**File**: `src/components/showcase/InvitationMap.tsx`

Add an optional `siblingProperties` prop (array of `{ name, slug, lat, lng, heroImage }`). When provided:
- Extend the map bounds to include all siblings
- Render secondary markers (smaller, muted color) for each sibling
- Add InfoWindows with property name + "View" link
- Zoom to fit all properties instead of just the single property

### 3. Portfolio Map — Show for 1+ Properties
**File**: `src/components/embed/EmbedPortfolioMap.tsx`

Change the `properties.length < 2` guard to `properties.length < 1` — show the map even for a single property.

## Files to Change

| File | Change |
|------|--------|
| `src/pages/PropertyForm.tsx` | Add always-visible lat/lng input fields + always-visible Google Maps link field below address |
| `src/pages/PropertyShowcase.tsx` | Fetch portfolio siblings; pass to InvitationMap |
| `src/components/showcase/InvitationMap.tsx` | Add `siblingProperties` prop; render secondary markers; extend bounds |
| `src/components/embed/EmbedPortfolioMap.tsx` | Change minimum property count from 2 to 1 |

