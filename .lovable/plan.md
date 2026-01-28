
# Comprehensive AI Implementation Plan: The Silent Co-Pilot Rollout

## Executive Summary

This plan transforms RoomsOnline into an AI-native platform where intelligence feels like intuition. The implementation follows a phased approach across 8 weeks, building from foundational infrastructure to advanced personalization.

---

## Phase 1: Immediate Magic (Weeks 1-2)

### 1.1 Inline Website Sync with Multi-Source Intelligence
**Current State:** `WebsiteSyncModal.tsx` requires manual button click, shows modal with suggestions
**Target:** Auto-trigger on URL paste, inline field suggestions, no modal interruption

**Files to Modify:**
- `src/pages/PropertyForm.tsx` - Add URL field blur listener with debounced auto-sync
- `src/lib/api/websiteSync.ts` - Add new `silentSync` function for background operation
- `supabase/functions/ai-website-sync/index.ts` - Add Gemini Vision image analysis for amenity detection

**New Components:**
- `src/components/property/InlineAISuggestion.tsx` - Subtle pill showing "AI suggests: Pool detected ✓" with Accept/Dismiss

**Technical Approach:**
```
URL Field Blur → Debounce 800ms → Background Firecrawl + AI
                                        ↓
                     Store suggestions in formData.__aiSuggestions
                                        ↓
               Render InlineAISuggestion pills next to each field
```

**AI Providers:** Firecrawl + Lovable AI (Gemini Flash) + Gemini Vision

---

### 1.2 Special Requests NLP Parsing
**Current State:** Free-text `special_requests` field stored as string, no structured handling
**Target:** Parse on booking creation, extract structured tags for staff routing

**Files to Modify:**
- `supabase/functions/push-booking/index.ts` - Add NLP parsing after booking creation
- `supabase/functions/multi-push-booking/index.ts` - Same NLP integration

**New Edge Function:**
- `supabase/functions/parse-special-requests/index.ts`

**Database Migration:**
```sql
ALTER TABLE bookings ADD COLUMN special_requests_parsed JSONB DEFAULT '{}';
-- Structure: { tags: ["early_check_in", "dietary_vegetarian", "accessibility_ground_floor"], 
--              priority: "high" | "normal", 
--              alerts: ["Allergy: feathers"] }
```

**Parsing Categories:**
| Input Pattern | Tag | Priority |
|--------------|-----|----------|
| "allergy", "allergic" | dietary_{type} | HIGH |
| "wheelchair", "mobility", "ground floor" | accessibility | HIGH |
| "early check-in", "late check-out" | timing_{type} | NORMAL |
| "anniversary", "honeymoon", "birthday" | celebration_{type} | NORMAL |
| "pet", "dog", "cat" | pets | NORMAL |

---

### 1.3 Narrative Dashboard Summaries
**Current State:** `AdminDashboard.tsx` shows stat cards with numbers, no context
**Target:** Add AI-generated plain-language summary card at top

**Files to Modify:**
- `src/pages/AdminDashboard.tsx` - Add NarrativeSummary component at top
- `supabase/functions/dashboard-insights/index.ts` - Already exists, enhance prompt

**New Component:**
- `src/components/dashboard/NarrativeSummary.tsx`

**Implementation:**
```typescript
// Auto-fetch on dashboard load
useEffect(() => {
  if (stats && !narrativeFetched) {
    fetchNarrative(stats);
  }
}, [stats]);

// Display as subtle card
<Card className="bg-muted/30 border-none">
  <p className="text-sm text-muted-foreground italic">
    {narrative || "Analyzing your week..."}
  </p>
</Card>
```

---

### 1.4 Confidence Scoring Foundation
**Purpose:** Every AI-generated value receives metadata for source tracking

**Database Migration:**
```sql
-- Add to properties table
ALTER TABLE properties ADD COLUMN ai_confidence_metadata JSONB DEFAULT '{}';
-- Structure: { fieldName: { confidence: 0.95, source: "website", generated_at: ISO } }

-- Add to bookings table  
ALTER TABLE bookings ADD COLUMN ai_metadata JSONB DEFAULT '{}';
```

**Implementation Rule:**
- Confidence ≥ 0.9: Auto-apply silently
- Confidence 0.75-0.89: Show subtle highlight, require no action
- Confidence < 0.75: Show as suggestion, require explicit accept

---

## Phase 2: Sticky Delight (Weeks 3-4)

### 2.1 Behavioral Memory System
**Purpose:** Track intent signals without PII to anticipate user needs

**New Files:**
- `src/contexts/BehavioralMemoryContext.tsx`
- `src/hooks/useBehavioralMemory.tsx`

