## Goal
Make the WordPress plugin integration docs visually concrete — replace generic "Installation Steps" and shortcode blocks with a step-by-step walkthrough that shows exactly what the user will see in `wp-admin`, plus copy/paste-ready examples with visual annotations.

## Scope
Two doc surfaces to enrich (docs/UI only — no business logic changes):

1. **`src/components/integrations/WordPressTab.tsx`** — the per-property Integrations → WordPress panel that owners actually use to install the plugin.
2. **`src/pages/connect/ConnectWordPress.tsx`** — the public marketing/docs page at `/connect/wordpress`.

## What changes

### A. New reusable component: `WordPressVisualWalkthrough.tsx`
A single component both surfaces embed. Contains:

- **Step cards** (numbered, illustrated) for the 6-step install:
  1. Download ZIP (screenshot-style mock of the download button state)
  2. Upload in `Plugins → Add New → Upload Plugin` — mock of WP screen with the "Choose File" and "Install Now" buttons highlighted
  3. Activate — mock of "Plugin activated" success banner (matches the screenshot the user just uploaded)
  4. Open `Settings → ROL'OS` — mock of the sidebar with ROL'OS menu item circled
  5. Paste API Endpoint + API Key — annotated form mock with arrows pointing to the two fields, and a callout "copy these from the API tab"
  6. Click **Sync Now** — mock of the sync status pill going from grey → green
- Each step: left = mini SVG/HTML mock of the WP screen, right = plain-language instruction + the exact values to paste (endpoint URL + `x-api-key` header name).
- Built with pure Tailwind + shadcn primitives (Card, Badge). No external images — SVG/HTML "browser chrome" mockups so it renders in every theme, mobile-first.

### B. Shortcode & block usage — visual examples
Replace the current bare `CodeSnippetBlock` list with a tabbed section:
- **Tab: Gutenberg** — mock of the block inserter showing "ROL'OS" search results, then a preview of the rendered booking widget.
- **Tab: Elementor** — mock of the Elementor widget panel with the 3 ROL'OS widgets, then a mini rendered example.
- **Tab: Shortcode (Classic)** — the existing shortcodes with a "Result preview" panel next to each showing what the frontend renders.
- **Tab: PHP (theme)** — `do_shortcode()` example for developers.

### C. "What good looks like" configuration checklist
A compact card at the top of the WordPress tab with green/amber checks pulled from existing state:
- Plugin downloaded & version detected (from `integration_configs.config.plugin_version`)
- API test passed (existing `handleTestConnection`)
- Webhook active (existing `webhookSub`)
- White-label host wired (existing `useWhitelabel`)

Uses data already fetched — no new queries.

### D. Public `/connect/wordpress` page
Reuse `WordPressVisualWalkthrough` on `ConnectWordPress.tsx`, replacing the current text-only "Installation" ordered list. Keep hero, features, and CTA sections untouched.

## Out of scope
- No changes to the plugin ZIP builder (`wordpress-plugin-update` edge function).
- No changes to the WordPress plugin PHP itself.
- No new database tables or edge functions.
- No changes to webhook/API logic.

## Files
- New: `src/components/integrations/WordPressVisualWalkthrough.tsx`
- Edit: `src/components/integrations/WordPressTab.tsx` — swap the plain "Installation Steps" block for `<WordPressVisualWalkthrough />` and add the config checklist card.
- Edit: `src/pages/connect/ConnectWordPress.tsx` — replace the text-only install list with `<WordPressVisualWalkthrough compact />`.
