# Content quality (MCQ) — one row per live listing

The Content quality card on Channel diagnostics currently walks every active property in the
database and prints a row for each channel listing it finds. That produces repeated unit names
(the test clones mirror the live chalets: Blaasoppie, Galjoen, Kabejou… appear under more than one
property record) and it wastes a lookup on the 100+ properties that hold no channel listing at all.

## What changes

1. **Only listings that actually exist on the channel are listed.** A property is included when it
   (or one of its units) holds a channel listing ID. Properties with no listing are skipped entirely
   instead of producing an empty pass through the resolver.
2. **One row per property + unit name.** When the same unit name resolves more than once inside a
   property, the rows collapse into one. The surviving row is the one with real evidence: a stored
   quality-check order wins over none, and the newest order wins between two.
3. **Retired channel accounts are excluded.** Listings that belong to an account in the retired list
   are dropped, so dead test accounts can never re-appear in the report.
4. **Counters follow the rows.** The five roll-up tiles (Passed / Failed / Awaiting result /
   Blocked at RU / Never ordered) are recomputed from the de-duplicated set, so the totals match the
   list underneath them.
5. **Card copy states the scope** — one line under the title saying the report covers listings
   currently published to the channel, so an empty section reads as "nothing published" rather than
   "nothing loaded".

Bulk "Order for all listings" and the per-row "Order check / Re-check" buttons keep working exactly
as they do now; they simply operate on the de-duplicated set.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`, `mcq_report` branch:
  - Pre-filter properties with a single query for units carrying a channel listing ID, plus the
    property-level listing ID, and iterate only that set — removes the per-property resolver call for
    properties with nothing published.
  - Build a `Map` keyed by `property_id + normalised unit label` (trimmed, case-folded). Keep the
    entry whose stored order is newest; when neither has an order, keep the first.
  - Drop targets whose owner account appears in `ru_retired_accounts` (reuse the existing shared
    retired-account helper rather than a new query).
  - Recompute `counts` and `total` from the final rows.
- `src/components/integrations/RuMcqReportPanel.tsx`: scope line in the header and the empty-state
  wording. No change to the order/re-check handlers.
- Redeploy `ru-cert-portal`, then reload the card and confirm the row count equals the number of
  distinct published listings and that no unit name repeats within a property.

No schema change, no change to how quality checks are ordered or how results are ingested.
