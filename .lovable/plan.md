# Fix v4 cookbook branding leaks — 3 sections

Confirmed by reading the live page at `https://rolos.co.za/jongensfontein-com/`, the v4 docx, and the source generators. Three snippet families still leak branding across the canonical / white-label boundary:

## 1. Calendar Popover / "Check availability" button (page §4 + §10, v4 docx §8)

**Symptom:** WL "Check availability" button renders in ROL pink instead of the property blue.

**Root cause:** `SmartBookButtonGenerator.tsx` builds the popover / combo variants using a single `buttonBg` value driven by `brandColor` on both the canonical and the WL preview. In canonical mode `brandColor` is intentionally forced to `#E91E8C`, so the WL preview ends up sharing the pink swatch instead of the property brand.

**Fix:** In `SmartBookButtonGenerator.tsx`
- Split the "button background" resolution: canonical variant → always `#E91E8C`; WL variant → `property.brand_primary_color` (fallback pink only when brand color is empty).
- Ensure the WL popover/combo snippet also injects `wl=1&hide_powered_by=1&brand_color=<propertyBrand>` into the click-through URL query string (already done for `basic`; missing on the popover/combo templates).
- Update the two rendered preview `<button>` chips so the docx thumbnails and the Cookbook preview match the emitted snippet colour.

## 2. rol-embed.js — One-Liner Widget (page §7, v4 docx §5)

**Symptom:** WL widget preview still renders in ROL pink chrome even though the snippet carries `data-white-label="true"` + `data-brand-color="#1E4E8C"`.

**Root cause:** `WidgetTab.tsx` / `WidgetSetupWizard.tsx` emit the WL snippet with `data-wl-host="https://book.rolos.co.za"` but the ROLOS-hosted preview iframe (`WidgetPreviewFrame.tsx`) points at the canonical host and never appends `brand_color` to its `src` — so the embed page resolves as canonical (pink). `public/rol-embed.js` `buildEmbedUrl` also does not emit `brand_color` when `whiteLabel=true` but no `brandColor` attribute is supplied by the host page; the embed page then falls back to canonical pink instead of fetching the property brand.

**Fix:**
- `WidgetPreviewFrame.tsx`: when previewing the WL variant, append `wl=1&hide_powered_by=1&brand_color=<propertyBrand>` to the iframe `src` so the preview matches the copied snippet.
- `public/rol-embed.js`: when `config.whiteLabel === true` and no explicit `data-brand-color` is provided, still forward `wl=1` and let the embed page resolve the property brand from the API (do not silently drop the WL flag). Keep the current canonical behaviour unchanged.
- `WidgetTab.tsx` + `WidgetSetupWizard.tsx`: guarantee the emitted WL snippet always carries a non-empty `data-brand-color` (fall back to `property.brand_primary_color` when the wizard's colour picker is left blank).

## 3. WordPress Shortcode (page §11, v4 docx §9)

**Symptom:** Both canonical and white-label WordPress shortcode previews render in property blue.

**Root cause:** `WordPressTab.tsx` line 87 unconditionally embeds `color="${brandColor}"` in every generated `[rolos_booking]` shortcode:
```
[rolos_booking property="..." property_id="..." color="#1E4E8C"${wlAttrs}]
```
Even the "canonical" copy of that shortcode ships the property brand, so the plugin renders it as WL. There is no separate canonical variant.

**Fix:** In `WordPressTab.tsx`
- Emit **two** shortcodes side-by-side, mirroring the pattern used elsewhere:
  - **Canonical:** `[rolos_booking property="<slug>"]` — no `color`, no `whitelabel`, no `host`.
  - **White-label** (only when `wl.enabled === true`): `[rolos_booking property="<slug>" whitelabel="1"${verifiedHost ? ` host="https://<domain>"` : ""}]` — brand is inherited from the property config server-side by the WordPress plugin; `color=` is not needed.
- Remove the always-on `color="${brandColor}"` injection and drop `property_id` from the canonical variant (the plugin resolves it from the slug).
- Update the surrounding copy block to explain the two variants (canonical = ROL pink, WL = property brand, inherited automatically).
- Apply the same split to the portfolio shortcode block if present.

## 4. Regenerate the docx — `rolos-integrations-cookbook-jongensfontein-v5.docx`

Author a fresh version of the cookbook at `/mnt/documents/rolos-integrations-cookbook-jongensfontein-v5.docx` that:
- Uses the corrected snippets from #1–#3 above.
- Adds a short "Fixed in v5" callout at the top listing the three corrections (Calendar Popover WL colour, rol-embed.js WL preview, WordPress Shortcode canonical/WL split).
- Leaves every other section byte-identical to v4 (no gratuitous renumbering).
- Emits a `<presentation-artifact>` tag for the new file so the user can download it.

## Out of scope

- No changes to `EmbedProperty.tsx` branding resolution (already correct — the leaks are all in the snippet emitters / previews).
- No changes to WL domain verification, billing config, or `useWhitelabel`.
- The live Elementor page on `rolos.co.za/jongensfontein-com/` is authored in WordPress and will need to be re-pasted from ROLOS → Integrations after the fix — noted in the cookbook callout, not modified from code.

## Verification

After the code edits and docx regeneration:
1. Open ROLOS → Integrations → Widget for Fonteinhutte and confirm the WL preview iframe renders the property blue chrome.
2. Copy the WordPress shortcode canonical variant and paste into a scratch WP page — confirm the widget renders pink.
3. Copy the Calendar Popover WL variant into a WordPress HTML block — confirm the button renders blue and the click-through URL includes `wl=1&brand_color=%231E4E8C`.
4. Re-download v5 docx and visually diff §5, §8, §9 against v4 to confirm the corrections landed.
