

# Enhanced AI Revenue & Conversion Insights Dashboard

## Current State

- **`revenue-pulse-insights`** edge function exists — uses Lovable AI (Gemini) for ROL Pulse analysis
- **`dashboard-insights`** edge function exists — uses Lovable AI (Gemini) for owner/admin dashboard Q&A
- **`InsightPanelTrigger`** floats on both Dashboard and ROL Revenue Pulse pages
- **`XAI_API_KEY`** is already configured as a secret
- NightsBridge booking sessions with conversion tracking (`nightsbridge_booking_sessions`) already queried on Dashboard
- No xAI integration exists yet

## What Changes

Switch the AI backend from Lovable AI Gateway to xAI (Grok) for deeper, more opinionated revenue and conversion analysis. Enrich the context sent to the LLM with conversion funnel data, sync health, and multi-PMS distribution metrics. Surface richer insights in the existing UI — zero new components.

## Architecture

```text
Frontend (existing InsightPanelTrigger)
  │ sends prompt + enriched context
  ▼
revenue-pulse-insights  ──→  xAI API (api.x.ai/v1/chat/completions)
dashboard-insights      ──→  xAI API (api.x.ai/v1/chat/completions)
```

## Changes

### 1. Update `revenue-pulse-insights` edge function

- Switch from Lovable AI Gateway to xAI API (`https://api.x.ai/v1/chat/completions`, model: `grok-3-mini-fast`)
- Auth: `Bearer ${XAI_API_KEY}`
- Enhance system prompt with conversion funnel analysis capabilities:
  - Booking intent → conversion rate analysis
  - Channel mix optimization recommendations
  - Revenue per available property metrics
  - Sync health correlation to revenue gaps
- Accept enriched context: add `conversionData` (NB session stats) and `syncHealth` fields
- Keep 429/402 error handling (adapted for xAI rate limits)

### 2. Update `dashboard-insights` edge function

- Switch from Lovable AI Gateway to xAI API (same model)
- Enhance system prompt with owner-facing conversion language:
  - "Your property had X booking intents this month, Y converted"
  - Lead source attribution insights
  - Competitive positioning vs portfolio average
- Accept `conversionData` in `dashboardData` payload

### 3. Enrich context sent from `ROLRevenuePulse.tsx`

In the `InsightPanelTrigger.onAnalyze` callback, add to context:
- Conversion funnel data (fetch from `nightsbridge_booking_sessions` counts)
- Property acquisition pipeline summary
- Billing health indicators

### 4. Enrich context sent from `Dashboard.tsx`

In the `InsightPanelTrigger.onAnalyze` callback, add to `dashboardData`:
- `nbSessionStats` (already computed — just pass it)
- Property sync status summary
- PMS distribution breakdown (already available from properties query)

### 5. Upgrade `InsightPanel` display

- Render AI responses as markdown (bold, bullets, line breaks) instead of plain text
- Add a subtle "Powered by Grok" label in the sheet footer

## Files

| Action | File | Purpose |
|--------|------|---------|
| Modify | `supabase/functions/revenue-pulse-insights/index.ts` | Switch to xAI, enhanced prompts + context |
| Modify | `supabase/functions/dashboard-insights/index.ts` | Switch to xAI, conversion-aware prompts |
| Modify | `src/components/dashboard/ROLRevenuePulse.tsx` | Pass enriched context to insight panel |
| Modify | `src/pages/Dashboard.tsx` | Pass NB session + PMS data to insight panel |
| Modify | `src/components/InsightPanel.tsx` | Render markdown responses, Grok attribution |

