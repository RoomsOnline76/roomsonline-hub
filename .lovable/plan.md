

# Add Elementor Widget to ROL'OS Integrations

## Current State
- A basic Elementor booking widget PHP class exists in the plugin generator (`generateElementorWidget()`) but it only has 2 controls (property_id, height) and just wraps the booking shortcode
- No dedicated Elementor tab exists in the integrations UI
- ConnectWordPress page says "Elementor widgets (coming soon)" — needs updating
- No Elementor-specific widgets for Property Card, Availability Grid, or Property Explorer

## Changes

### 1. Expand Elementor widgets in plugin generator (`wordpress-plugin-update/index.ts`)
Upgrade `generateElementorWidget()` to produce **3 full Elementor widgets** in a single PHP file:
- **ROL'OS Booking Widget** — brand color, layout (compact/standard/full), height, custom CSS class, button text
- **ROL'OS Property Card** — property_id, show price toggle, show availability toggle, button color, card style (minimal/detailed)
- **ROL'OS Availability Grid** — property_id, months to display (1-6), color scheme

All widgets register under a custom "ROL'OS" Elementor category with proper icons. Each widget uses the existing shortcodes as render backend.

### 2. Create `ElementorTab.tsx` integration component
New tab component (`src/components/integrations/ElementorTab.tsx`) showing:
- Elementor detection status (checks if Elementor is active via the plugin)
- Visual preview cards for each of the 3 widgets with screenshots/illustrations
- Copy-paste shortcode fallbacks for each widget
- Step-by-step instructions: install plugin → open Elementor editor → search "ROL'OS" → drag widget → configure
- Link to the WordPress plugin download

### 3. Add Elementor tab to all integration pages
Add an "Elementor" tab (with Elementor diamond icon) to:
- `PMSIntegrations.tsx` — expand grid from 7 to 8 columns
- `PropertyFormIntegrationsTab.tsx` — add tab
- `AdminIntegrations.tsx` — add tab

### 4. Update ConnectWordPress page
- Remove "(coming soon)" from the Elementor features line
- Add a dedicated Elementor section with widget descriptions and usage examples

### 5. Update API docs reference
Add Elementor widget documentation to `rolos-api-actions.ts` under a note in the WordPress/Widget category describing the available Elementor widgets and their controls.

## Files
1. **Modify** `supabase/functions/wordpress-plugin-update/index.ts` — Expand `generateElementorWidget()` with 3 widgets + ROL'OS category
2. **Create** `src/components/integrations/ElementorTab.tsx` — Dedicated Elementor integration UI
3. **Modify** `src/pages/pms/PMSIntegrations.tsx` — Add Elementor tab
4. **Modify** `src/components/property/PropertyFormIntegrationsTab.tsx` — Add Elementor tab
5. **Modify** `src/pages/AdminIntegrations.tsx` — Add Elementor tab
6. **Modify** `src/pages/connect/ConnectWordPress.tsx` — Remove "coming soon", add Elementor section
7. **Modify** `src/components/integrations/IntegrationDocumentation.tsx` — Add `elementor` doc type

