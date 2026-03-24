

# Multi-Brand Collections, Multi-Unit Auto-Assignment & Portfolio Groups

## Overview
This is a three-pillar feature set that extends the existing PMS-agnostic architecture without touching any booking UI, calendar, or `fetchPmsAvailability()` layer. All new data is additive (JSONB columns, one new table) and all new logic lives in edge functions and admin forms only.

## Technical Design

### Pillar 1: Multi-Brand / Multi-Website Collections

**Database migration:**
- Add `collections JSONB DEFAULT '[]'` column to `properties` table
- Each entry: `{ collection_id, name, slug, branding: { primary_color, logo_url }, pricing_rules: { markup_percent, markup_flat }, availability_rules: { stop_sell, min_stay, max_stay }, navigation_tags: [], is_active }`
- Add optional `collection_id TEXT` column to `pms_mappings` for external mapping support
- Update `public_properties` view to include `collections`

**UI — PropertyForm ROLSpecTab extension:**
- Add "Collections" card below Navigation Tags
- Reuse the tag-toggle pattern: add/remove collection objects via a mini form (name, slug, brand color picker, pricing overrides, availability rules)
- Each collection shows as an expandable card with inline editing
- Auto-generate `collection_id` as slugified name

**Edge function awareness:**
- `booking-widget-api` and embed routes accept optional `?collection=slug` param
- When present, the embed reads `property.collections` and applies that collection's branding/pricing overrides
- No changes to `push-booking`, `roomsonline-pms-api`, or any PMS adapter

### Pillar 2: Multi-Unit Auto-Assignment Engine

