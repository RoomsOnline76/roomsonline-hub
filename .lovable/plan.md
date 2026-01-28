

# Enhanced AI-Powered Local Experience Generation with xAI (Grok) Integration

## Overview

Upgrade the `enrich-property-experiences` edge function to combine Lovable AI with xAI (Grok) for intelligent dining recommendations. The system will match dining style (fine dining, rustic, casual) to property type and tier.

---

## Phase 1: Secret Configuration

### 1.1 Add xAI API Key

**Action:** Request user to add `XAI_API_KEY` secret via Lovable Cloud

The xAI API uses OpenAI-compatible endpoints at `https://api.x.ai/v1` with models like `grok-4-latest`.

---

## Phase 2: Database Schema Update

### 2.1 Add "dining" Category

```sql
-- Update the category check constraint to include 'dining'
ALTER TABLE local_experiences 
DROP CONSTRAINT IF EXISTS local_experiences_category_check;

ALTER TABLE local_experiences 
ADD CONSTRAINT local_experiences_category_check 
CHECK (category IN ('nature', 'culture', 'food', 'adventure', 'relaxation', 'wellness', 'dining'));

-- Add new columns for restaurant-specific data
ALTER TABLE local_experiences ADD COLUMN IF NOT EXISTS venue_type VARCHAR(50);
ALTER TABLE local_experiences ADD COLUMN IF NOT EXISTS cuisine_type VARCHAR(100);
ALTER TABLE local_experiences ADD COLUMN IF NOT EXISTS reservation_required BOOLEAN DEFAULT false;
ALTER TABLE local_experiences ADD COLUMN IF NOT EXISTS dress_code VARCHAR(50);
```

---

## Phase 3: Property Tier Classification

### 3.1 Dining Style Mapping Logic

```typescript
// Property type to dining tier mapping
type DiningTier = 'fine_dining' | 'casual_elegant' | 'rustic_local' | 'relaxed_casual';

function determineDiningTier(property: PropertyContext): DiningTier {
  const { property_type, editorial_rating, amenities } = property;
  const type = property_type?.toLowerCase() || '';
  
  // Editorial rating hierarchy
  const luxuryRatings = ['truly_special', 'exceptionally_considered'];
  const upscaleRatings = ['standout_character', 'quietly_excellent'];
  
  // Luxury properties → Fine dining
  if (luxuryRatings.includes(editorial_rating)) {
    return 'fine_dining';
  }
  
  // Lodge/Farm properties → Rustic local
  if (type.includes('lodge') || type.includes('farm') || type.includes('country')) {
    return 'rustic_local';
  }
  
  // Upscale hotels/villas → Casual elegant
  if (upscaleRatings.includes(editorial_rating) || 
      type.includes('hotel') || type.includes('villa')) {
    return 'casual_elegant';
  }
  
  // Guest houses, apartments, BnBs → Relaxed casual
  return 'relaxed_casual';
}
```

### 3.2 Dining Style Descriptions

| Property Tier | Dining Style | Examples |
|--------------|--------------|----------|
| Truly Special / Exceptionally Considered | Fine Dining | Tasting menus, Michelin-star, wine pairing |
| Standout Character / Hotel / Villa | Casual Elegant | Farm-to-table, bistros, upscale cafes |
| Lodge / Farm / Country Estate | Rustic Local | Farmhouse cooking, local pubs, wine farms |
| Guest House / Apartment / BnB | Relaxed Casual | Cozy cafes, local eateries, takeaway spots |

---

## Phase 4: Enhanced Edge Function

### 4.1 Updated `enrich-property-experiences/index.ts`

**Key Changes:**
1. Add xAI integration for dining-specific recommendations
2. Add property tier detection
3. Combine outputs from both AI providers
4. Enhanced structured output

```typescript
// New interface for dining recommendations
interface DiningRecommendation {
  title: string;
  description: string;
  category: 'dining';
  venue_type: 'restaurant' | 'cafe' | 'pub' | 'wine_bar' | 'farm_table' | 'takeaway';
  cuisine_type: string;
  price_indicator: 'budget' | 'moderate' | 'luxury';
  why_locals_love_it: string;
  best_time: string;
  reservation_required: boolean;
  dress_code?: string;
  distance_km?: number;
}

// Main flow
async function enrichPropertyExperiences(property_id: string) {
  // 1. Fetch property details
  const property = await fetchPropertyDetails(property_id);
  
  // 2. Determine dining tier
  const diningTier = determineDiningTier(property);
  
  // 3. Generate general experiences with Lovable AI (4 experiences)
  const generalExperiences = await generateWithLovableAI(property, 4);
  
  // 4. Generate dining recommendation with xAI Grok (1-2 recommendations)
  const diningRecs = await generateDiningWithXAI(property, diningTier);
  
  // 5. Combine and save
  const allExperiences = [...generalExperiences, ...diningRecs];
  await saveExperiences(property_id, allExperiences);
}
```

### 4.2 xAI Grok Integration

