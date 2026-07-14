
## Verdict

Yes — the WordPress add-on needs a review pass. The React tab already **composes** white-label-aware shortcodes (`whitelabel="1"` and `host="https://…"`), but the generated PHP plugin, the Gutenberg/Elementor widgets, and the CDN asset loader all **ignore** those attributes and hardcode `book.sleepinafrica.roomsonline.co.za`. Result: a WL-enabled property gets a snippet that _looks_ white-labelled in the UI but still renders the ROL-branded booking page on the customer's site. There are also net-new integration surfaces (portfolio direct link, Property Setup hub) with no WP counterpart yet.

## Scope of the review

**In:** WP plugin generator, shortcodes, blocks, Elementor widget, CDN loader, portfolio support, WL branding, surfacing from the ROLOS Property Setup hub.
**Out:** the PMS admin dashboard React app itself (uses its own auth flow), payment provider changes, non-WP integrations.

---

## Gaps found

### 1. Shortcode → embed URL: WL attrs are dropped
- `WordPressTab.tsx` emits `[rolos_booking property="…" whitelabel="1" host="https://mylodge.com"]`.
- `supabase/functions/wordpress-plugin-update/index.ts` → `Rolos_Shortcodes::booking_shortcode` hardcodes `$base_url = '${PUBLIC_DOMAIN}'` and never reads `whitelabel` / `host`.
- Same for `rolos_availability` and the Elementor `rolos_booking_widget` alias.
- No `wl=1` (or equivalent) forwarded to the embed URL — the embed page keeps ROL chrome (logo/footer/domain in address bar since iframe src is our host).

### 2. No `[rolos_portfolio_booking]` shortcode
The new `/embed/portfolio/:portfolioSlug` route added last iteration has no WP wrapper. A portfolio-tier owner cannot embed the multi-property booking UI on their WP site via a shortcode.

### 3. CDN asset host leaks brand
Plugin defines `ROLOS_CDN_BASE = book.sleepinafrica.roomsonline.co.za/wp-assets`. Every WL WP install loads block/admin JS from our brand host, visible in Network tab and CSP reports.

### 4. Plugin identity is not white-labelable
Plugin header (`Plugin Name: ROL'OS Plugin`, `Author: RoomsOnline`, `Author URI`, text domain `rolos`, menu labels) is fixed regardless of tier. For high-tier WL clients the WP admin should show the operator's brand.

### 5. `apiUrl` exposes the raw Supabase project
`apiUrl` = `${VITE_SUPABASE_URL}/functions/v1/roomsonline-pms-api` — puts the Supabase project ref into the WL customer's `wp-config`/settings. A branded proxy path (e.g. `https://api.<wl-domain>/pms/v1`) would keep the underlying infra opaque.

### 6. Gutenberg / Elementor controls miss WL toggles
`rolos-blocks.php` block attributes and the Elementor widget expose `brand_color` but no `whitelabel` / `host` control — so even if the shortcode PHP is fixed, block users still can't enable WL from the block editor.

### 7. WL host suggestion for webhooks
When a WL domain is Active, the Webhook URL input still shows `https://yoursite.com/wp-json/rolos/v1/webhook` — could default to the property's WL host.

### 8. Missing surface in the new ROLOS hub
`/pms/property-setup` (added last turn) doesn't reference the WordPress plugin, so ROLOS-PMS owners have to jump back to `/admin/integrations` to download/configure it.

---

## Proposed changes (prioritized)

### P0 — Correctness: honour white-label in generated PHP

1. In `Rolos_Shortcodes::booking_shortcode`, `availability_shortcode`, and the Elementor render:
   - Add `whitelabel` and `host` to `shortcode_atts`.
   - Resolve `$base_url` at render time: `!empty($atts['host']) ? esc_url_raw($atts['host']) : ROLOS_DEFAULT_HOST`.
   - Append `&wl=1` and `&hide_chrome=1` to the iframe `src` when `$atts['whitelabel'] === '1'`.
