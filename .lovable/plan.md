

# ROL'OS API UI Configurator — `/admin/api-configurator`

## Summary

A new admin page that provides a schema-driven configurator for all ROL'OS API consumer-facing UI elements — Gutenberg blocks, WP admin dashboard, embed widgets, and Smart Book buttons. Configuration is stored per-property in the database and served via a new API action, allowing future UI iterations without code deployments.

## What Gets Configured

**1. Gutenberg Blocks** — Toggle which blocks are available (Booking Widget, Property Explorer, Property Card), default attributes (brand color, height, labels)

**2. WP Admin Dashboard** — Toggle visible tabs (Metrics, Housekeeping, Check-in/out, Folios), custom tab labels, which metric cards to show

**3. Embed Widgets** — Default booking bar style, availability grid columns, calendar month count, custom CSS overrides

**4. Smart Book Button** — Default solution type, platform presets, CTA text options, allowed button styles

**5. API Feature Gates** — Toggle which API actions are exposed per property (e.g. disable `check_in`/`check_out` for properties not using native PMS operations)

## Database

New table `rolos_ui_configs` storing JSON configuration per property per UI component:

```sql
CREATE TABLE rolos_ui_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL, -- 'gutenberg_blocks', 'wp_admin', 'embed_widgets', 'smart_button', 'api_gates'
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(property_id, component_type)
);
-- RLS: admin/dev only
```

Also a global defaults row where `property_id IS NULL` — acts as the fallback config for all properties.

## New API Action

Add `get_ui_config` action to `roomsonline-pms-api` — returns merged config (global defaults + property overrides). This is what WP plugin / embeds call on init to know what to render.

## Admin Page

New page `src/pages/AdminApiConfigurator.tsx` at route `/admin/api-configurator`, added to the Edit & Audit sidebar group.

**Layout**: Property selector (or "Global Defaults") at top, then tabbed sections:

| Tab | Controls |
|-----|----------|
| Gutenberg Blocks | Toggle each block on/off, edit default attributes (color, height, labels), preview JSON |
| WP Admin Dashboard | Toggle tabs (metrics/housekeeping/checkin/folio), rename tab labels, select visible metric cards |
| Embed Widgets | Calendar config (months shown, date format), booking bar layout, custom CSS textarea |
| Smart Button | Default CTA text, allowed styles/sizes, platform defaults |
| API Gates | Checklist of all 40+ API actions with on/off toggles per property |

Each section has:
- Toggle switches for features
- Text inputs for labels/overrides
- JSON preview of the resulting config
- "Reset to Global Defaults" button
- Save writes to `rolos_ui_configs`

## Files to Create/Modify

| File | Action |
|------|--------|
| DB migration | Create `rolos_ui_configs` table + RLS + updated_at trigger |
| `src/pages/AdminApiConfigurator.tsx` | New — main configurator page |
| `src/components/api-configurator/GutenbergConfigTab.tsx` | New — block toggle/config panel |
| `src/components/api-configurator/WpAdminConfigTab.tsx` | New — dashboard tab config |
| `src/components/api-configurator/EmbedConfigTab.tsx` | New — embed widget config |
| `src/components/api-configurator/SmartButtonConfigTab.tsx` | New — button defaults config |
| `src/components/api-configurator/ApiGatesTab.tsx` | New — action-level feature gates |
| `src/App.tsx` | Add route `/admin/api-configurator` |
| `src/components/layout/AppSidebar.tsx` | Add "API Configurator" to Edit & Audit group |
| `supabase/functions/roomsonline-pms-api/index.ts` | Add `get_ui_config` action |

## How It Enables Future Iterations

The configurator decouples UI rendering decisions from code. When a new Gutenberg block or WP admin tab is added in a future release, it just needs a new key in the config schema — the configurator automatically surfaces it for toggling. The WP plugin reads `get_ui_config` on init and conditionally registers only the enabled blocks/tabs/features.

