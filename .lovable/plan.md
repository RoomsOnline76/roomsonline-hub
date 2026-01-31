
# Plan: Quantified Delight & Surprise Layer

## ✅ IMPLEMENTED - January 2026

## Objective

Transform the current random-based "1-2 delights per session" system into a **quantified, value-driven, destination-aware** delight engine that:

1. ✅ **Triggers delights based on booking value > R5,000**
2. ✅ **Scales delight intensity with booking value** (tiered system)
3. ✅ **Enriches delights with destination-specific content** from `local_experiences` and property data
4. ✅ **Tracks delight delivery** to ensure exactly 1-2 per session (no more, no less for qualifying bookings)

---

## Delight Triggering Logic

### Value-Based Tiers

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        DELIGHT TIER SYSTEM                                 │
├────────────────┬───────────────────┬───────────────────────────────────────┤
│ Tier           │ Booking Value     │ Delight Strategy                      │
├────────────────┼───────────────────┼───────────────────────────────────────┤
│ NONE           │ < R5,000          │ No AI delights (standard flow)        │
│ BRONZE         │ R5,000 – R9,999   │ 1 delight: destination tip OR amenity │
│ SILVER         │ R10,000 – R24,999 │ 1-2 delights: tip + small upgrade     │
│ GOLD           │ R25,000 – R49,999 │ 2 delights: upgrade + local voucher   │
│ PLATINUM       │ R50,000+          │ 2 delights: premium surprise package  │
└────────────────┴───────────────────┴───────────────────────────────────────┘
```

### When Delights Trigger

- **During Booking (Concierge Panel):** After a room is added to cart, check `totalPrice` in `ItineraryContext`
- **At PDF Generation:** Final delight layer with poem, voucher, and destination elaboration
- **Session Tracking:** Use `sessionStorage` to track delights delivered per session (max 2)

---

## Technical Implementation

### 1. Delight Engine Module

**New file:** `supabase/functions/_shared/delight-engine.ts`

```typescript
interface DelightConfig {
  bookingValue: number;      // Total in ZAR
  destinationCity: string;
  destinationCountry: string;
  propertyId: string;
  guestName: string;
  sessionId: string;
  delightsDelivered: number; // Current count for session
}

interface Delight {
  type: 'tip' | 'upgrade' | 'amenity' | 'voucher' | 'experience';
  message: string;
  code?: string;
  destinationContext?: string;
  icon: string;
}

function calculateDelightTier(bookingValue: number): 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' {
  if (bookingValue < 5000) return 'none';
  if (bookingValue < 10000) return 'bronze';
  if (bookingValue < 25000) return 'silver';
  if (bookingValue < 50000) return 'gold';
  return 'platinum';
}