**Storage:** Session-based (sessionStorage) with optional anonymous Supabase echoes

**Tracked Signals:**
| Signal | Storage Key | Inference |
|--------|------------|-----------|
| Property views | `viewed_properties[]` | Style preferences |
| Filter adjustments | `filter_history[]` | Budget, location, amenity preferences |
| Date hover patterns | `date_interests[]` | Flexible vs fixed dates |
| Drop-off points | `drop_offs[]` | Friction points to address |

**Magic Moment Implementation:**
```typescript
// In Home.tsx or PropertyListing.tsx
const { getRecommendation } = useBehavioralMemory();
const hint = getRecommendation(); 
// Returns: "Coastal properties with pools book 23% faster mid-week"
```

---

### 2.2 Image-First Truth Detection
**Purpose:** Uploaded images validate form data; flag mismatches

**Files to Modify:**
- `src/pages/PropertyForm.tsx` - Add image upload handler with validation
- New: `supabase/functions/validate-images-against-data/index.ts`

**AI Provider:** Gemini Vision via Lovable AI

**Validation Flow:**
```
Image Upload → Gemini Vision Analysis → Extract detected features
     ↓
Compare with form checkboxes (pool, gym, accessibility, view_type)
     ↓
If mismatch: Show subtle notification "Image suggests pool - enable filter?"
```

---

### 2.3 Decision-Reducing Booking Flow
**Purpose:** When user hesitates, reduce choices intelligently

**Files to Modify:**
- `src/pages/Booking.tsx` - Add hesitation detection
- `src/contexts/ItineraryContext.tsx` - Track decision timing

**Hesitation Detection:**
```typescript
// Track time on date picker without selection
const [dateHoverStart, setDateHoverStart] = useState<number | null>(null);
const HESITATION_THRESHOLD = 8000; // 8 seconds

useEffect(() => {
  if (Date.now() - dateHoverStart > HESITATION_THRESHOLD) {
    // Trigger value highlight mode
    setShowValueHints(true);
  }
}, [dateHoverStart]);
```

**Value Hints:**
- Highlight "better value" date ranges with subtle badges
- Reorder room list by inferred fit (based on behavioral memory)
- Show "Most guests like you choose..." suggestion

---

### 2.4 Tone-Adaptive Itinerary Generation
**Purpose:** PDF brochures read like human-planned journeys

**Files to Modify:**
- `supabase/functions/generate-itinerary-pdf/index.ts` - Add tone context

**Tone Detection Sources:**
| Signal | Tone |
|--------|------|
| Booking includes spa/wellness | Relaxation |
| Multiple properties, short stays | Adventure/Explorer |
| High-end properties only | Luxury |
| Celebration tags in special_requests | Romantic |
| Business email domain | Professional |

**Implementation:**
```typescript
// Determine tone from booking context
const tone = determineTone(itinerary, stays);
// Inject into AI narrative generation
const narrativePrompt = TONE_PROMPTS[tone] + itinerarySummary;
```

---

## Phase 3: Defensible Intelligence (Weeks 5-6)

### 3.1 Proactive Anomaly Detection
**Purpose:** Early warnings before issues affect bookings

**New Edge Function:**
- `supabase/functions/monitor-anomalies/index.ts`

**Cron Schedule:** Every 30 minutes via pg_cron

**Detection Patterns:**
| Pattern | Threshold | Alert |
|---------|-----------|-------|
| Rate discrepancy | >20% from avg | "Rate drift detected in Room 201" |
| Sync failures | >3 consecutive | "PMS sync failing for {property}" |
| Booking conversion drop | >30% WoW | "Conversion down - check availability" |
| Response time spike | >2x average | "API latency elevated" |

**Alert Delivery:**
- Insert into `system_alerts` table
- Surface in Admin Dashboard as actionable cards
- Include in daily health report email

---

### 3.2 AI Daily Digest Enhancement
**Purpose:** Transform raw metrics into executive summary

**Files to Modify:**
- `supabase/functions/daily-health-report/index.ts` - Add AI summarization

**New Section in Email:**
```html
<div class="ai-digest">
  <h3>🧠 AI Executive Summary</h3>
  <p>{{ generated_narrative }}</p>
  <ul>
    <li>Priority 1: {{ top_action }}</li>
    <li>Priority 2: {{ second_action }}</li>
  </ul>
</div>
```

**AI Prompt:**
```
Analyze this system health data and provide a 2-sentence executive summary 
focused on: (1) Most important issue requiring attention (2) Key opportunity.
Be direct and actionable. No marketing language.
```

---

## Phase 4: Scale & Refine (Weeks 7-8+)

