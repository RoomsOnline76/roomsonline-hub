
## Fix TOBI Repetition on Portfolio Review Section

### What is happening
On the portfolio page, the "What guests are saying" section is rendering duplicate TOBI blurbs for the same property. From the current code, this is not primarily a chat-memory issue — it is a review-summary aggregation issue.

### Root cause
1. `sync-property-reviews` generates one TOBI blurb per property, but then updates `tobi_blurb` on every `property_review_cache` row for that property (`google`, `tripadvisor`, etc.).
2. `booking-portfolio-api` loops through every cache row and pushes a TOBI blurb each time it sees one.
3. Result: the same blurb appears multiple times on portfolio pages when a property has multiple review sources.

There is also a secondary quality issue:
- the blurb prompt is still allowing awkward “As TOBI…” phrasing, which makes the copy feel repetitive and over-branded.

### Implementation plan
1. **Deduplicate portfolio TOBI blurbs at API level**
   - Update `booking-portfolio-api` so each property contributes at most one TOBI blurb.
   - Deduplicate by `property_id` or `property_name`, not by source row.

2. **Make TOBI blurb storage/source handling cleaner**
   - In `sync-property-reviews`, stop effectively treating TOBI blurbs as source-specific review payloads.
   - Only use one blurb per property during aggregation, even if multiple cache rows exist.

3. **Tighten the AI prompt for review summaries**
   - Explicitly forbid:
     - “As TOBI…”
     - first-person self-introductions
     - repeating brand/property name more than once
     - generic sales fluff
   - Require a short editorial summary grounded in distinct review themes.

4. **Add a defensive UI safeguard**
   - In `EmbedPortfolioReviews`, dedupe incoming blurbs before rendering so the page stays clean even if duplicate data slips through again.

### Files to update
- `supabase/functions/booking-portfolio-api/index.ts`
  - dedupe `tobi_blurbs` before returning portfolio data
- `supabase/functions/sync-property-reviews/index.ts`
  - improve TOBI blurb generation prompt and handling
- `src/components/embed/EmbedPortfolioReviews.tsx`
  - add client-side dedupe safeguard before render

## Expected result
- Each property appears only once in the TOBI summary area
- No more repeated identical blurbs from Google/TripAdvisor rows
- Review summaries read more like polished guest insight and less like repetitive scripted copy

## Technical details
- Current duplication comes from this pattern:
  - `property_review_cache` contains multiple rows per property (`property_id + source`)
  - `tobi_blurb` is written onto all rows for the property
  - portfolio aggregation pushes every non-null `tobi_blurb` into `tobi_blurbs`
- Best fix is server-side dedupe first, UI dedupe second
- Prompt should produce neutral editorial copy, not a persona intro
