

# ROLOS Property Website Integration Toolkit — Implementation Plan

## Overview

Build an integration toolkit that lets property owners generate embeddable booking widgets, direct links, and code snippets from an admin page. All bookings route through the existing `push-booking` flow with tracking metadata for commission deduction.

## Current State

- No `integration_configs`, `integration_logs`, or embed-related tables exist
- `push-booking` does not track `integration_type` or `source_url`
- `bookings` table has no integration tracking columns
- Commission calculation already works via `calculate-commission` + `property_commercial_terms`
- Navigation config and sidebar are well-structured for adding new sections

## Implementation Phases

### Phase 1: Database & Booking Tracking

**Migration — 3 new tables + ALTER bookings:**

```text
integration_configs
├── id (uuid pk)
├── property_id (uuid → properties)
├── integration_type (text: direct|widget|booking_bar|full_embed|wordpress|api)
├── config (jsonb — theme, position, etc.)
├── api_key (text, unique — for API/WordPress auth)
├── allowed_domains (text[] — CORS whitelist)
├── is_active (boolean)
├── created_at / updated_at
└── RLS: owner via property_owners + admin/dev

integration_logs
├── id (uuid pk)
├── property_id (uuid)
├── integration_type (text)
├── event (text: loaded|click|booking_initiated)
├── metadata (jsonb — source_url, user_agent, etc.)
├── created_at
└── RLS: owner read-only + admin/dev full

ALTER bookings ADD:
├── integration_type (text, nullable)
└── source_url (text, nullable)
```

No `integration_mappings` table needed initially — the jsonb `config` column handles all customization.

### Phase 2: Edge Functions

**1. `generate-integration-assets` (new)**
- Input: `property_id`, `integration_type`
- Fetches property slug, name, brand colors from DB
- Returns: generated code snippet (HTML/JS), instructions text, and preview URL
- Uses Lovable AI (gemini-3-flash-preview) to generate human-readable setup instructions per integration type
- No authentication required for snippet generation (property owner calls via admin UI with auth)

**2. `track-embed-interaction` (new)**
- Public endpoint (no JWT) — called from embedded widgets
- Validates property_id exists, logs to `integration_logs`
- Rate-limited by IP in application logic

**3. Extend `push-booking`**
- Accept optional `integration_type` and `source_url` from booking record
- After booking creation, persist these to the bookings row
- Commission calculation already handles the rest via existing triggers

**4. `wordpress-plugin-api` (new)**
- Authenticates via `api_key` from `integration_configs`
- Actions: `get_property_info`, `get_availability`, `create_booking_redirect`
- Returns property data + availability for WordPress shortcode rendering

### Phase 3: Admin UI — `/admin/integrations`

New page with property selector + tabbed interface:

```text
Tabs: Direct Link | Widget | Booking Bar | Full Embed | WordPress | API

Each tab contains:
├── Description & preview
├── Configuration form (theme colors, position, etc.)
├── Generated code snippet (copyable)
├── AI-generated installation instructions
└── Enable/disable toggle
```

**Components:**
- `IntegrationsPage` — main page with property selector (from user's owned properties)
- `IntegrationTab` — reusable tab shell
- `CodeSnippetBlock` — syntax-highlighted, copyable code block
- `IntegrationPreview` — live iframe preview of widget
- `ApiKeyManager` — generate/rotate API keys for API tab

**Route:** `/admin/integrations` — protected, owner+ role. Added to navigation under Workspace section.

### Phase 4: Embeddable Assets

**Widget script (`/embed/widget.js` served via edge function or static):**
- Self-contained JS that creates an iframe pointing to `/embed/property/{slug}`
- Accepts config: `data-property`, `data-theme`, `data-position`
- Sends `track-embed-interaction` on load

**Embed route (`/embed/property/:slug`):**
- New minimal React route — no sidebar/nav, just the booking search component
- Reads `?integration=widget&source=...` params
- Passes tracking params through to booking flow

**Booking Bar script:**
- Similar pattern — injects a fixed-position bar with date pickers
- Opens booking in new tab or iframe overlay

**WordPress plugin:**
- PHP file packaged as ZIP
- Settings page for property ID + API key
- Shortcode `[rolos_booking]` renders widget via iframe
- Generated dynamically by `generate-integration-assets`

### Phase 5: Revenue Pulse Integration

Extend the existing Revenue Pulse dashboard to show:
- Bookings by `integration_type` breakdown
- Commission per integration channel
- Source URL analytics

This is a filter addition to existing queries — minimal work.

## Navigation Changes

Add to `navigation.ts` workspace section:
```typescript
{ id: 'integrations', title: 'Integrations', icon: Code, href: '/admin/integrations', minRole: 'owner' }
```

## Security

- Widget/embed endpoints: reCAPTCHA on booking submission (already in place)
- API key auth for WordPress plugin API
- `allowed_domains` on `integration_configs` for CORS validation
- RLS on all new tables
- Embed routes are read-only; all mutations go through existing authenticated `push-booking`

## Sequencing

1. **Database migration** — tables + bookings ALTER
2. **Edge functions** — `generate-integration-assets`, `track-embed-interaction`, `wordpress-plugin-api`
3. **Embed route** — `/embed/property/:slug` minimal booking UI
4. **Admin integrations page** — property selector, tabs, code generation
5. **Widget/bar JS assets** — embeddable scripts
6. **Revenue Pulse filters** — integration channel breakdown
7. **WordPress plugin** — PHP package generation

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| No separate CDN | Serve widget JS via edge function | Simpler deployment, single source of truth |
| API key per integration | Stored in `integration_configs` | Property-scoped, rotatable, no shared secrets |
| Embed as iframe | Not web component | Cross-origin isolation, simpler security model |
| AI for instructions | Lovable AI gemini-3-flash | Fast, no API key needed, contextual help |
| No `integration_mappings` table | Use jsonb config | Over-engineering for current needs |

