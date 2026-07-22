# Integrations Code Cookbook — DOCX Document

Build a downloadable Word document that lists **every integration snippet** the ROLOS Integrations page can generate, filled in for:

- **Single property:** `Fonteinhutte Self-Catering Chalets` (only "Fontein" property in the workspace — no separate "fonteinsingle" exists)
- **Portfolio:** `Jongensfontein.com` (members: Fonteinhutte, Dassiesingel, SEESIG, Tidal Pools)

Each snippet is named exactly as it appears on the Integrations page, with a short "what it is / where to paste it" caption followed by the code block a customer would copy from the UI.

## Sections in the document

**Part A — Fonteinhutte (single property)**
1. Direct Booking Link — Booking URL (rooms entry)
2. Direct Booking Link — HTML Book Now button (solid / md, brand colour)
3. Floating Booking Bar — HTML + calendar (bottom position, brand colour)
4. Embedded Booking Widget — One-line `rol-embed.js` snippet
5. Embedded Booking Widget — Advanced (event listener)
6. Embedded Booking Widget — iframe fallback
7. Full Booking Engine — iframe (default 800px)
8. Smart Book Button Generator — Book Now button (HTML)
9. Smart Book Button Generator — Button + date pickers bar
10. Smart Book Button Generator — Embedded widget
11. Smart Book Button Generator — Button + hidden widget combo
12. Smart Book Button Generator — WordPress shortcode variant
13. WordPress Plugin — Booking shortcode `[rolos_booking …]`
14. WordPress Plugin — Property grid shortcode
15. WordPress Plugin — Portfolio booking shortcode (Jongensfontein)
16. Elementor — Booking Widget shortcode
17. Elementor — Property Card shortcode
18. Elementor — Availability Grid shortcode

**Part B — Jongensfontein Portfolio**
1. Direct Portfolio Link (shareable URL)
2. Portfolio Widget — One-line `rol-embed.js` (grid layout, brand colour)
3. Portfolio Widget — Iframe fallback
4. Portfolio Origin Tracking tag (drop-on-landing script)
5. Smart Button — targeted at portfolio (HTML button)
6. Smart Button — Portfolio + widget combo
7. WordPress — Portfolio booking shortcode

Each snippet uses the canonical published host (`sleepinafrica.roomsonline.co.za`) with `ref_property` / `ref_portfolio` and `brand_color` params that match what the live UI generates. White-label variants are noted where they change the snippet, but the copy in the document uses the default (non-WL) form because Fonteinhutte has no verified branded subdomain configured today.

## Delivery

- Format: `.docx`, US Letter, 1" margins, Arial, TOC linking to every snippet section
- Code blocks: monospaced (Courier New 9pt) inside a light-grey shaded table cell so it renders cleanly in Word and Google Docs
- Written to `/mnt/documents/rolos-integrations-cookbook-jongensfontein.docx` and surfaced with a `<presentation-artifact>` tag

## Technical details

1. Compute every snippet in a Node script by importing the same string templates the UI uses (buildEntryUrl for the property; portfolio URL builder inline) so the doc stays in sync with what the app produces. Property inputs pulled from DB: id `00015d06-a9cb-4e82-a62e-a7685e5d7c33`, slug `fonteinhutte-self-catering-chalets`, brand colour fallback `#e91e8c`. Portfolio inputs: id `22a7d374-7e2e-4194-8d32-aa870813359e`, slug `jongensfontein`.
2. Use `docx-js` (per docx skill) to emit the file: Heading 1 per Part, Heading 2 per snippet, small caption Paragraph, then a single-cell Table containing the code (avoids Word treating angle brackets as fields).
3. Validate with `python /tmp/validate_document.py`, then convert to PDF → page images and visually QA every page before delivering.
