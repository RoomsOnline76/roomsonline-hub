
# Fix Journey PDF: Destination Elaboration, Eateries & Multi-Stay Flow

## Issues Identified

### Issue 1: `${destinationElaborationHTML}` Rendered as Literal Text
**Root Cause:** On line 1664 of `generate-itinerary-pdf/index.ts`, the variable is escaped with a backslash:
```html
\${destinationElaborationHTML}
```
This prevents template literal interpolation. Additionally, the `enhancements.destinationElaboration` field is declared in the interface (line 557) but **never computed or set** in the code (lines 1865-1869).

**Fix:**
1. Remove the backslash escape so the variable interpolates correctly
2. Actually call `generateDestinationElaborationHTML()` with the enriched experiences data and set it in the `enhancements` object

---

### Issue 2: Selected Eatery Missing from PDF
**Root Cause:** The current code only looks for experiences with `category === 'dining'`, but for the Stilbaai property (ea9a019d), there are NO dining experiences in the database - only nature, culture, adventure, and wellness categories.

**Current state:**
| Property | Dining Experiences |
|----------|-------------------|
| Plettenberg Bay (550e38eb) | ✅ "The Fat Fish" |
| Stilbaai (ea9a019d) | ❌ None |

**Fix:**
1. For properties without dining experiences, use the `enrich-property-experiences` edge function to auto-generate dining recommendations
2. In the short term, handle the case gracefully - if no dining for current property, the section just doesn't show (which is fine)

However, the **real issue** may be that the user has manually selected/curated an eatery that isn't being passed through. Let me verify that the enrichment system is triggering for properties missing dining data, and ensure the dining section uses available data.

---

### Issue 3: Multi-Stay Journey Needs Per-Destination Flow
**Current behavior:** Each stay card shows its own experiences/dining, but the "tiered destination elaboration" (Hidden Gems, Insider Tips, Curated Guide) is:
1. Generated globally, not per-property
2. Uses experiences from all properties merged together
3. Only appears once after all stays

**Requested behavior:** For multi-property journeys, build an "exciting flow of events/destinations/eateries along the way for each part of the stay."

**Fix Architecture:**
1. Generate per-stay destination content instead of one global section
2. For multi-stay journeys, add transitional narrative elements between stays (e.g., "Day 4: Journey to Plettenberg Bay – 2.5 hours of scenic coastline awaits...")
3. Include dining recommendations inline with each stay rather than in a global section

---

## Implementation Plan

### File: `supabase/functions/generate-itinerary-pdf/index.ts`

#### Fix 1: Destination Elaboration Variable (Critical Bug)

**Line 1664** - Remove backslash and use proper interpolation:
```typescript
// BEFORE (broken):
\${destinationElaborationHTML}

// AFTER (fixed):
${enhancements.destinationElaboration || ''}
```

**Lines 1855-1869** - Compute destination elaboration before building enhancements:

```typescript
// Collect all experiences from all properties for tiered content
const allPropertyExperiences = enrichedStays.flatMap(s => s.experiences);
const cities = enrichedStays.map(s => s.city).filter(Boolean) as string[];

// Generate tiered destination content based on booking value
const destinationElaborationHTML = generateDestinationElaborationHTML(
  allPropertyExperiences,
  itinerary.total_price || 0,
  enrichedStays.length,
  cities
);

const enhancements: BrochureEnhancements = {
  poem,
  weather,
  voucher,
  destinationElaboration: destinationElaborationHTML, // NOW SET
};
```

#### Fix 2: Ensure Dining Appears When Available

The dining logic at line 887 is correct - it just requires dining data to exist. The per-stay dining section at line 923 will render when available.

For properties without dining, we should ensure the `enrich-property-experiences` function is properly generating dining recommendations via xAI. This is already triggered at lines 1790-1798 but is fire-and-forget. For immediate needs, this is acceptable behavior.

#### Fix 3: Per-Stay Tiered Content for Multi-Stay Journeys

Update the `staysHTML` generation (lines 886-927) to include per-stay Hidden Gems/Tips for multi-property journeys:

```typescript
const staysHTML = stays.map((stay, index) => {
  const diningExp = stay.experiences?.find(e => e.category === 'dining');
  const stayIntro = getTonePhrase(tone);
  const isMultiStay = stays.length > 1;
  
  // Per-stay curated content (for multi-stay journeys)
  const perStayElaboration = isMultiStay 
    ? generatePerStayElaboration(stay.experiences, stay.city, index + 1)
    : '';
  
  return `
    <div class="stay-card">
      ...existing content...
      ${perStayElaboration}
    </div>
  `;
}).join('');
```

Add new function `generatePerStayElaboration()`:

```typescript
function generatePerStayElaboration(
  experiences: LocalExperience[],
  city: string | undefined,
  stayNumber: number
): string {
  if (!experiences || experiences.length < 2) return '';
  
  const highlights = experiences
    .filter(e => e.why_locals_love_it)
    .slice(0, 2);
  
  if (highlights.length === 0) return '';
  
  return `
    <div class="per-stay-highlights">
      <h4>🌟 ${city || 'Destination'} Highlights</h4>
      ${highlights.map(e => `
        <div class="highlight-item">
          <span>${categoryIcons[e.category] || '✨'}</span>
          <div>
            <strong>${e.title}</strong>
            <p>${e.why_locals_love_it}</p>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
```

Add CSS for `.per-stay-highlights` in the styles section.

#### Fix 4: Add Journey Narrative for Multi-Stay

For multi-stay journeys, add transitional text between stays suggesting travel flow:

```typescript
// Between stay cards, add journey narrative
if (index < stays.length - 1 && stays.length > 1) {
  const nextStay = stays[index + 1];
  const journeyText = `
    <div class="journey-transition">
      <span class="journey-icon">🚗</span>
      <p>Continue your adventure to ${nextStay.propertyName} in ${nextStay.city || 'your next destination'}...</p>
    </div>
  `;
}
```

---

## Summary of Changes

| Change | Location | Type |
|--------|----------|------|
| Fix escaped variable `\${destinationElaborationHTML}` | Line 1664 | Bug fix |
| Actually compute and set `destinationElaboration` | Lines ~1855-1869 | Bug fix |
| Add per-stay curated content for multi-stay | Lines ~886-927 | Enhancement |
| Add journey transition narrative | New function | Enhancement |
| Add CSS for new elements | Styles section | Enhancement |

---

## Verification Steps

1. Generate PDF for the confirmed Stilbaai booking (id: 79aa6ef8)
2. Verify `${destinationElaborationHTML}` no longer appears as literal text
3. Verify tiered content (Hidden Gems/Insider Tips) renders for R5,000+ bookings
4. Manually add a dining experience to Stilbaai property, then regenerate to confirm dining section appears
5. Create a test multi-stay itinerary and verify per-destination flow renders correctly
