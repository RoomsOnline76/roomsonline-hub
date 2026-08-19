# Fonteinhutte go-live: steps show as not passed

## What is happening

The Onboarding list says 92% for Fonteinhutte, but opening the property shows 0/14 steps and every step circle grey.

Verified findings:

- The step ledger for this property holds only 7 graded verdicts (identity, location, rooms, media, commercial, publish, currency all `passed`). The other 7 rows (push owner, keys, company profile, sub-account verification, pull listings, enable channel manager, connect) are still `pending` from the initial seed with no verdict at all.
- Those 7 ungraded steps are "channel class" steps. The background drain and the wizard's own refresh both re-grade local-class steps only, so those rows can never receive a verdict without a live channel probe — they stay verdictless indefinitely.
- As soon as the ledger reports even one verdict, the wizard treats the ledger as authoritative and switches OFF its local grading inputs (the activation-readiness call and the channel scorecard). The fallback path for verdictless steps then has no field data to judge, so those steps read as not passed, and a stage with no field items scores 100% while nothing inside it is marked complete — exactly the mix in the screenshot.
- Whether the page shows 0/14 or 13/14 depends on which query lands first: a fresh load where readiness resolves before the ledger still shows 13/14. So the display is a race, not a data loss — nothing about the property regressed.

## What to change

1. Never turn off local grading because of the ledger. Keep the cheap local/activation readiness always on; the ledger overlays a step only where it holds a real verdict. Only the expensive live channel scorecard stays opt-in (explicit "Recheck channel").
2. Never let a verdictless or unknown channel-class step read as failed. With no channel evidence, such a step keeps its last pass, or shows as advisory "awaiting channel confirmation" — it must not un-complete work and must not drop the counter.
3. Progress must not regress. The header counter and percentage take the better of the stored verdicts and the locally computed truth, so a property at 13/14 can never paint 0/14 while data is still arriving.
4. Grade what is locally decidable. Keys stored/verified, push owner (sub-owner id present), company profile pushed, manual sign-off, listing pull recorded, and channel-manager entitlement are all ROL'OS database facts. Move them out of the "channel probe only" class so the drain and the wizard refresh record real verdicts for them instead of leaving permanent `pending` rows.
5. One-off backfill: re-grade the existing seeded-but-ungraded rows across properties (Fonteinhutte first) so stored state matches reality immediately.
6. Align the list page with the wizard so 92% on the list and the property header cannot disagree: both read the same verdict-plus-local-truth combination.

## Technical notes

- `src/hooks/useRolosOnboardingProgress.ts`: stop passing `backendChecks: !ledgerActive` / `channelChecks: !ledgerActive` to `usePropertyReadiness`; keep backend checks on unconditionally and gate only the channel scorecard. Keep the existing `ledgerHasVerdict` overlay, and make `overall` use max(ledger complete, local complete) per macro.
- `src/config/channelStepLedger.ts`: move `push_owner`, `keys`, `company_profile`, `pull_listings` (recorded pull), `entitlement` and `signoff` from `CHANNEL_CLASS_LEDGER_STEPS` into the local class; leave `publish`, `currency` and `connect` as channel class.
- `supabase/functions/ru-cert-portal`: ensure `ledger_recheck` / `ledger_drain_recheck` persist verdicts for the newly local-class steps without a channel call, and keep writing `unknown` (not `blocked`) when a channel read is throttled or skipped.
- No schema change required; a backfill call to the drain action covers existing rows.

## Verification

- Open Fonteinhutte's go-live page repeatedly (cold and warm cache) and confirm the header stays at its real count and never paints 0/14.
- Confirm the ledger rows for Fonteinhutte hold verdicts for all locally decidable steps after the backfill.
- Confirm the Onboarding list percentage and the property header agree.
