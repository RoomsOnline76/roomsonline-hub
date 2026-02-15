
# Reinstate Journey Brochure Generation

## Problem Summary

The travel brochure (powered by AI -- Lovable AI for poems and xAI for dining recommendations via the enrichment pipeline) is not being generated or delivered. Investigation reveals **three root causes**:

1. **Wrong AI Gateway URL**: The `generate-itinerary-pdf` function calls `https://api.lovable.dev/v1/chat/completions` (non-existent) instead of the correct `https://ai.gateway.lovable.dev/v1/chat/completions`. This silently fails all AI-powered content (poems, tone-adaptive copy).

2. **No proactive brochure generation**: The journey confirmation email (`send-itinerary-email`) only includes a "Download Your Journey Brochure" link pointing to the confirmation page. The brochure is generated lazily on-demand when the guest clicks. This means:
   - The guest experience depends on them clicking a link
   - The brochure is never pre-generated and attached to the email
   - If the guest's browser blocks popups, they get nothing

3. **xAI dining enrichment is separate**: The `enrich-property-experiences` function (which uses xAI/Grok for dining recommendations) runs independently and is not triggered as part of the booking confirmation flow. Properties without pre-enriched experiences get empty dining sections in brochures.

## Plan

### Step 1: Fix the Lovable AI Gateway URL
**File:** `supabase/functions/generate-itinerary-pdf/index.ts`
- Change line 240 from `https://api.lovable.dev/v1/chat/completions` to `https://ai.gateway.lovable.dev/v1/chat/completions`
- This restores AI poem generation for brochures

### Step 2: Auto-generate brochure on journey confirmation
**File:** `supabase/functions/send-itinerary-email/index.ts`
- Before sending the email, call `generate-itinerary-pdf` to pre-generate the brochure
- Attach the brochure HTML as an email attachment (already implemented in `send-booking-email` as a pattern)
- This ensures the brochure is delivered proactively with the confirmation email, not just as a link

### Step 3: Trigger experience enrichment before brochure generation
**File:** `supabase/functions/send-itinerary-email/index.ts`
- Before calling `generate-itinerary-pdf`, check if properties have local experiences
- If sparse (fewer than 3), call `enrich-property-experiences` for each property and wait briefly
- This ensures xAI dining recommendations and Lovable AI activity suggestions are available when the brochure renders

### Step 4: Deploy and verify
- Deploy all three modified edge functions
- Trigger a test for an existing confirmed itinerary to verify:
  - AI poem is generated (Lovable AI credits consumed)
  - Dining recommendations are present (xAI or fallback)
  - Brochure HTML is attached to the email
  - Brochure is stored in the `documents` bucket

## Technical Details

### Files Modified
- `supabase/functions/generate-itinerary-pdf/index.ts` -- Fix AI gateway URL
- `supabase/functions/send-itinerary-email/index.ts` -- Add brochure generation + enrichment trigger + attachment

### Key Architecture
```text
multi-push-booking (on success)
  --> send-itinerary-email
        --> enrich-property-experiences (if needed, per property)
        --> generate-itinerary-pdf (AI poem + weather + voucher + dining)
        --> Attach brochure HTML to email
        --> Send via Resend
```

### AI Credits Impact
- Lovable AI: ~1 call per brochure (poem generation, ~200 tokens)
- xAI: Only used by `enrich-property-experiences` when dining data is missing (called once per property, cached in `local_experiences` table thereafter)