function getMaxDelightsForTier(tier: string): number {
  switch (tier) {
    case 'none': return 0;
    case 'bronze': return 1;
    case 'silver': return 2;
    case 'gold': return 2;
    case 'platinum': return 2;
    default: return 0;
  }
}
```

### 2. Destination-Aware Delight Generation

The system will fetch `local_experiences` for the property's city/region and incorporate them into delights:

```typescript
async function generateDestinationDelight(
  supabase: any,
  propertyId: string,
  city: string,
  tier: string
): Promise<Delight | null> {
  // Fetch local experiences for this destination
  const { data: experiences } = await supabase
    .from('local_experiences')
    .select('*')
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .limit(5);
  
  // Fetch property highlights
  const { data: property } = await supabase
    .from('properties')
    .select('city, country, highlights, tagline')
    .eq('id', propertyId)
    .single();

  // Generate contextual delight based on tier + destination
  if (tier === 'bronze') {
    // Simple destination tip from local_experiences
    const nature = experiences?.find(e => e.category === 'nature');
    if (nature) {
      return {
        type: 'tip',
        icon: '🌿',
        message: `Local tip: Don't miss ${nature.title}!`,
        destinationContext: nature.why_locals_love_it
      };
    }
  }
  
  if (tier === 'silver' || tier === 'gold') {
    // Upgrade + experience voucher
    const adventure = experiences?.find(e => e.category === 'adventure');
    return {
      type: 'experience',
      icon: '🎁',
      message: `I've arranged something special – 15% off ${adventure?.title || 'a local adventure'}!`,
      code: `EXPLORE-${city.substring(0,3).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      destinationContext: `${property?.city || city} is famous for its ${adventure?.category || 'natural beauty'}.`
    };
  }
  
  if (tier === 'platinum') {
    // Premium package with dining
    const dining = experiences?.find(e => e.category === 'dining');
    return {
      type: 'voucher',
      icon: '✨',
      message: `VIP treatment awaits – complimentary dinner for two at ${dining?.title || 'our partner restaurant'}!`,
      code: `VIP-${Date.now().toString(36).toUpperCase()}`,
      destinationContext: dining?.why_locals_love_it || `A signature ${city} dining experience.`
    };
  }
  
  return null;
}
```

### 3. Update ai-booking-concierge Edge Function

**File:** `supabase/functions/ai-booking-concierge/index.ts`

Changes:
- Replace the simple 10% random `generateSurpriseGift` function
- Implement value-based triggering using `ItineraryContext.totalPrice` passed from frontend
- Track session delights via `session_id`
- Enrich with destination data

```typescript
// NEW: Value-based delight generation
async function generateValueBasedDelight(
  supabase: any,
  propertyId: string,
  bookingValue: number,
  sessionId: string,
  sessionDelightCount: number
): Promise<ConciergeResponse['surprise_gift'] | undefined> {
  const tier = calculateDelightTier(bookingValue);
  const maxDelights = getMaxDelightsForTier(tier);
  
  // Check if we've hit the limit for this session
  if (sessionDelightCount >= maxDelights) {
    console.log(`[Concierge] Session ${sessionId} has reached max delights (${maxDelights})`);
    return undefined;
  }
  
  // Get property destination info
  const { data: property } = await supabase
    .from('properties')
    .select('city, country')
    .eq('id', propertyId)
    .single();
  
  const delight = await generateDestinationDelight(
    supabase, 
    propertyId, 
    property?.city || 'Africa',
    tier
  );
  
  if (delight) {
    return {
      type: delight.type as 'voucher' | 'upgrade' | 'amenity',
      code: delight.code,
      description: `${delight.icon} ${delight.message}${delight.destinationContext ? `\n\n${delight.destinationContext}` : ''}`
    };
  }
  
  return undefined;
}
```

### 4. Update Frontend to Pass Booking Value

**File:** `src/components/booking/AIConciergePanel.tsx`

```typescript
// Add to the concierge request payload
const { data, error } = await supabase.functions.invoke('ai-booking-concierge', {
  body: {
    property_id: propertyId,
    user_query: queryText,
    // NEW: Pass current cart value for delight calculation
    current_booking_value: totalPrice, // from useItinerary()
    session_delight_count: getSessionDelightCount(), // from sessionStorage
    // ... existing params
  },
});

// Track delights in session
if (data?.surprise_gift) {
  incrementSessionDelightCount();
}
```

### 5. Enhanced PDF Delight Layer

**File:** `supabase/functions/generate-itinerary-pdf/index.ts`

The PDF already has voucher/poem generation. Enhance with:

```typescript
// Elaborate destination coverage based on tier
async function generateDestinationElaboration(
  supabase: any,
  stays: EnrichedStay[],
  bookingValue: number
): Promise<string> {
  const tier = calculateDelightTier(bookingValue);
  
  if (tier === 'none' || tier === 'bronze') {
    return ''; // No elaborate section
  }
  
  // Fetch all experiences across all stay properties
  const allExperiences: LocalExperience[] = stays.flatMap(s => s.experiences || []);
  
  const sections: string[] = [];
  
  // Silver: Add "Hidden Gems" section
  if (tier === 'silver') {
    const gems = allExperiences.filter(e => e.category === 'nature' || e.category === 'culture');
    if (gems.length > 0) {
      sections.push(generateHiddenGemsHTML(gems.slice(0, 3)));
    }
  }
  
  // Gold: Add "Insider Tips" section
  if (tier === 'gold') {
    const tips = allExperiences.filter(e => e.why_locals_love_it);
    sections.push(generateInsiderTipsHTML(tips.slice(0, 4)));
  }
  
  // Platinum: Add full "Curated Journey Guide" section
  if (tier === 'platinum') {
    sections.push(generateCuratedGuideHTML(allExperiences, stays));
  }
  
  return sections.join('\n');
}

function generateHiddenGemsHTML(experiences: LocalExperience[]): string {
  return `
    <div class="hidden-gems-section">
      <h2>💎 Hidden Gems Near Your Stay</h2>
      <p class="section-intro">These are the spots locals don't share with just anyone...</p>
      ${experiences.map(e => `
        <div class="gem-item">
          <h4>${e.title}</h4>
          <p>${e.why_locals_love_it || e.description}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function generateInsiderTipsHTML(experiences: LocalExperience[]): string {
  return `
    <div class="insider-tips-section">
      <h2>🗝️ Insider Knowledge</h2>
      <p class="section-intro">What the locals know that guidebooks don't...</p>
      ${experiences.map(e => `
        <div class="tip-item">
          <span class="tip-icon">${categoryIcons[e.category] || '✨'}</span>
          <div class="tip-content">
            <strong>${e.title}</strong>
            <p class="tip-secret">"${e.why_locals_love_it}"</p>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
```

---

## Database Changes

### Session Delight Tracking Table (Optional)

```sql
CREATE TABLE session_delights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  property_id UUID REFERENCES properties(id),
  delight_type TEXT,
  booking_value DECIMAL(10,2),
  tier TEXT,
  destination_context TEXT,
  delivered_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick session lookup
CREATE INDEX idx_session_delights_session ON session_delights(session_id);
```

### Update bookings.ai_metadata Schema

```json
{
  "suggestion_source": "ai",
  "model_used": "gemini-2.5-flash",
  "session_id": "uuid",
  "delights": [
    {
      "tier": "gold",
      "type": "experience",
      "code": "EXPLORE-CPT-X7K2",
      "destination": "Cape Town",
      "delivered_at": "2026-01-31T10:00:00Z"
    }
  ],
  "poem_seed": "romantic getaway",
  "booking_value_at_delight": 32500
}
```

---

## Example Delights by Destination

### Cape Town (R25,000+ booking)

```text
✨ "VIP treatment awaits – I've arranged a complimentary sundowner 
   at The Silo Rooftop Bar with Table Mountain views!"

   🏔️ Cape Town is world-renowned for its dramatic mountain-meets-ocean 
   scenery. Your hosts at the property can arrange a private cable car 
   ride at golden hour.

   🎁 Your Code: VIP-CAPE-2026
```

### Plettenberg Bay (R15,000 booking)

```text
🌿 "Local tip: Don't miss the Robberg Nature Reserve Peninsula Loop!"

   It's arguably the most beautiful coastline in SA; locals go for 
   the secret swimming spot at 'The Island' tombolo.

   🎁 15% off your adventure: EXPLORE-PLT-A7K2
```

### Franschhoek (R8,000 booking)

```text
🍷 "I've flagged a special request for a wine pairing 
   with your dinner on arrival night!"
   
   The Franschhoek wine route features over 40 award-winning estates.
```

---

## Feature Flag

| Flag | Default | Description |
|------|---------|-------------|
| `DELIGHT_ENGINE_V2_ENABLED` | `true` | Uses new value-based + destination-aware system |
| `DELIGHT_MIN_VALUE_ZAR` | `5000` | Minimum booking value to trigger delights |

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/_shared/delight-engine.ts` | **NEW** - Shared delight calculation logic |
| `supabase/functions/ai-booking-concierge/index.ts` | Replace random delight with value-based + destination-aware |
| `supabase/functions/generate-itinerary-pdf/index.ts` | Add tiered destination elaboration sections |
| `src/components/booking/AIConciergePanel.tsx` | Pass `totalPrice` and track session delight count |
| `src/contexts/ItineraryContext.tsx` | Add helper for delight tracking in sessionStorage |
| `docs/booking-flow-complete.md` | Document the quantified Delight & Surprise Layer |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Delight trigger rate for R5k+ bookings | 100% (1+ delight) |
| Max delights per session | 2 |
| Destination context inclusion rate | >90% |
| Guest voucher redemption rate | >15% |
| PDF "Hidden Gems" section open rate | >70% |

---

## Summary

This plan transforms the delight system from:

**BEFORE:** Random 10% chance, generic surprises, no value consideration

**AFTER:** Quantified tiered system (R5k/R10k/R25k/R50k thresholds), destination-aware content from `local_experiences`, guaranteed 1-2 delights for qualifying bookings, tracked per session
