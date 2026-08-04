# App-wide TOBI wording sweep

Every AI-powered feature is presented to users as **TOBI**. All model/vendor brands and generic "AI" wording disappear from anything a user can read.

## Rule

- Remove all vendor/model brands from user-visible text: Grok, xAI, Lovable AI, Gemini, GPT, OpenAI, "LLM".
- Replace generic "AI" wording with TOBI:
  - "AI Insights" → "TOBI Insights"
  - "Powered by Grok" → "Powered by TOBI"
  - "TOBI — AI Concierge" → "TOBI Concierge"
  - "AI-generated content" → "TOBI-generated content"
  - "AI amenity check" → "TOBI amenity check"
  - "AI credits exhausted" → "TOBI is temporarily unavailable — credits exhausted"
- Where "AI" was only decoration in a heading ("Revenue Pulse AI"), drop it or attribute to TOBI ("Revenue Pulse — TOBI").
- Keep TOBI's tone: TOBI is a named assistant, not a technology, so copy reads "TOBI reviews your website…" rather than "our AI reviews…".

## Where the wording lives

1. **Property setup / edit (admin + ROLOS)** — amenity check dialog and button, ROL spec auto-fill assist, brand voice card, room parser, image validation, editorial assist, email writer.
2. **Dashboards & insights** — Insight panel ("Powered by Grok" badge), Insights page, Revenue Pulse, PMS Command Centre suggestions, system alerts, dashboard insight toasts.
3. **Guest-facing** — booking concierge panel, embed concierge chat, portfolio/embed search hints, showcase review summaries, journey builder and itinerary copy.
4. **Integrations & widgets** — portfolio widget AI recommendations/theme guidance, integration asset generation.
5. **Onboarding wizard** — description enhancement messages.
6. **Connect marketing + legal** — home, features, pricing, FAQ, about, get started, terms, privacy: brands removed, features named as TOBI (e.g. "TOBI — your 24/7 operations manager").
7. **Edge function responses** — any error/status text returned to the browser (e.g. "Grok API error", "Gemini returned no content") reworded to TOBI-safe messages. Server logs may keep provider names for debugging.
8. **Dev/testing screens** — "AI-Assisted Testing" → "TOBI-Assisted Testing".

## Not changed

- Code identifiers, file names, edge function names (`ai-amenity-suggester`, `editorial-ai-assist`), table/column names, and env vars — renaming these is a refactor with deploy risk and no user-visible benefit.
- Model IDs and gateway endpoints in server code (`grok-*`, `google/gemini-*`, the AI gateway URL) stay as-is; they are configuration, not copy.
- Internal `console.log` diagnostics.
- Existing docs under `docs/` unless you want them rewritten too.

## Technical notes

- Sweep is string-only across `src/**/*.tsx|ts` and the user-facing `Response` bodies of `supabase/functions/**`; no logic, props, or state names change.
- Component display names stay (e.g. `AiAmenityDialog`); only rendered labels, placeholders, toasts, tooltips, and aria-labels change.
- After the sweep, a verification grep confirms no user-visible string contains Grok / xAI / Gemini / GPT / OpenAI / "Lovable AI", and that remaining "AI" hits are code identifiers or model config only.
- Edge functions touched for message wording get redeployed.
