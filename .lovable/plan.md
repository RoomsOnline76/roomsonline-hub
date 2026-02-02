

# Fix Journey PDF: Experience Travel Times and Dining Location Accuracy

## Problem Summary

Based on analysis of the screenshot and database:

1. **Travel Time Display Issue**: The PDF shows `duration_hours` (how long the activity takes, e.g., "4h" for a hiking trail) but the layout implies these are travel times from the property. Users expect to see "time to get there."

2. **Dining Recommendation is Incorrect Location**: The AI recommended "Pili Pili Beach Bar & Restaurant" for a Still Bay property. Investigation reveals this restaurant is actually located in **Sedgefield (approximately 100km away)**, not Still Bay. The AI hallucinated proximity.

---

## Root Cause Analysis

### Issue 1: Duration vs Travel Time
- **Current behaviour**: `generateExperiencesHTML()` displays `exp.duration_hours` as "Xh"
- **Problem**: This represents activity duration, not travel time
- **Data available**: `distance_km` field exists but isn't displayed

### Issue 2: AI Dining Hallucination
- **Current behaviour**: AI prompts pass only city/country names, no coordinates
- **Problem**: xAI/Lovable AI generates plausible-sounding but geographically incorrect recommendations
- **Evidence**: "Pili Pili" is a real restaurant but in Sedgefield, not Still Bay

---

## Solution

### Part 1: Fix Experience Display in PDF

**File**: `supabase/functions/generate-itinerary-pdf/index.ts`

Update `generateExperiencesHTML()` to show **both** travel distance and activity duration:

```typescript
// Current (line ~396-411):
${exp.duration_hours ? `<span class="experience-duration">${exp.duration_hours}h</span>` : ''}

// Updated:
<div class="experience-meta">
  ${exp.distance_km ? `<span class="experience-distance">${exp.distance_km}km away</span>` : ''}
  ${exp.duration_hours ? `<span class="experience-duration">${exp.duration_hours}h activity</span>` : ''}
</div>
```

Also update CSS to style these clearly.

### Part 2: Improve AI Dining Prompts with Coordinates

**File**: `supabase/functions/enrich-property-experiences/index.ts`

1. **Pass coordinates to AI prompt** - Fetch property latitude/longitude and include in the prompt
2. **Add distance constraint** - Explicitly tell AI to recommend within X km radius
3. **Request coordinate validation** - Ask AI to include approximate lat/long in response for verification

Updated prompt structure:
```typescript
const prompt = getDiningPrompt(property, diningTier);
// Add coordinate context:
const coordinateContext = property.latitude && property.longitude
  ? `\n\nIMPORTANT: The property is located at coordinates ${property.latitude}, ${property.longitude}. 
     Only recommend restaurants WITHIN 15km of these coordinates. 
     Do not recommend establishments in other towns.`
  : '';
```

### Part 3: Add Post-Generation Validation

Create a simple validation step that checks if the generated dining recommendation's `distance_km` is reasonable (< 25km). If not, flag or regenerate.

---

## Files to Modify

1. **`supabase/functions/generate-itinerary-pdf/index.ts`**
   - Update `generateExperiencesHTML()` to display distance (km) instead of/alongside duration
   - Add CSS for `.experience-distance` class
   - Clarify duration label as "activity duration"

2. **`supabase/functions/enrich-property-experiences/index.ts`**
   - Fetch property coordinates (latitude, longitude)
   - Add coordinate context to dining prompts for xAI and Lovable AI
   - Add distance constraint (15-20km radius)
   - Add post-generation distance validation
   - Regenerate or skip dining if validation fails

---

## Implementation Details

### PDF Display Changes

Current HTML (line ~396-411):
```html
<div class="experience-item">
  <span class="experience-icon">${categoryIcons[exp.category] || '✨'}</span>
  <div class="experience-content">
    <span class="experience-title">${exp.title}</span>
    ${exp.duration_hours ? `<span class="experience-duration">${exp.duration_hours}h</span>` : ''}
  </div>
</div>
```

New HTML:
```html
<div class="experience-item">
  <span class="experience-icon">${categoryIcons[exp.category] || '✨'}</span>
  <div class="experience-content">
    <span class="experience-title">${exp.title}</span>
    <span class="experience-meta">
      ${exp.distance_km ? `${exp.distance_km}km` : ''}
      ${exp.distance_km && exp.duration_hours ? ' · ' : ''}
      ${exp.duration_hours ? `${exp.duration_hours}h` : ''}
    </span>
  </div>
</div>
```

### AI Prompt Enhancement

Add to property context fetch (around line 451):
```typescript
const { data: property, error: propertyError } = await supabase
  .from("properties")
  .select("id, name, property_type, editorial_rating, city, country, description, latitude, longitude")
  //                                                                              ^^^^^^^^^^^^^^^^
  .eq("id", property_id)
  .single();
```

Enhance dining prompt:
```typescript
function getDiningPrompt(property: PropertyContext, diningTier: DiningTier): string {
  const location = `${property.city || 'the area'}${property.country ? `, ${property.country}` : ''}`;
  const coordinateGuidance = property.latitude && property.longitude
    ? `\n\nCRITICAL: Only recommend restaurants within 15km of ${property.city}. 
       The property coordinates are: ${property.latitude}, ${property.longitude}.
       Do NOT suggest restaurants from other towns like Sedgefield, Knysna, or Plettenberg Bay if the property is in Still Bay.`
    : '';
  
  // ... existing tier prompts + coordinateGuidance
}
```

---

## Verification After Implementation

1. Regenerate experiences for the Still Bay property
2. Verify dining recommendation is actually in Still Bay
3. Generate new PDF and confirm:
   - Experiences show distance (km) clearly
   - Duration is labeled as activity time
   - Dining venue is genuinely nearby

---

## Technical Notes

- The xAI Grok model has real-time knowledge and should correctly identify local restaurants if given proper coordinate context
- Lovable AI (Gemini) may have outdated data but coordinate constraints will help
- Consider adding a "source verification" flag for dining that was AI-generated vs manually curated