2. Add `ROLOS_DEFAULT_HOST` constant sourced from a new `stored_wl_host` option (see #4). Fallback = current `PUBLIC_DOMAIN`.
3. Ensure the embed target (`EmbedProperty.tsx` / `Booking.tsx`) already handles `wl=1` — verify during build; wire minimal hide-chrome CSS gate on `?wl=1` if it isn't already.

### P1 — Feature: portfolio shortcode + Gutenberg block

4. Add `[rolos_portfolio_booking portfolio="<slug>" whitelabel="1" host="…" height="720px"]` to `class-rolos-shortcodes.php` — iframes `/embed/portfolio/<slug>` with the same WL rules.
5. Add a matching Gutenberg block registration in `class-rolos-blocks.php` and an Elementor widget variant.
6. Surface a "Portfolio Booking" snippet in `WordPressTab.tsx` when the current property belongs to a portfolio (uses the same `portfolio.slug` fetched in `PortfolioDirectLinks`).

### P1 — Feature: block editor WL controls

7. Add `whitelabel` (toggle) and `host` (text, optional override) block attributes for `rolos/booking-widget` and forward them into the shortcode/iframe src. Default from the property's stored WL config, editable inline.

### P2 — Branding: white-labelable plugin identity

8. When `useWhitelabel(property).enabled === true`, generate the plugin with:
   - Plugin header `Plugin Name`, `Author`, `Author URI`, `Description` sourced from `property_billing_configs.white_label_brand_name` (new column or existing brand fields).
   - Admin menu label, dashboard title, and shipped icon derived the same way.
   - `Text Domain` remains `rolos` (breaking that would invalidate translations).
9. Ship a `wl-branding.php` file with runtime filters (`gettext`, `admin_footer_text`) so operators can override strings without regenerating.

### P2 — Infrastructure: neutral CDN + branded API

10. Serve `wp-assets` from a neutral host (`cdn.roomsonline.co.za/wp-assets/*`) or, when WL host is Active, from `https://<wl-domain>/rolos-cdn/*` via a WordPress rewrite. Update `ROLOS_CDN_BASE`.
11. Introduce a stable, brand-neutral API base for the plugin: keep the Supabase function reachable but present it to WP as `https://api.roomsonline.co.za/pms/v1/*` (Cloudflare Worker or Vercel rewrite → Supabase). Update the settings wizard to store the neutral URL. This is a follow-up infra ticket; note it in the plan but don't attempt in this pass.

### P3 — UX polish

12. In `WordPressTab.tsx`, prefill the Webhook URL with `https://<wl-domain>/wp-json/rolos/v1/webhook` when `wl.domain` is set and status is `active`.
13. Add a WordPress card to `PMSPropertySetup.tsx` so ROLOS-PMS owners see plugin download + shortcodes without leaving the ROLOS hub. Card imports the existing `WordPressTab` in a compact variant.

### P3 — Regression safety

14. Bump generated plugin `Version` and mark the auto-update payload with `min_wl_client: "2.1.0"` so already-installed sites pull the WL-aware release automatically via the existing 12-hour update check.
15. Add a small e2e smoke against `wordpress-plugin-update?download=<id>` verifying the generated `class-rolos-shortcodes.php` contains the new `whitelabel` handling.

---

## Order of build

1. P0 items 1–3 (single edit in `wordpress-plugin-update/index.ts` + verify embed URL respects `wl=1`).
2. P1 items 4–7 (portfolio shortcode, block controls, tab surfacing).
3. P2 item 8–9 (branding — needs a schema decision; see open question below).
4. P3 items 12–15.
5. Defer P2 items 10–11 to a separate infra plan.

## Files touched

- `supabase/functions/wordpress-plugin-update/index.ts` (shortcodes, blocks PHP, plugin header)
- `src/components/integrations/WordPressTab.tsx` (new snippet, WL webhook default)
- `src/wp-blocks/blocks/booking-widget.tsx` (attributes for WL + host)
- `src/wp-blocks/index.tsx` and `rolos-blocks.css` (portfolio block)
- `src/pages/pms/PMSPropertySetup.tsx` (surface WP card)
- Possibly `supabase/migrations/*` (only if we add `white_label_brand_name` in P2 — decide via open question)

## Technical notes

- `wl=1` / `hide_chrome=1` must be read by `EmbedProperty.tsx` (and `EmbedPortfolio.tsx`) to suppress the ROL top bar, footer, "Powered by" badge, and any outbound links to `book.sleepinafrica…`. Confirm existing WL rendering paths in those pages during build; if the flag is already respected under a different name, reuse it instead of introducing a new one.
- `wordpress-plugin-update` runs uncached but produces a large PHP string; keep the WL branching per-shortcode, not per-file, to avoid double-forking the plugin bundle.
- Auto-updates: the generator already bumps `plugin_version` on push. No new machinery needed — just ship a new release.

## Open questions before build

1. For P2 branding: do we already have a stored operator brand name for WL properties (column on `property_billing_configs` or `properties`), or should we introduce `white_label_brand_name` / `white_label_author_url` in a new migration?
2. For P1 portfolio block: should the WordPress shortcode use the **portfolio slug** or the **portfolio UUID**? I'd propose slug (mirrors direct-link URL) with UUID as fallback via `ref_portfolio=` query — confirm.
3. Confirm the embed URL flag name: is it already `wl=1`, or something else (`?whitelabel=1`, `?hide_chrome=1`)? I'll match whatever `EmbedProperty.tsx` already reads.
