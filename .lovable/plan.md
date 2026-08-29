# Revenue Reports — opt-in Page 2: TOBI Assessment

An opt-in one-page assessment printed immediately after the cover: headline, primer, three highlights, early warnings, red flags, and a closing "what to watch". Default off. Fully editable, and edits survive regeneration.

## How it will work for you

1. On the TOBI analysis stage you get a **Page 2 — TOBI Assessment** card with a switch (off by default), a status pill (Empty / Generating / Ready / Edited / Stale / Failed), and **Generate Page 2**. If TOBI insights haven't run yet, one click does both under a single "TOBI is reading the figures…" label.
2. Under the switch, an inline editor mirroring the printed page 1:1 — headline, primer, exactly 3 highlights, 2–4 early warnings with Watch/Concern chips, 0–4 red flags with Concern/Critical chips (empty state: "No red flags on this as-of date."), and the close. Saves on blur, with a "Page 2 wording saved — it will print on the next rebuild" toast and a per-block **Revert to TOBI wording**.
3. The draft preview shows the page in situ (cover → Assessment → Revenue Performance…), the thumbnail rail counts it as `2 · Assessment`, and a branded A4 skeleton shows while generating.
4. Regenerate refreshes untouched blocks only; blocks you edited stay and are badged "Edited — kept". If the snapshot or insights move afterwards, the pill turns **Stale** with "Figures moved — regenerate Page 2" — never an automatic rewrite.
5. Switching it off omits the page and restores the old page numbering; your wording is kept and returns when you switch it back on.
6. Once you opt a property in, its future runs start with Page 2 on (a per-property preference, still off for properties that have never opted in).

Every figure on the page comes from the run snapshot or a stored TOBI flag — the writer is told to quote only numbers present in the payload, and blocks record the month keys / KPIs they cite for audit.

## Technical scope

**Data model** (one additive migration, RLS unchanged)
- `report_insights.page2 jsonb not null default '{}'` holding the `Page2Document` (enabled, status, provider, generated_at, generated_from_insights_at, headline, primer, highlights[3], warnings[2-4], flags[0-4], close, blocks_edited, last_edited_at/by, error). New column rather than reusing `experimental`, which the Crystal Ball pass owns.
- `report_runs.page2_enabled boolean not null default false` for the run's opt-in; the per-property default rides in `property_report_settings.report_profile` (`page2_enabled`) and seeds new runs.
- Shared types in `src/lib/reports/page2.ts` and `supabase/functions/_shared/reportPage2.ts` (severity, block, document, validators, word-count bounds).

**Generation** — extend `reports-xai-insights` with `action: "generate_page2"` (client sends only `run_id`); server composes property/room-count/source/as-of, snapshot totals and per-month OTB / previous / LY-or-STLY / ADR / occupancy / pickup / source mix, plus saved `narrative_final`, selected flag wording, included Crystal Ball notes and additional-input notes. xAI/Grok is the primary writer via the shared `aiChat` helper with `preferFallback: true`; on a transport/auth/quota/non-2xx failure it retries once through the gateway's Gemini tier with the identical JSON schema and voice. Strict server-side validation of lengths and array sizes, one repair retry, then `status: "failed"` with a human error — never a local template pretending to be TOBI. Records `provider` and `generated_at`; the printed page only ever says "Prepared with TOBI".

**Catalogue and organizer**
- `tobi_assessment` page definition added to `src/lib/reportPages.ts` and the `_shared/reportPages.ts` mirror, absent from `DEFAULT_PAGE_ORDER`.
- `useReportPageOrder` exposes it only when enabled; `SlideOrganizer` renders it as a locked, non-draggable row directly under the locked Cover row, hideable only via the opt-in switch, and counted in the organizer header badge.

**Printed page** — new `section.page[data-page="tobi_assessment"]` in `_shared/revenueReportHtml.ts`, injected into `builtPages` ahead of the data pages and emitted only when `enabled === true` with a document present. Same `pageChrome()` header/footer and `@page` margins as siblings; kicker `TOBI ASSESSMENT` on a `brand_primary` rule, headline in `brand_secondary`, eyebrow `{Property} · as at {date} · Prepared with TOBI`; three bands (primer / highlights-vs-warnings+flags / close); severity dots reuse the insights palette (Critical destructive, Concern primary, Watch muted). Prose and chips only — no charts or tables. Operator-edited bodies win over generated ones. Page numbering shifts existing pages by +1 when present; `revenue-report-draft` loads the new column and passes the document through. Excel and the Canva pack are untouched.

**UI**
- `src/hooks/useReportPage2.ts` — read/generate/save-block/revert/toggle, delegating to the insights function and patching `report_insights.page2`.
- `src/components/reports/page2/Page2Card.tsx` + `Page2Editor.tsx`, rendered in `StageInsights` (below the insights panel) with a compact mirror of the switch and status in `StageBuild` beside the preview.
- `DraftReportPreview` `pageCount` and jump-to-page derived from the real ordered page list instead of the current hardcoded 4/5 heuristic, so thumbnail numbers keep matching the printed sections.
- Over-length guard: an in-app "Page 2 is over length — shorten before print" warning after edits, and the page still prints footer-safe.

**Verification** — acceptance 1–10 from the brief, checked on one NightsBridge run and one PROTEL run: never-opted-in run unchanged, opted-in run renders in situ, edits survive rebuild and refresh and PDF, regenerate preserves edited blocks, opt-out restores numbering, provider fallback labelled quietly, both-down shows Failed with no invented page, cover stays locked first.
