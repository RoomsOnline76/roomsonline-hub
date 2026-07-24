
## Why items 7–10 don't work today

I parsed `rolos-integrations-cookbook-jongensfontein-v2.docx` and compared every snippet against the deployed assets (`public/rol-embed.js`, `public/rol-sdk.js`) and the running `book.sleepinafrica.roomsonline.co.za` origin. Three problems:

1. **Wrong attribute names.** The docx uses `data-rol-embed="property|portfolio"` + `data-property` / `data-portfolio`. The real `rol-embed.js` looks for `data-rolos-property` and `data-rolos-portfolio`. Any container using the docx attributes is silently ignored — the widget never mounts.
2. **Wrong script host.** The docx points `<script src>` at `sleepinafrica.roomsonline.co.za/rol-embed.js`. That host does not serve the file (only `book.sleepinafrica.roomsonline.co.za/rol-embed.js` and the verified white-label host do).
3. **`rol-smart-btn.js` does not exist.** Items 9, 10, and portfolio 6 load `rol-smart-btn.js` and rely on `class="rol-smart-btn"` + `data-mode="combo|portfolio"`. There is no such asset — the anchor renders as plain text with no click behaviour.

Item 8's `data-checkin`, `data-checkout`, `data-adults`, `data-children`, `data-currency`, `data-theme` are also not read by the current `rol-embed.js`, so even after fixing 1 & 2 the "Advanced (Preselected + Currency)" snippet would ignore the presets.

## What I'll change

### 1. Small enhancement to `public/rol-embed.js`
Forward the extra data attributes as URL params to the embed page so item 8 (property) and portfolio item 5 actually preselect dates/guests/currency:

- New attrs read on both property and portfolio containers: `data-checkin`, `data-checkout`, `data-adults`, `data-children`, `data-currency`, `data-theme`.
- Mapped 1:1 to query params on the iframe `src` (`check_in`, `check_out`, `adults`, `children`, `currency`, `theme`). `EmbedProperty.tsx` and the portfolio embed already read these on load.

No other runtime behaviour changes; existing snippets keep working.

### 2. Regenerate cookbook as v3
Publish `/mnt/documents/rolos-integrations-cookbook-jongensfontein-v3.docx` with items 7–10 (property) and 4–6 (portfolio) rewritten to match the deployed contract. Everything else (1–6 property, 1–3 & 7–9 portfolio) is already correct in v2 and will be copied over unchanged.

Rewrites:

- **7. rol-embed.js — One-Liner Widget**
  - Attribute: `data-rolos-property="fonteinhutte-self-catering-chalets"` (+ `data-brand-color="#E91E8C"`).
  - Script src: `https://book.sleepinafrica.roomsonline.co.za/rol-embed.js` (canonical) / `https://book.rolos.co.za/rol-embed.js` (white-label, plus `data-white-label="true"`).

- **8. rol-embed.js — Advanced (Preselected + Currency)**
  - Same as 7 plus `data-checkin`, `data-checkout`, `data-adults`, `data-children`, `data-currency`, `data-theme` (now supported after enhancement 1).

- **9. Smart Button — Basic (Reserve your stay)**
  - Replace `rol-smart-btn.js` with a plain styled `<a>` linking to `/embed/property/<slug>?integration=smart_button&...` (matches what the in-app Smart Button generator emits today). Canonical + white-label variants.

- **10. Smart Button — Combo (Calendar + Guests)**
  - Replace with the anchor + hidden iframe pattern already produced by `SmartBookButtonGenerator` (`button_dates` recipe): a small booking bar with `<input type="date">` × 2 + guest select, and an on-click handler that opens `/embed/property/<slug>?check_in=…&check_out=…&adults=…` in a new tab (canonical) or same-domain iframe (white-label).

- **Portfolio 4. rol-embed.js — Portfolio Widget** and **5. Preselected**
  - Attribute: `data-rolos-portfolio="jongensfontein"` (+ `data-ref-portfolio="<uuid>"` forwarded as `ref_portfolio` query param). Preselect attrs same as property.

- **Portfolio 6. Smart Button — Portfolio Modal**
  - Replace `rol-smart-btn.js` with anchor + hidden iframe that loads `/embed/portfolio/<slug>?ref_portfolio=…` (matches the in-app portfolio Smart Button pattern).

WordPress shortcode items (property 11, portfolio 7) are already correct — the plugin ≥ 2.1 supports the `host` attribute — no changes there.

### 3. QA
- After writing v3, convert to PDF and eyeball each page image for layout regressions.
- Manually verify items 7 and 4 in a headless browser against `book.sleepinafrica.roomsonline.co.za` to confirm the iframe mounts and shows the property/portfolio.

## Deliverables

- Updated `public/rol-embed.js` with the new attribute pass-through.
- `rolos-integrations-cookbook-jongensfontein-v3.docx` in `/mnt/documents/` linked as an artifact.

### Technical notes
- `rol-embed.js` change is additive; existing containers without the new attrs behave exactly as before.
- No DB, edge-function, or Cloudflare Worker changes.
- The new attribute names in the docx (`data-rolos-property` / `data-rolos-portfolio`) already match what `PMSIntegrations → Widget` and the Smart Button generator emit inside the app, so the cookbook and in-app generators stay consistent.
