# Fix false Channel Availability blockers

## Goal
Make the onboarding wizard judge “Availability coverage — rolling 365 days” from trustworthy evidence, so Fonteinhutte and the RU test clones are not blocked by incomplete channel read-backs when their ROL'OS Rate Plans and Calendar coverage are valid.

## Changes
1. **Classify channel calendar evidence explicitly**
   - Treat a response with open days but zero price points as incomplete, not as a valid failed calendar.
   - Keep a genuine, fully priced channel failure blocking; do not turn real availability gaps green.

2. **Use ROL'OS evidence when the channel response is incomplete**
   - Score the local Calendar + Rate Plan window per active unit.
   - Prefer valid local priced coverage only for units whose channel probe is missing/incomplete.
   - Preserve channel evidence for units that returned complete availability and pricing data.

3. **Keep every readiness surface consistent**
   - Apply the same evidence rule to the certification response, persisted readiness snapshot, and onboarding wizard phase result.
   - Report the actual source used for the availability result instead of labeling every requested probe as channel-derived.
   - Ensure refresh/re-score replaces the stale failing snapshot and invalidates the wizard query.

4. **Regression coverage and verification**
   - Add focused tests for: open-but-unpriced channel data with valid local coverage, genuine local failure, genuine priced channel failure, and mixed multi-unit evidence.
   - Re-score Fonteinhutte and RU Test Clones A–D against current data and confirm the wizard no longer blocks properties with valid authored coverage.

## Technical scope
- `supabase/functions/ru-cert-portal/index.ts`: evidence selection, per-unit fallback, response source, persisted score.
- `supabase/functions/_shared/ruReadiness.ts`: shared evidence classification and readiness checks.
- Focused readiness tests only; no new queues, gates, or onboarding features.