### 4.1 Personalized Property Recommendations
**Purpose:** "You might also like" suggestions based on browsing

**New Component:**
- `src/components/booking/PersonalizedSuggestions.tsx`

**Implementation:**
- Use behavioral memory data
- Collaborative filtering: "Guests who booked X also viewed Y"
- Surface on PropertyShowcase, JourneyReview pages

---

### 4.2 Smart Room Type Generation
**Purpose:** Create room types from natural language description

**New Feature in PropertyForm:**
```
"Ocean view suite with king bed, balcony, sleeps 2" 
     ↓ AI Parse
{ name: "Ocean View Suite", maxGuests: 2, bedConfig: "1 King", amenities: ["balcony", "ocean_view"] }
```

---

### 4.3 TripAdvisor Sentiment Analysis
**Purpose:** Extract themes from reviews to inform editorial

**New Edge Function:**
- `supabase/functions/analyze-reviews/index.ts`

**Output:** Store in `properties.review_sentiment` JSONB
```json
{
  "overall_score": 4.2,
  "themes": {
    "cleanliness": { "score": 4.5, "mentions": 23 },
    "service": { "score": 4.8, "mentions": 45 },
    "location": { "score": 4.1, "mentions": 31 }
  },
  "top_quotes": ["Staff went above and beyond", "Perfect location for exploring"]
}
```

---

## Technical Architecture

### AI Provider Strategy
| Use Case | Provider | Model | Reason |
|----------|----------|-------|--------|
| Content generation | Lovable AI | gemini-3-flash-preview | Speed, cost |
| Complex reasoning | Lovable AI | gemini-2.5-pro | Accuracy |
| Image analysis | Lovable AI | gemini-2.5-pro (vision) | Multimodal |
| Real-time knowledge | xAI | grok-3-latest | Live data |
| Web scraping | Firecrawl | N/A | Rate limits |

### Rate Limiting
```typescript
// Per-user limits
const USER_LIMITS = {
  ai_calls_per_minute: 60,
  ai_calls_per_hour: 500,
  sync_per_property_per_hour: 5
};
```

### Error Handling
- 429 (Rate Limit): Exponential backoff, surface friendly message
- 402 (Credits): Alert admin, graceful degradation
- Hallucination risk: Confidence scoring gates auto-application

---

## File Changes Summary

### Phase 1 (Weeks 1-2)
| File | Action |
|------|--------|
| `src/pages/PropertyForm.tsx` | Modify - Add URL auto-sync |
| `src/components/property/InlineAISuggestion.tsx` | Create |
| `supabase/functions/parse-special-requests/index.ts` | Create |
| `supabase/functions/push-booking/index.ts` | Modify - Add NLP call |
| `src/pages/AdminDashboard.tsx` | Modify - Add narrative |
| `src/components/dashboard/NarrativeSummary.tsx` | Create |
| Database migration | Add ai_confidence_metadata columns |

### Phase 2 (Weeks 3-4)
| File | Action |
|------|--------|
| `src/contexts/BehavioralMemoryContext.tsx` | Create |
| `src/hooks/useBehavioralMemory.tsx` | Create |
| `supabase/functions/validate-images-against-data/index.ts` | Create |
| `src/pages/Booking.tsx` | Modify - Hesitation detection |
| `supabase/functions/generate-itinerary-pdf/index.ts` | Modify - Tone |

### Phase 3 (Weeks 5-6)
| File | Action |
|------|--------|
| `supabase/functions/monitor-anomalies/index.ts` | Create |
| `supabase/functions/daily-health-report/index.ts` | Modify - AI digest |

### Phase 4 (Weeks 7-8)
| File | Action |
|------|--------|
| `src/components/booking/PersonalizedSuggestions.tsx` | Create |
| `supabase/functions/analyze-reviews/index.ts` | Create |

---

## Success Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Property onboarding time | ~45 min | <10 min | Form completion analytics |
| Booking conversion | Current | +20% | Checkout completion rate |
| Admin time on dashboard | Current | -30% | Session duration |
| Guest satisfaction | N/A | "How did you know?" feedback | Post-stay survey |

---

## UX Principles (Enforced Throughout)

1. **No AI labels or badges** - Intelligence feels organic
2. **Progressive disclosure** - Simplest interface first
3. **Subtle animations** - Fade-in suggestions, no pop-ups
4. **Graceful degradation** - Non-AI fallback for all features
5. **44px minimum touch targets** - Mobile-first interactions

---

## Safety & Monitoring

- Weekly AI cost dashboard review
- Human feedback loops for generated content
- Confidence scoring gates hallucination risk
- Rate limits prevent abuse (60/min per user)