```typescript
async function generateDiningWithXAI(
  property: PropertyContext, 
  diningTier: DiningTier
): Promise<DiningRecommendation[]> {
  const xaiApiKey = Deno.env.get("XAI_API_KEY");
  
  if (!xaiApiKey) {
    console.log("XAI_API_KEY not configured, falling back to Lovable AI");
    return generateDiningWithLovable(property, diningTier);
  }
  
  const tierPrompts = {
    fine_dining: `Find the highest-rated fine dining restaurant near ${property.city}. 
      Look for: tasting menus, wine pairing, Michelin recognition, chef's table experiences.
      The clientele at ${property.name} expects world-class cuisine.`,
      
    casual_elegant: `Find an upscale but relaxed restaurant near ${property.city}.
      Look for: farm-to-table, contemporary cuisine, good wine list, stylish atmosphere.
      Perfect for guests who appreciate quality without formality.`,
      
    rustic_local: `Find an authentic local dining spot near ${property.city}.
      Look for: regional cuisine, family-run establishments, wine farms, historic pubs.
      Guests at ${property.name} seek genuine local experiences.`,
      
    relaxed_casual: `Find a cozy local eatery or cafe near ${property.city}.
      Look for: comfort food, friendly service, local favorites, hidden gems.
      Perfect for ${property.property_type} guests wanting easy, quality meals.`
  };

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${xaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-4-latest",
      messages: [
        {
          role: "system",
          content: `You are a local food critic and dining expert for ${property.country || 'South Africa'}. 
            You know the best restaurants that match specific guest profiles.
            Provide real, specific restaurant recommendations - not generic descriptions.
            Include the actual restaurant name if you know it.`
        },
        {
          role: "user",
          content: tierPrompts[diningTier]
        }
      ],
      tools: [{
        type: "function",
        function: {
          name: "recommend_dining",
          description: "Recommend a dining establishment",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Restaurant/venue name" },
              description: { type: "string", description: "2-3 sentences about what makes it special" },
              venue_type: { type: "string", enum: ["restaurant", "cafe", "pub", "wine_bar", "farm_table", "takeaway"] },
              cuisine_type: { type: "string", description: "Type of cuisine (e.g., French, Farm-to-table, Cape Malay)" },
              price_indicator: { type: "string", enum: ["budget", "moderate", "luxury"] },
              why_locals_love_it: { type: "string", description: "One sentence insider tip" },
              best_time: { type: "string", description: "Best time to visit" },
              reservation_required: { type: "boolean" },
              dress_code: { type: "string", description: "Dress code if any" }
            },
            required: ["title", "description", "venue_type", "cuisine_type", "price_indicator", "why_locals_love_it", "best_time", "reservation_required"]
          }
        }
      }],
      tool_choice: { type: "function", function: { name: "recommend_dining" } }
    }),
  });

  // Parse and return dining recommendation
  // ... error handling and parsing
}
```

### 4.3 Fallback Strategy

```typescript
// If xAI fails, fallback to Lovable AI with dining-specific prompt
async function generateDiningWithLovable(
  property: PropertyContext,
  diningTier: DiningTier
): Promise<DiningRecommendation[]> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  
  const prompt = buildDiningPrompt(property, diningTier);
  
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You are a local dining expert." },
        { role: "user", content: prompt }
      ],
      // ... tool configuration
    }),
  });
  
  // ... parse response
}
```

---

## Phase 5: Updated Experience Structure

### 5.1 Final Experience Mix (6 total)

| Slot | Category | AI Provider | Notes |
|------|----------|-------------|-------|
| 1 | nature | Lovable AI | Outdoor activity |
| 2 | culture | Lovable AI | Historical/cultural visit |
| 3 | adventure | Lovable AI | Exciting activity |
| 4 | relaxation/wellness | Lovable AI | Spa, beach, etc. |
| 5 | dining | xAI Grok (primary) | Tier-matched restaurant |
| 6 | food | Lovable AI (backup) | Local food experience |

### 5.2 Sample Output by Property Type

**Luxury Hotel (Truly Special):**
```json
{
  "dining": {
    "title": "La Colombe",
    "venue_type": "restaurant",
    "cuisine_type": "Contemporary French-Asian fusion",
    "price_indicator": "luxury",
    "reservation_required": true,
    "dress_code": "Smart casual"
  }
}
```

**Country Lodge (Standout Character):**
```json
{
  "dining": {
    "title": "Pierneef à La Motte",
    "venue_type": "farm_table",
    "cuisine_type": "Cape Winelands farm-to-table",
    "price_indicator": "moderate",
    "reservation_required": true,
    "dress_code": null
  }
}
```

**Guest House (A Good Find):**
```json
{
  "dining": {
    "title": "Kloof Street House",
    "venue_type": "cafe",
    "cuisine_type": "Contemporary South African",
    "price_indicator": "moderate",
    "reservation_required": false
  }
}
```

---

## Phase 6: Config & Deployment

### 6.1 Update `supabase/config.toml`

```toml
[functions.enrich-property-experiences]
verify_jwt = false
```

### 6.2 Error Handling

- **xAI API unavailable:** Fall back to Lovable AI
- **Rate limiting (429):** Return partial results with warning
- **Payment required (402):** Log and surface to admin

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| Migration | Create | Add dining columns and update category constraint |
| `supabase/functions/enrich-property-experiences/index.ts` | Rewrite | Dual AI integration with property tier logic |
| `src/components/experiences/LocalExperiencesManager.tsx` | Modify | Add dining-specific fields in editor |

---

## Implementation Order

1. **Request xAI API Key** from user
2. **Run migration** for schema updates
3. **Update edge function** with dual-AI logic
4. **Update admin UI** for dining fields
5. **Test with sample properties** across tiers

---

## Expected Outcome

| Before | After |
|--------|-------|
| 5 generic AI experiences | 4 curated + 1-2 tier-matched dining |
| Same dining for all properties | Fine dining for luxury, rustic for lodges |
| Single AI provider | Dual AI for specialized expertise |
| Basic food category | Rich dining metadata (dress code, cuisine type, reservations) |

