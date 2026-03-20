

# ROL'OS Connect Portal — `connect.roomsonline.co.za`

## Summary

Build a public-facing developer/sales portal inspired by HomeRunner.io's structure and UX, tailored for ROL'OS. This is the front door for property managers, web agencies, and developers to discover, evaluate, and integrate with the ROL'OS platform. It includes a full API reference, downloadable documentation, a sales-focused TOBI assistant, and a polished marketing site — all within the existing React codebase, published to `connect.roomsonline.co.za`.

## Architecture

The portal will be a new section of routes under `/connect/*`, rendered using a dedicated `ConnectLayout` (no admin sidebar, no auth required — fully public). The domain `connect.roomsonline.co.za` will be pointed at the existing app, with hostname detection routing to the connect portal.

```text
connect.roomsonline.co.za
├── /                   → Hero + value proposition (HomeRunner-style landing)
├── /features           → Feature showcase (booking engine, PMS ops, analytics)
├── /integrations       → Supported PMS list + adapter pattern explanation
├── /pricing            → Pricing tiers + ROI calculator
├── /docs               → Interactive API reference (40+ actions documented)
├── /docs/quickstart    → Getting started guide
├── /docs/wordpress     → WP plugin installation guide
├── /docs/webhooks      → Webhook events reference
├── /get-started        → Contact/demo request form
└── /faq                → Categorized FAQ (Discover, Connect, Grow, Control)
```

## What Gets Built

### 1. Connect Layout Shell
New `src/components/layout/ConnectLayout.tsx` — clean, modern public layout with:
- Sticky header with ROL'OS logo, nav links (Features, Integrations, Pricing, Docs, FAQ)
- "Get a Demo" + "Get Started" CTAs in header
- Branded footer with links, social, "Powered by Rooms Online"
- No auth required, no admin sidebar

