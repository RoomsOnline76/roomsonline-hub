

## Analysis

The plugin PHP code itself is clean — it only registers a shortcode via `add_shortcode()`. The **pages created** (Hotel Account, Hotel Booking Search, Hotel Cart, Hotel Checkout, Hotel Rooms, Hotel Thank You) are **not from our plugin** — they're from the Kadence WP Starter Templates or another hotel theme/plugin active on that WordPress site. Our plugin has no activation hook that creates pages.

However, the **activation failure** (status stays on "Activate" instead of showing "Deactivate") suggests a PHP fatal error during activation. The most likely cause: the generated PHP file might have encoding or invisible character issues from the JS template literal generation, or there could be a BOM (byte order mark) issue in the ZIP output.

### Root Cause for Activation Failure

The `phpSnippet` is built as a JS template literal. While `$atts`, `$base_url`, `$src` are correctly preserved (JS only interpolates `${...}` not bare `$var`), the issue is likely:

1. **UTF-8 BOM or encoding** — JSZip may include a BOM that WordPress's plugin loader doesn't handle well
2. **Whitespace before `<?php`** — any whitespace or newline before the opening PHP tag causes "headers already sent" errors that can prevent activation

### Plan

**File: `src/components/integrations/WordPressTab.tsx`**

1. **Trim the PHP snippet** — ensure no leading whitespace/newline before `<?php`
2. **Add `register_activation_hook` with an empty callback** — this is WordPress best practice and ensures the activation transient is set properly, which updates the plugin status in the UI
3. **Explicitly set UTF-8 encoding without BOM** when creating the ZIP file — pass `{ binary: false }` or ensure the string is clean
4. **Clarify to users** that the "Hotel" pages are not created by this plugin (add a note in the installation steps)

The PHP snippet change:

```php
// Add after the ABSPATH check, before the shortcode function:
register_activation_hook(__FILE__, function() {
    // Shortcode registered — no setup needed.
});
```

This ensures WordPress correctly marks the plugin as activated. Without an activation hook, some WordPress configurations (especially with object caching) don't properly flush the active plugins transient.

Also ensure the `phpSnippet` string starts exactly with `<?php` (no newline before it) by using `.trim()` or adjusting the template literal.

### Files to Modify

| File | Change |
|------|--------|
| `src/components/integrations/WordPressTab.tsx` | Add `register_activation_hook`; trim PHP snippet; add note about Hotel pages being from other plugins |

