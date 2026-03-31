

# Phase 5: AI Portfolio Experience

## Overview

Enhance the portfolio system with AI-powered property grouping, bundle recommendations, and semantic search. The `experience-engine` gains a `portfolio` handler that analyzes portfolio properties and generates intelligent recommendations. The `booking-portfolio-api` edge function is upgraded to optionally call the experience engine. The public `EmbedPortfolio` page gains AI recommendation cards and smarter filtering.

## 1. Experience Engine — `portfolio` Handler

**File**: `supabase/functions/experience-engine/index.ts`

Replace the generic fallthrough for `portfolio` with a dedicated handler. Two sub-actions via `payload.action`:

### `recommend` — AI bundle/grouping suggestions
- Fetches all portfolio member properties with their metadata (city, description, amenities, room types, rates)
- Calls Lovable AI (`google/gemini-3-flash-preview`) with tool calling to return structured output:
  - `semantic_groups`: properties grouped by theme (e.g. "Beach Escapes", "City Stays", "Family-Friendly")
  - `bundles`: suggested multi-property packages (e.g. "Cape Town + Winelands combo")
  - `featured`: AI-picked top property with reason
- System prompt stored in `rolos_experience_configs` for per-portfolio customization

### `search` — Semantic property matching
- Accepts `query` (natural language, e.g. "pet-friendly near the beach")
- AI scores each property against the query and returns a ranked list with match reasons
- Returns `{ results: [{ slug, name, score, reason }] }`

## 2. Upgrade `booking-portfolio-api` Edge Function

**File**: `supabase/functions/booking-portfolio-api/index.ts`

Add optional Experience Engine enrichment:
- New query param: `?ai=true`
- When `ai=true`, after building the standard `mapped` properties array, check if any portfolio member has `experience_engine_enabled`
- If so, call the experience-engine internally with `experience_type: 'portfolio'`, `action: 'recommend'`
- Append `ai_groups`, `ai_bundles`, and `ai_featured` to the response alongside existing `properties` array
- Backwards compatible — without `?ai=true`, response is unchanged
- Cache AI results for 5 minutes to avoid repeated AI calls

## 3. Enhanced `EmbedPortfolio` Page

**File**: `src/pages/EmbedPortfolio.tsx`

### AI Recommendation Banner
- If the portfolio API response includes `ai_featured`, show a highlighted "Featured" card at the top with the AI's reason
- Styled with a subtle gradient border using brand color

### Semantic Group Tabs
- If `ai_groups` are present, add horizontal pill tabs above the grid (e.g. "All", "Beach Escapes", "City Stays")
- Selecting a group filters to those properties
- Coexists with existing city filter — city filter applies within the selected group

### AI Bundle Cards
- If `ai_bundles` exist, render a "Suggested Packages" section below the main grid
- Each bundle card shows 2-3 property thumbnails, a bundle name, combined starting rate, and a "View Package" CTA
- Clicking opens the first property's booking page with a `bundle` query param (future use)

### Natural Language Search
- Replace the simple text input with an enhanced search that detects longer queries (>3 words)
- For short queries: existing client-side filter
- For longer queries: call the experience-engine `portfolio` handler with `action: 'search'` and display results ranked by AI relevance score with match reasons shown as subtle badges

## 4. PortfolioWidgetTab Admin Enhancement

**File**: `src/components/integrations/PortfolioWidgetTab.tsx`

- Add "Enable AI Recommendations" toggle (writes to `rolos_experience_configs` for the portfolio)
- Add "AI Theme" text input for custom system prompt guidance (e.g. "Focus on romantic getaways and adventure")
- Preview section shows AI groups/bundles when enabled
- New "Refresh AI Suggestions" button that calls experience-engine to regenerate

## Technical Details

### AI tool-calling schema for `recommend`
```json
{
  "name": "portfolio_recommendations",
  "parameters": {
    "properties": {
      "semantic_groups": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "group_name": { "type": "string" },
            "property_slugs": { "type": "array", "items": { "type": "string" } },
            "description": { "type": "string" }
          }
        }
      },
      "bundles": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "bundle_name": { "type": "string" },
            "property_slugs": { "type": "array", "items": { "type": "string" } },
            "pitch": { "type": "string" }
          }
        }
      },
      "featured": {
        "type": "object",
        "properties": {
          "property_slug": { "type": "string" },
          "reason": { "type": "string" }
        }
      }
    }
  }
}
```

### Caching strategy
The `booking-portfolio-api` stores AI results in a local variable with a 5-minute TTL keyed by portfolio slug. This avoids hitting the AI gateway on every page load while keeping recommendations fresh enough.

## Files

| Action | File |
|--------|------|
| Modify | `supabase/functions/experience-engine/index.ts` — add `portfolio` handler with `recommend` + `search` actions |
| Modify | `supabase/functions/booking-portfolio-api/index.ts` — add `?ai=true` param, call experience-engine, append AI data |
| Modify | `src/pages/EmbedPortfolio.tsx` — featured banner, group tabs, bundle cards, semantic search |
| Modify | `src/components/integrations/PortfolioWidgetTab.tsx` — AI toggle, theme input, refresh button |

No database migration needed — `rolos_experience_configs` already supports arbitrary JSONB config per property/type.

