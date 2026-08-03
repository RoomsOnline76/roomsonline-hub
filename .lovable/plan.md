# Fix RU pricing readiness and portfolio season dates

## Goal
Unblock the Rentals United push when ROLOS has complete calendar or rack-rate coverage, and keep portfolio season dates aligned without copying prices.

## Changes
1. **Correct the RU 365-day price probe**
   - Parse the actual RU price response formats used by the existing push verification, including child `<Price>` values rather than relying only on a `Price="…"` attribute.
   - Probe every mapped RU unit for a multi-unit property, not only the first RU ID.
   - Report pass/fail and useful diagnostics per unit so one unit cannot incorrectly represent the entire property.

2. **Align readiness with the real push hierarchy**
   - Keep the established priority: calendar season rate first, then rack rate, then unit daily-rate fallback.
   - Score local coverage using the units that are actually mapped/pushed to RU, avoiding duplicate legacy room rows inflating the expected-day count.
   - Treat complete positive local coverage as push-ready before the first ARI publication; after publication, retain live RU verification as a sync-health result rather than a circular prerequisite that prevents the corrective push.
   - Update the readiness text to distinguish “ready to push local rates” from “rates verified on RU.”

3. **Keep portfolio season dates synchronized automatically**
   - When season definitions are saved for a portfolio property, propagate season names, date periods, colors, and stay rules to active sibling properties in the same portfolio.
   - Preserve every sibling property’s room/unit rates, rack rates, and season-specific price values.
   - Keep the existing manual sync tool available for non-portfolio/same-owner copying.

4. **Validate the Tidal Pools case**
   - Verify readiness against all four mapped RU units (ELF, GEELSTERT, LEERVIS, WILDEPERD).
   - Confirm the current successful RU verification logs are reflected in the scorecard and no false `Pricing 365d` blocker remains.
   - Confirm changing a season date updates Jongensfontein portfolio siblings without changing their prices.

## Technical details
- Reuse the RU price parser semantics already present in `push-property-to-ru` so push verification and certification cannot disagree.
- Add focused tests for RU child-element/attribute price XML, multi-unit aggregation, pre-push local fallback readiness, and portfolio season-date-only propagation.
- Do not modify the locked booking-orchestrator implementation in this change.