**Database migration:**
- Add columns to `pms_mappings`: `parent_room_type_id TEXT`, `child_unit_ids JSONB DEFAULT '[]'`, `assignment_mode TEXT DEFAULT 'none'` (values: `none`, `round_robin`, `lowest_occupancy`, `manual`)
- Add `multi<lov-plan>

# Multi-Brand Collections, Multi-Unit Auto-Assignment & Portfolio Groups

## Overview
Three-pillar feature set extending the existing PMS-agnostic architecture. All new data is additive (JSONB columns, one new table). All new logic lives in edge functions and admin forms only. Zero changes to booking UI, calendar, or `fetchPmsAvailability()`.

## Technical Design

### Pillar 1: Multi-Brand / Multi-Website Collections

**Database migration:**
- Add `collections JSONB DEFAULT '[]'` to `properties` table
- Each entry: `{ collection_id, name, slug, branding: { primary_color, logo_url }, pricing_rules: { markup_percent, markup_flat }, availability_rules: { stop_sell, min_stay, max_stay }, navigation_tags: [], is_active }`
- Add optional `collection_id TEXT` to `pms_mappings`
- Update `public_properties` view to include `collections`

**UI — ROLSpecTab extension:**
- Add "Collections" card below Navigation Tags
- Add/remove collection objects via expandable mini-forms (name, slug, brand color, pricing overrides, availability rules)
- Reuse existing tag-toggle and color-picker patterns

**Edge function awareness:**
- `booking-widget-api` and embed routes accept optional `?collection=slug` param
- When present, apply collection's branding/pricing overrides in the embed layer
- No changes to `push-booking` or any PMS adapter

### Pillar 2: Multi-Unit Auto-Assignment Engine

**Database migration:**
- Add to `pms_mappings`: `parent_room_type_id TEXT`, `child_unit_ids JSONB DEFAULT '[]'`, `assignment_mode TEXT DEFAULT 'none'` (values: `none`, `round_robin`, `lowest_occupancy`, `manual`)
- Add `multi_unit_config JSONB` to `properties` (stores `{ enabled: boolean, default_mode: string }`)

**Push-booking extension (atomic sub-step):**
- After live PMS availability verification and before PMS reservation creation
- If property has `multi_unit_config.enabled = true` and the booked room_type has child units in `pms_mappings`:
  - Query `property_availability` for child unit occupancy in the date range
  - Apply assignment algorithm (round_robin: track last-assigned; lowest_occupancy: pick unit with fewest booked nights)
  - Set `assigned_unit_id` on the booking record
  - Pass assigned unit to PMS adapter's `create_reservation` if the adapter supports it
- Fallback: if no units configured or assignment fails, proceed normally (room-type level booking)

**UI — PropertyForm admin section:**
- Add "Multi-Unit Configuration" card in the property admin area (visible when property has room types with multiple physical units)
- Toggle to enable multi-unit mode
- Per room-type: define child units (name, external ID) and assignment mode
- Read-only display of current assignment stats

### Pillar 3: Multi-Property Portfolio Groups

**Database migration:**
- Create `property_portfolios` table:
  ```sql
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  owner_id UUID REFERENCES auth.users(id),
  parent_portfolio_id UUID REFERENCES property_portfolios(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
  ```
- Create `property_portfolio_members` junction table:
  ```sql
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES property_portfolios(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  UNIQUE(portfolio_id, property_id)
  ```
- RLS: owners see their portfolios; admins/devs see all
- Enable realtime on both tables

**UI — PMSPortfolio.tsx enhancement:**
- Add portfolio filter/selector above the existing property grid
- "Create Portfolio" button → name + select properties modal
- When a portfolio is selected, KPI cards and chart filter to that portfolio's members only
- Existing per-property cards remain unchanged

**UI — PropertyForm:**
- Add "Portfolio" dropdown in general tab to assign property to one or more portfolios

**Insights/Dashboard integration:**
- `dashboard-insights` edge function accepts optional `portfolio_id` param
- Aggregates KPIs across portfolio member properties
- PMSPortfolio page passes portfolio filter when active

**Cross-property search:**
- Extend `ai-property-search` to accept `portfolio_id` filter for scoped results

### Pillar 4: Config & Documentation Updates

**`pms-implementation-master.json`:**
- Add to `global_field_rules`: `collections`, `multi_unit_config`, `portfolio_group` — all marked `source: "admin_only"`, `authoritative: false`

**API docs (`rolos-api-actions.ts`):**
- Document collection-aware embed parameters
- Document multi-unit assignment response fields
- Document portfolio endpoints

## Files Summary

| Action | File | Purpose |
|--------|------|---------|
| Migration | SQL | Add `collections` + `multi_unit_config` to properties, `collection_id`/unit columns to pms_mappings, create portfolio tables + RLS |
| Modify | `src/components/property/ROLSpecTab.tsx` | Collections manager UI |
| Create | `src/components/property/MultiUnitConfigPanel.tsx` | Multi-unit assignment config |
| Create | `src/components/property/PortfolioSelector.tsx` | Portfolio assignment dropdown |
| Create | `src/components/portfolio/PortfolioManager.tsx` | Create/edit portfolio modal |
| Modify | `src/pages/pms/PMSPortfolio.tsx` | Portfolio filter + scoped KPIs |
| Modify | `supabase/functions/push-booking/index.ts` | Auto-assignment sub-step |
| Modify | `supabase/functions/booking-widget-api/index.ts` | Collection-aware branding |
| Modify | `supabase/functions/dashboard-insights/index.ts` | Portfolio-scoped aggregation |
| Modify | `src/pages/EmbedProperty.tsx` | Read collection param for branding |
| Modify | `src/config/pms-implementation-master.json` | New field rules |
| Modify | `src/data/rolos-api-actions.ts` | API documentation |

## Acceptance Criteria Mapping
1. Collections require zero booking/calendar UI changes — branding applied at embed layer only
2. Auto-assignment runs after live PMS verification, before reservation creation — never from cache
3. Portfolio features fully optional — single-property flows untouched (no portfolio = no filter)
4. All new tables have RLS (owner-scoped + admin/dev override)
5. PMS adapters unchanged — only `push-booking` gets optional unit assignment passthrough
6. New fields marked `admin_only` in `pms-implementation-master.json`
7. Snake_case throughout, audit logging via existing triggers

