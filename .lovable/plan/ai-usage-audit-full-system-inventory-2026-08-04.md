# AI Usage Audit — Full System Inventory

All user-visible AI is branded **TOBI**. Under the hood there are three engines plus one crawler.

| Engine | Endpoint | Where the key lives |
|---|---|---|
| Lovable AI Gateway (Gemini) | `ai.gateway.lovable.dev/v1/chat/completions` | `LOVABLE_API_KEY` |
| xAI Grok (direct) | `api.x.ai/v1/chat/completions` | `XAI_API_KEY` |
| Firecrawl (web crawling, not a model) | `api.firecrawl.dev/v1/scrape` | `FIRECRAWL_API_KEY` |

---

## 1. Lovable AI Gateway — Gemini

| Function | Model | Action | Triggered by |
|---|---|---|---|
| `help-assistant` | gemini-3-flash-preview | TOBI help/support chat with property context | Button: TOBI widget (`TobiAssistant.tsx`, `PMSTobiAssistant.tsx`) — help pages + ROL'OS shell |
| `connect-assistant` | gemini-3-flash-preview | Public sales/pre-sales chat on connect site | Button: `ConnectTobiWidget.tsx` (connect.roomsonline.co.za) |
| `ai-booking-concierge` | gemini-3-flash-preview (Grok fallback) | Guest sales concierge during checkout, upsell prompts | Buttons + 8-sec idle auto-trigger: `AIConciergePanel.tsx`, `EmbedConciergeChat.tsx`, `TobiJourneyAssistant.tsx` |
| `ai-property-search` | gemini-2.5-flash | Natural-language property search → structured filters | Search box: `AISearchContext.tsx` (discovery/site search) |
| `ai-website-sync` | gemini-2.5-flash + Firecrawl | Scrape property website/TripAdvisor and auto-fill property record | Button "AI auto-fill" in Edit Property; also silent background sync (`silentWebsiteSync.ts`) |
| `enrich-property-content` | gemini-2.5-flash + Firecrawl | Enrich descriptions/brand voice from website | Button: ROL Spec tab (`ROLSpecTab.tsx`) |
| `editorial-ai-assist` | gemini-2.5-flash | Rewrite/expand editorial copy | Buttons: Journal editor, ROL Spec tab, onboarding Guest Experience step |
| `bulk-editorial-generate` | gemini-2.5-flash | Batch editorial generation across many properties | Backend/admin invocation only — no UI button currently wired |
| `enrich-property-experiences` | gemini-3-flash-preview (+ grok-3-latest) | Generate nearby experiences/attractions, distance-bounded | Button: `LocalExperiencesManager.tsx`; also called by itinerary PDF generator |
| `experience-engine` | gemini-3-flash-preview (5 call sites) | Guest experience rules, itinerary/portfolio enrichment, messaging copy | Command Centre, PMS messaging hook, Embed portfolio, Portfolio widget |
| `generate-itinerary-pdf` | gemini-2.5-flash | Write the enchanting brochure/itinerary narrative | Buttons: Journey confirmation, `ShareBrochureButtons.tsx` |
| `smart-room-parser` | gemini-2.5-flash | Parse free-text room description into structured room types | Button: `SmartRoomInput.tsx` (property rooms) |
| `verify-age-document` | gemini-2.5-flash (vision) | Read ID/passport to verify guest age for age-gated specials | Upload flow: `AgeVerificationUpload.tsx` at checkout |
| `validate-images-against-data` | gemini-2.5-pro (vision) | Check gallery images match the property's stated facts | Backend/admin invocation only — no UI button wired |
| `analyze-reviews` | gemini-2.5-flash | Sentiment/theme synthesis of aggregated reviews | Backend; part of review aggregation pipeline |
| `generate-integration-assets` | gemini-3-flash-preview | Produce integration/embed docs + asset copy | Backend only — no UI button wired |
| `daily-health-report` | gemini-3-flash-preview | Narrative summary of system health checks | Admin System Health / Dev Overview pages + `regular-health-check` cron |
| `ai-amenity-suggester` | Grok primary (see below) | — | — |

## 2. xAI Grok (direct API)

| Function | Model | Action | Triggered by |
|---|---|---|---|
| `ai-amenity-suggester` | grok-3-mini + Firecrawl | TOBI amenity/facility suggestions from the property website | Button: `AiAmenityDialog.tsx` in Amenities & Facilities (Edit + Setup Property) |
| `revenue-pulse-insights` | grok-3-mini-fast | Markdown revenue-insight commentary | Button/auto-load: `ROLRevenuePulse.tsx` dashboard card |
| `dashboard-insights` | grok-3-mini-fast | Narrative dashboard summary and metric analysis | `Insights.tsx`, `NarrativeSummary.tsx` |
| `sync-property-reviews` | grok-3-mini | Review sentiment synthesis during Google/TripAdvisor sync | `usePropertyReviews.ts` (on-demand refresh) + review sync pipeline |
| `enrich-property-experiences` | grok-3-latest | Secondary pass on experience enrichment | Same as Gemini entry above |
| `ai-booking-concierge` | grok-3-mini-fast | Fallback engine when Gemini call fails | Same as Gemini entry above |
| `generate-test-scenarios` | gemini-3-flash-preview | Generate QA test scenarios | Button: `ScenarioGenerator.tsx` (dev/testing) |

## 3. Firecrawl (crawling layer, no model)

Used only as the content source feeding the models above:
- `ai-website-sync` — property site, TripAdvisor page, plus extra "additional sources"
- `enrich-property-content` — property website
- `ai-amenity-suggester` — property website for amenity detection

## 4. Background / scheduled AI

- `regular-health-check` cron → `daily-health-report` (Gemini narrative).
- `silentWebsiteSync.ts` — background website re-scrape + Gemini fill on property load.
- Review aggregation pipeline → `sync-property-reviews` + `analyze-reviews`.
- `billing-subscription-cron` — no AI (listed for completeness).
- No AI is called from database functions or triggers.

## 5. Observations worth acting on

1. **Model sprawl:** 4 different Gemini versions in use (2.5-flash, 2.5-pro, 3-flash-preview) plus 3 Grok variants. A single shared model-selection helper would make upgrades one-line.
2. **Grok on 5 surfaces** while the platform default is the Lovable AI Gateway — these bypass gateway logging/credits and depend on `XAI_API_KEY`.
3. **Three orphaned AI functions** (`bulk-editorial-generate`, `validate-images-against-data`, `generate-integration-assets`) are deployed with no UI entry point.
4. **No shared rate-limit/credit-error handling** — 402/429 handling is duplicated per function.

Say the word if you'd like me to consolidate the model selection, migrate the Grok call sites onto the gateway, or surface the three orphaned functions in the admin UI.
