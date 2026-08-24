# TOBI Reports: Conservative + Experimental Feedback

## Current guardrails (conservative pass, as it runs today)

The report insight prompt in `reports-xai-insights` is deliberately locked down:

- **Numbers are code-derived only.** Anomalies and totals are calculated in TypeScript (`reportAnomalies.ts`); the model may only use figures handed to it in `facts` and `snapshot`. It may not calculate, estimate, re-round or invent any number, month or percentage.
- **Period lock.** Only the six months of the report window (anchor month plus five, from `reportWindow.ts`) may be written about. Earlier months exist only as last-year comparatives inside a period month's line.
- **Fixed house style.** One line per month, chronological, blank line between, exact `"<Month> - <what happened>, <gap vs target/last year>!"` shape, `k` abbreviations, exclamation only when ahead, `"<Month> - no figures on the books yet."` when a month is empty. Exactly the months in `period.months`, no more, no fewer.
- **Slides are advisory only.** Pasted screenshots may influence `suggestions` and `flag_notes` only, must name the slide they came from, and may never contribute a figure to the narrative. Illegible slides are ignored silently, never guessed at.
- **Tone and vocabulary.** South African rand as `R129 000`, British/SA English, calm and plain, no hype words, no emojis, no markdown headings, no vendor/AI/provider names.
- **Strict JSON envelope** with fixed keys, and server-side clamping (narrative 1 800 chars, each suggestion 480 chars, chart line 240) before anything is stored.

That pass already runs on the reserve brain path (`preferFallback: true`), with a text-only retry when the vision pass is refused.

## What gets added: a second, freer opinion

Every flag and every suggestion topic gains a second reply written by an experienced revenue-management consultant persona — sharp, opinionated, hunting opportunities and warnings, allowed to reason beyond the strict house style. Each item then reads as a pair:

```text
Flag / topic A
  1. Conservative  — the guarded read, exactly as today
  2. Experimental  — the consultant's read, opportunities, risks, actions

Flag / topic B
  1. Conservative
  2. Experimental
```

Both replies stay together under their item, each clearly labelled. The experimental reply is tickable and editable like today's suggestions, so it can be published into the report when the reviewer chooses.

### Experimental persona guardrails (looser, but not unbounded)

- Free to interpret, prioritise, challenge the strategy and recommend actions, including on what the slides show.
- Still bound to: no invented figures presented as fact (any modelled number must be flagged as an estimate), the report period as the subject, no vendor/AI naming, rand formatting, and no owner-unsafe promises.
- Runs exclusively on the Grok xAI API — a dedicated forced-xAI path, never the gateway, and it never substitutes for the conservative narrative if it fails.

## Technical approach

- **New shared module** `supabase/functions/_shared/reportConsultant.ts`: the consultant system prompt plus a `runConsultantPass()` that posts directly to `XAI_CHAT_URL` with an explicit Grok model (vision model when slides are inlined, otherwise the chat model), reusing the same `userPayload`, `facts` and slide images the conservative pass received. No `AbortSignal.timeout`, no race deadlines.
- **`reports-xai-insights`**: after the conservative pass succeeds, run the consultant pass in the same invocation (one Generate button). It returns strict JSON: `experimental.flag_notes[<flag id>]`, `experimental.suggestions[<field>]`, and an optional `experimental.headline`. Results are clamped and stored in a new `experimental` JSONB column on `report_insights` (plus `experimental_provider` / `experimental_generated_at`), so a failure there leaves the conservative record intact and simply records that the second opinion is unavailable.
- **Migration**: add the `experimental` JSONB and metadata columns to `report_insights`; existing grants and RLS are unchanged.
- **`useReportInsights`**: read the new column and expose `experimental` alongside the current fields; selection keys for the second opinion are namespaced (`exp:<flag id>`, `exp:<field>`) so tick state and edited text reuse the existing `selections` mechanism.
- **`AiInsightsPanel`**: render each flag and each suggestion topic as one block containing both labelled replies — a "Conservative" badge on the existing text and an "Experimental" badge on the consultant reply — each with its own tick box, inline edit and copy. A quiet note appears when the second opinion could not be produced.
- **`revenue-report-draft`**: include ticked experimental lines in the printed commentary, keeping them grouped with their conservative counterpart's topic.
- Verify with a real generation on an existing run and read the response, per the AI-call rule.
