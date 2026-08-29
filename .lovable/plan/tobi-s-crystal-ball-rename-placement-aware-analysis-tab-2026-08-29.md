# TOBI's Crystal Ball — rename + placement-aware analysis tab

## What changes

1. **Rename** the second-opinion track from "Experimental" to **TOBI's Crystal Ball** everywhere it is user-visible (reply labels, badges, aria-labels, the "second opinion unavailable" note, and "Consultant's first point" → "TOBI's Crystal Ball — opening read"). Internal keys (`exp:` selection prefix, `experimental` fields, DB columns) stay unchanged so saved runs keep working.

2. **Show where every ticked comment will land.** Today a ticked comment is routed automatically when the report is built: a line that starts with a month in the report window (e.g. "Mar 2026 — …") prints inside that month's commentary card; everything else prints in the overall commentary block; "Accept" instead writes a suggestion into one of the four reviewer note fields (Minimum stay, Promotions, Rate overrides, General commentary). None of this is visible while reviewing.

   Each reply block gets a **destination chip** showing the resolved placement, computed live from the wording using the same month-token rule the report uses:
   - `Goes to: March 2026 commentary card`
   - `Goes to: Overall commentary`
   - `Goes to: Minimum stay notes` (for accepted suggestions)
   Chips only appear once the comment is ticked; unticked blocks read `Not in report`.

3. **Let the user set the destination.** A small placement selector next to the chip lets the reviewer override the auto-routing: any month in the report window, Overall commentary, or one of the four note fields. The choice is stored per selection and honoured by the report builder ahead of the text-sniffing rule, so wording no longer has to carry a month prefix.

4. **Layout / UX tidy-up of the analysis tab**
   - Group the panel into three clear zones with sticky sub-headers: **Review** (narrative), **Flags**, **Suggested commentary**.
   - Pair the two opinions side by side on wide screens (Conservative | Crystal Ball) instead of stacking, with the Crystal Ball card visually distinct (accent border + crystal-ball icon).
   - A **selection summary bar** at the top of the card: "6 comments will print — 4 month cards, 2 overall", with a "Preview placement" popover listing each destination and the lines under it, so the reviewer sees the final structure without generating a draft.
   - Per-block actions collapse into a compact row (tick, edit, revert, copy) with tooltips instead of bare icons.
   - Bulk controls on each section header: **Tick all conservative** / **Tick all Crystal Ball** / **Clear section**.
   - Empty and error states keep their current wording; regenerate button unchanged.

## Technical notes

- `src/components/reports/AiInsightsPanel.tsx`: rename labels, restructure into sections, add `PlacementChip` + placement `Select`, summary bar and bulk toggles. Split the file into `AiInsightsPanel.tsx` + `insightPlacement.ts` (shared resolver) + `ReplyBlock.tsx` to keep files small.
- New shared resolver `src/lib/reports/insightPlacement.ts` mirrors the month-token matching in `supabase/functions/_shared/revenueReportHtml.ts` so the UI chip and the printed output agree; the edge-side copy is refactored to accept an explicit placement first.
- `InsightSelection` in `src/hooks/useReportInsights.ts` gains an optional `placement?: string` (`"auto" | "overall" | "month:YYYY-MM" | "min_stay_notes" | …`). Stored inside the existing `report_insights.selections` JSONB — no migration needed.
- `supabase/functions/reports-xai-insights/index.ts`: `keepEditedSelections` must preserve `placement` across regeneration.
- `supabase/functions/revenue-report-draft/index.ts` passes `tobiCommentary` as `{ text, placement }[]`; `revenueReportHtml.ts` honours an explicit placement and falls back to today's token sniffing when placement is `auto`.
- Report window months for the selector come from the run's existing month list already loaded on the reports page.