### 2. Landing Page (`/connect`)
HomeRunner-inspired hero section with:
- Bold headline: "The Native PMS & Booking Engine Built for African Hospitality"
- Property manager + Web Agency audience cards with CTAs
- Stats counter (properties managed, countries, booking volume)
- PMS integration logos (Hostfully, Benson, ROL'OS native)
- Client logo carousel
- Portfolio showcase cards (live property websites)
- FAQ accordion (categorized: Discover, Connect, Grow, Control, Start)

### 3. Features Page (`/connect/features`)
Feature grid covering:
- Native PMS operations (housekeeping, check-in/out, folios, night audit)
- Booking engine (real-time availability, multi-property search)
- Business intelligence (daily metrics, occupancy, revenue analytics)
- White-label integration toolkit (direct links, widgets, booking bar, WP plugin)
- Guest CRM and communication
- Multi-property portfolio management

### 4. Interactive API Documentation (`/connect/docs`)
The crown jewel — a developer-grade API reference:
- Left sidebar navigation with action categories
- Each of the 40+ actions documented with:
  - Description, method, endpoint
  - Request schema (parameters table)
  - Response schema
  - Copy-ready code examples (cURL, JavaScript, PHP)
  - Try-it playground (pre-filled JSON editor)
- Categories: System, Availability, Reservations, Rooms, Rates, Guests, Folios, Housekeeping, Inventory, Service Charges, Configuration
- Search/filter across all actions
- Downloadable PDF master document (generated via button click)

### 5. Quickstart Guide (`/connect/docs/quickstart`)
Step-by-step onboarding:
1. Request API credentials
2. Health check call
3. Fetch room types
4. Check availability
5. Create first reservation
With copy-ready code at each step.

### 6. WordPress Plugin Guide (`/connect/docs/wordpress`)
Installation walkthrough with:
- Download link for `rolos-plugin.zip`
- Setup wizard screenshots
- Gutenberg block usage
- Sync engine explanation

### 7. Pricing Page (`/connect/pricing`)
- Tier cards (Starter, Professional, Enterprise)
- Feature comparison matrix
- ROI calculator widget
- "Book a Demo" CTA

### 8. Get Started Page (`/connect/get-started`)
- Contact form (name, email, property count, PMS, message)
- Discovery call booking info
- Quick setup process steps
- Stores submissions in a new `connect_inquiries` table

### 9. TOBI API Assistant
A ringfenced version of TOBI specifically for the connect portal:
- New edge function `connect-assistant` with a sales-first system prompt
- Personality: helpful, knowledgeable about ROL'OS capabilities, commercial-minded
- Can answer technical API questions with code examples
- Suggests appropriate integration approaches
- Guides toward "Get Started" when ready
- Floating chat widget on all `/connect/*` pages
- Suggested prompts: "What PMS systems do you support?", "How does the API work?", "Show me a booking flow example", "What does the WP plugin include?"

### 10. Master API Document Download
- "Download Full API Reference" button in the docs section
- Generates a comprehensive PDF covering all 40+ actions, schemas, authentication, error codes
- Served from edge function that builds the document on demand

## Database

**New table: `connect_inquiries`**
```sql
CREATE TABLE connect_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  property_count TEXT,
  current_pms TEXT,
  message TEXT,
  source TEXT DEFAULT 'connect_portal',
  created_at TIMESTAMPTZ DEFAULT now()
);
-- No RLS needed — public insert, admin-only select
```

## Domain Routing

Update `src/App.tsx` and `src/lib/config.ts`:
- Add `CONNECT_DOMAIN = "https://connect.roomsonline.co.za"`
- Add hostname check: `isConnectDomain = window.location.hostname === 'connect.roomsonline.co.za'`
- When on connect domain, render only `/connect/*` routes within `ConnectLayout`
- All routes also accessible at `/connect/*` on the main domain for preview/development

## New Edge Function

**`supabase/functions/connect-assistant/index.ts`**
- Clone of `help-assistant` with a sales-focused system prompt
- System prompt includes: full API action catalog, pricing info, integration capabilities, competitive advantages
- No auth required (public-facing)
- Rate limited to prevent abuse

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/layout/ConnectLayout.tsx` | Public portal shell (header, footer, TOBI widget) |
| `src/pages/connect/ConnectHome.tsx` | Landing page |
| `src/pages/connect/ConnectFeatures.tsx` | Feature showcase |
| `src/pages/connect/ConnectIntegrations.tsx` | PMS integrations page |
| `src/pages/connect/ConnectPricing.tsx` | Pricing tiers |
| `src/pages/connect/ConnectDocs.tsx` | Interactive API reference |
| `src/pages/connect/ConnectQuickstart.tsx` | Getting started guide |
| `src/pages/connect/ConnectWordPress.tsx` | WP plugin docs |
| `src/pages/connect/ConnectFAQ.tsx` | Categorized FAQ |
| `src/pages/connect/ConnectGetStarted.tsx` | Contact/demo form |
| `src/components/connect/ConnectHero.tsx` | Hero section component |
| `src/components/connect/ConnectStats.tsx` | Stats counter |
| `src/components/connect/ConnectApiReference.tsx` | API action documentation renderer |
| `src/components/connect/ConnectApiPlayground.tsx` | Try-it code editor |
| `src/components/connect/ConnectPricingCards.tsx` | Pricing tier cards |
| `src/components/connect/ConnectTobiWidget.tsx` | Floating TOBI chat for portal |
| `src/components/connect/ConnectFAQAccordion.tsx` | Categorized FAQ component |
| `src/components/connect/ApiDocDownloadButton.tsx` | PDF generation trigger |
| `src/data/rolos-api-actions.ts` | Complete catalog of 40+ API actions with schemas |
| `supabase/functions/connect-assistant/index.ts` | Sales-focused TOBI edge function |
| DB migration | `connect_inquiries` table |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add connect domain detection + `/connect/*` routes |
| `src/lib/config.ts` | Add `CONNECT_DOMAIN` constant |
| `supabase/config.toml` | Register `connect-assistant` function |

## Design Direction

- Color palette: ROL'OS primary brand colors with a deep navy/indigo hero gradient
- Typography: Clean, modern — Inter/system font stack (already in use)
- Animations: Subtle entrance animations, counter animations for stats, smooth scroll
- Mobile-first responsive design
- Dark sections for hero and feature showcases, light for docs and forms
- Code blocks with syntax highlighting (already have CodeSnippetBlock component)
- Trust signals: property counts, client logos, PMS partner logos throughout

## Implementation Order

1. Data layer: `rolos-api-actions.ts` catalog + DB migration
2. Layout shell: `ConnectLayout` with header, footer, TOBI widget
3. Landing page: Hero, stats, FAQ, portfolio
4. API docs: Interactive reference with all 40+ actions
5. Supporting pages: Features, Integrations, Pricing, WordPress, Quickstart
6. Get Started form + inquiry storage
7. Connect-assistant edge function (sales-focused TOBI)
8. PDF download generation
9. Domain routing configuration

