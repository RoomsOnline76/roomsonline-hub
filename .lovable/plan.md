# Retire the TOBI Integration Asset Generator

## What I found

The Smart Book Button generator does supersede it. On all three integration surfaces
(`/admin/integrations`, `/rolos/integrations`, and Edit Property → Integrations) the same
component set is already mounted: Smart Book Button plus Direct Link, Widget, Booking Bar,
Full Embed, WordPress, Elementor, API and Portfolio tabs. Those produce the snippet live,
with copy buttons, a rendered preview frame, brand colours, portfolio targeting and
white-label domain awareness.

The TOBI card in TOBI Utilities produces a strictly smaller result: one snippet per
integration type from a hardcoded `book.sleepinafrica...` base URL (no white-label host, no
portfolio option, no live preview). The only thing it has that the tabs don't is
AI-written, property-specific install instructions.

## Plan

1. **Move the one unique capability into the integration tabs.** Add a compact "TOBI: write
   install instructions" action to the integration surfaces, so the instructions sit next to
   the snippet the owner is actually copying. It sends the snippet and integration type that
   the tab already generated (correct white-label / portfolio URL included) and renders the
   returned steps under the snippet with a copy button.
2. **Retire the standalone tool.** Remove the "Integration asset generator" card, its
   integration-type select and its result panel from TOBI Utilities. The page keeps the
   editorial backfill and the image/data consistency check.
3. **Reduce the edge function to an instructions writer.** `generate-integration-assets`
   stops building snippets and URLs (that duplication is what made it drift and break); it
   accepts the snippet plus property id and returns instructions only. Same auth check, same
   AI model entry, fallback text retained when the model is unavailable.

## Technical notes

- Frontend: remove the assets card and `runIntegrationAssets` from `src/pages/AdminTobiTools.tsx`;
  add the instructions action to `src/components/integrations/CodeSnippetBlock.tsx` (or a small
  sibling component) so every tab on all three surfaces inherits it without per-page wiring.
- Backend: `supabase/functions/generate-integration-assets/index.ts` keeps its name (no route
  churn) but its body becomes: validate auth → load property name/city/country → ask TOBI for
  install steps for the supplied snippet → return `{ instructions }`. The snippet/preview_url
  builders and the `INTEGRATION_TYPES` mapping are deleted.
- No database or migration work.
