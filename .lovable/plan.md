# TOBI Insights: read the extra slides and screenshots

Today TOBI only sees the parsed snapshot (source files / imported prior workbook) plus the reviewer's manual notes. The pasted screenshots and custom "additional slides" are invisible to it, so recommendations ignore whatever the revenue team added by hand.

## What changes

- TOBI's recommendation pass will also receive every pasted screenshot on the run — the standard slots and every custom additional slide — with its section title and caption, in the report's current slide order.
- The screenshots are read **visually**: figures and trends inside each image (channel mixes, competitor rates, market screenshots) inform the recommendations, not just the titles.
- The narrative stays numbers-safe: month lines and financials remain driven only by the verified snapshot maths. Image-derived observations may only appear in the recommendation/commentary fields and flag notes, and are attributed to their slide ("Airbnb performance screenshot suggests…").
- Where a screenshot has a title but no readable data, TOBI ignores it rather than guessing.
- The TOBI panel notes how many slides were considered in the generation, so the reviewer can tell whether a newly pasted screenshot was included (regenerate after pasting).

## Technical notes

- `supabase/functions/reports-xai-insights/index.ts`:
  - Load `report_media` (slot_key, storage_path, caption, section_title, sort_order) joined with `report_media_slots` definitions, ordered by the run's `page_order`, then create short-lived signed URLs from the media bucket.
  - Inline each image as a base64 `image_url` content block (base64, not links, to stay under provider link caps); cap the pass at a sane number of images (e.g. 12, largest-first by slide order) and skip anything that fails to download.
  - Switch the call to `modelForTask("revenue_report_insights_vision")`, a new registry entry on `AI_TIER.vision` in `_shared/aiModels.ts` (never hardcode a model). Fall back to the existing text-only payload when no media exists or when the vision call returns a terminal 400/402/403 — insights must still generate.
  - Extend the system prompt with a "slides" section: images are context for recommendations only; never source a number for the narrative from an image; reference slides by their section title.
  - Add `slides_considered` (count + titles) to the persisted `report_insights` record and to the `insights_generated` run event.
- `src/components/reports/` TOBI panel: surface `slides_considered` as a small line under the generate button.
- Respect gateway error semantics: bounded retry only on 429/5xx, surface terminal statuses.
