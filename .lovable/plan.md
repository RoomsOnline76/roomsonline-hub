
# Journey Review: Destination Map with Nearby Attractions

## Overview

Enhance the Journey Review page to display an interactive map with nearby attractions and eateries for each property in the itinerary. This creates the start of the "travel brochure" experience, giving guests a preview of what awaits them at each destination.

## Current State

The Journey Review page currently shows:
- A simple timeline visualization with property names and dates
- StayCards with property images, dates, and pricing
- Guest details form
- Price summary

It lacks any visual representation of what guests will experience at each destination.

## Proposed Enhancement

Add a **"Destination Discovery"** map section below each StayCard that displays:
1. Interactive Google Map showing the property location
2. Nearby attractions from the `local_experiences` table (nature, culture, adventure, wellness)
3. Restaurant/dining recommendations
4. A legend with clickable items for details

This transforms the journey review from a transactional checkout into an aspirational travel brochure preview.

## Architecture

```text
┌─────────────────────────────────────────────────────┐
│                 JourneyReview.tsx                   │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │            TimelineVisualizer                 │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │                 StayCard                      │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │      NEW: JourneyDestinationMap         │  │  │
│  │  │  - Property pin (pink)                  │  │  │
│  │  │  - Attractions (colored dots)           │  │  │
│  │  │  - Legend with categories               │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────┐            │
│  │        Guest Details / Checkout     │            │
│  └─────────────────────────────────────┘            │
└─────────────────────────────────────────────────────┘
```

## Data Flow

1. **JourneyReview** iterates over `stays` from `ItineraryContext`
2. For each stay, we need to fetch:
   - Property coordinates (latitude, longitude, city, country)
   - Local experiences from `local_experiences` table
3. Display map with property marker and experience markers

## Implementation Plan

### 1. Create New Component: `JourneyDestinationMap.tsx`

**Location:** `src/components/journey/JourneyDestinationMap.tsx`

A compact, travel-brochure-style map component that:
- Displays property location with pink ROL pin
- Shows up to 5 curated experiences from `local_experiences`
- Uses grayscale map styling (matching InvitationMap)
- Has a collapsible legend showing experience details
- Includes "Why locals love it" tooltip on hover

**Key Features:**
- Fetches property coordinates and local_experiences via React Query
- Graceful loading/error states
- Category-based icons (nature, dining, culture, adventure, wellness)
- Compact design suitable for inline display within StayCard

### 2. Extend ItineraryStay Interface

Add optional fields to track property location:

```typescript
export interface ItineraryStay {
  // ... existing fields
  property_latitude?: number | null;
  property_longitude?: number | null;
  property_city?: string;
  property_country?: string;
}
```

### 3. Modify StayCard Component

Add the `JourneyDestinationMap` below the room breakdown:

```typescript
// After room breakdown, before actions
{stay.property_id && (
  <JourneyDestinationMap
    propertyId={stay.property_id}
    propertyName={stay.property_name}
    compact={true}
  />
)}
```

### 4. Update Journey Export Index

```typescript
export { JourneyDestinationMap } from './JourneyDestinationMap';
```

## Component Design: JourneyDestinationMap

```text
┌──────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────┐   │
│  │           [Google Map - Grayscale]            │   │
│  │                                               │   │
│  │     [●] Property (pink)                       │   │
│  │     [●] Nature attraction (green)             │   │
│  │     [●] Restaurant (orange)                   │   │
│  │     [●] Culture (purple)                      │   │
│  │                                               │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  Nearby Experiences                                  │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🌿 Robberg Nature Reserve     [8.5km]        │    │
│  │    "Locals love the secret swimming spot"    │    │
│  ├─────────────────────────────────────────────┤    │
│  │ 🍷 The Fat Fish Restaurant    [5km]          │    │
│  │    "Farm-to-table with ocean views"          │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/journey/JourneyDestinationMap.tsx` | Create | New map component with experiences |
| `src/components/journey/index.ts` | Modify | Export new component |
| `src/components/journey/StayCard.tsx` | Modify | Integrate map below room details |
| `src/contexts/ItineraryContext.tsx` | Modify | Add location fields to ItineraryStay |

## Technical Details

### Data Fetching (React Query)

```typescript
const { data: propertyData } = useQuery({
  queryKey: ['journey-property-location', propertyId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('public_properties')
      .select('latitude, longitude, city, country')
      .eq('id', propertyId)
      .single();
    if (error) throw error;
    return data;
  },
  enabled: !!propertyId,
});

const { data: experiences } = useQuery({
  queryKey: ['journey-experiences', propertyId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('local_experiences')
      .select('*')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .order('display_order')
      .limit(5);
    if (error) throw error;
    return data;
  },
  enabled: !!propertyId,
});
```

### Category Styling

```typescript
const categoryConfig = {
  nature: { icon: TreePine, color: '#22c55e', label: 'Nature' },
  culture: { icon: Palette, color: '#8b5cf6', label: 'Culture' },
  dining: { icon: Utensils, color: '#f97316', label: 'Dining' },
  adventure: { icon: Mountain, color: '#3b82f6', label: 'Adventure' },
  wellness: { icon: Heart, color: '#ec4899', label: 'Wellness' },
};
```

### Map Styling

Reuse the grayscale editorial map styling from `InvitationMap.tsx` for consistency.

## User Experience

1. User adds stays to journey and navigates to `/journey/review`
2. Each StayCard shows the property image and booking details
3. Below the price breakdown, an expandable "Discover" section shows:
   - A compact map with the property and nearby attractions
   - A list of curated experiences with distances and local tips
4. This creates anticipation and validates the booking choice
5. Serves as a preview of the full PDF brochure they'll receive after booking

## Edge Cases

- **No coordinates**: Show a fallback "Explore {city}" message without map
- **No local experiences**: Hide the experiences list, show map only
- **Loading state**: Show skeleton while fetching
- **Multiple stays**: Each StayCard has its own independent map and experiences

## Future Enhancements (Not in Scope)

- Click-to-add experience to special requests
- Expandable details modal for each experience
- Route visualization between stays (for multi-property journeys)
- Print/share journey preview as mini-brochure
