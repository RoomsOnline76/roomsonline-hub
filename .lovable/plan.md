

## Remote Auto-Update for WordPress Plugin

### How It Works

WordPress has a built-in plugin update system. Plugins can hook into the `site_transient_update_plugins` filter to check a custom server for new versions. When a new version is detected, WordPress shows the familiar "Update available" notice and the owner clicks "Update" — just like any other plugin.

### Architecture

```text
┌──────────────────────┐         ┌──────────────────────────┐
│  WordPress Site       │         │  Edge Function            │
│  (rolos-booking.php)  │────────▶│  wordpress-plugin-update  │
│                       │  check  │                           │
│  Checks every 12hrs   │◀────────│  Returns version info     │
│  via update filter    │  JSON   │  + download ZIP URL       │
└──────────────────────┘         └──────────────────────────┘
                                          │
                                          ▼
                                 ┌──────────────────────────┐
                                 │  integration_configs       │
                                 │  config->plugin_version    │
                                 └──────────────────────────┘
```

### Plan

**1. New edge function: `wordpress-plugin-update`**

A public endpoint (no auth needed — WordPress pings it) that handles two actions:
- `check` — returns the latest version number, download URL, changelog, and compatibility info as JSON (WordPress update API format)
- `download` — generates and returns the ZIP file on-the-fly using the property's current settings (slug, brand color, etc.)

The version is stored in `integration_configs.config->plugin_version` (default `"1.0.0"`). When the admin changes plugin settings or clicks "Push Update", the version is bumped, and all WordPress sites will see the update on their next check.

**2. Update PHP plugin to include auto-updater**

Add ~40 lines of PHP to the generated plugin that:
- Hooks into `site_transient_update_plugins` to check our edge function for new versions
- Hooks into `plugins_api` to show update details (changelog, "tested up to", etc.)
- Uses `property_id` from the shortcode attributes (stored as a plugin constant) to identify which property's config to check

**3. Add "Push Update" button to WordPressTab.tsx**

A button that bumps `config->plugin_version` in `integration_configs`, so the next time any WordPress site checks, it sees a new version available.

### Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/functions/wordpress-plugin-update/index.ts` | **New** — serves version check JSON + generates downloadable ZIP |
| `src/components/integrations/WordPressTab.tsx` | Add auto-updater PHP code to plugin; add "Push Update" button that bumps version in `integration_configs.config` |

### Key Details

- The PHP auto-updater uses `wp_remote_get()` to call our edge function — standard WordPress practice
- The edge function generates the ZIP dynamically using the **latest** property settings, so the updated plugin always has current branding/config
- Version is a simple semver string stored in the integration config's `config` JSONB column — no schema migration needed
- WordPress checks for updates every 12 hours by default; site owners can also manually check via Dashboard → Updates

