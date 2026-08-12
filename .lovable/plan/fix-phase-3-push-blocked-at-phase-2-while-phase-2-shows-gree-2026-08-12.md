# Fix: Phase 3 push blocked at Phase 2 while Phase 2 shows green

## What is happening

Seesig Self Catering Chalets (9 units, ROL'OS as PMS, not yet published to the channel) shows Phase 2 "Property preparation in ROLOS" as passed with no blockers, but the Phase 3 push is refused with `PHASE_BLOCKED` naming phase 2.

Confirmed cause: the onboarding pipeline card and the live push score Phase 2 from **different check sets**.

- The pipeline card asks the readiness scorer with channel probing switched off (the property has no channel listing yet, so there is nothing to read back). In that mode the scorer skips the whole Availability/Pricing group — including the two mandatory local rules.
- The live push always adds those two mandatory rules, scored on the ROL'OS calendar: at least 3 consecutive open days carrying a price, and a minimum stay authored.

So when the only outstanding items are local calendar/rate/MinStay gaps, the card is green and the push is blocked — with no visible reason on the card.

## Fix

1. **One definition of Phase 2.** When channel probing is off (pre-publish), still score the local bookable window, MinStay and local rate coverage instead of dropping the Availability/Pricing checks. The card then reports exactly what the push gate enforces, labelled as measured on the ROL'OS calendar.
2. **Never hide blockers.** When a push is refused, persist the blocker list as evidence and surface it in the Phase 2 card (not just a toast), with the existing fix hints pointing at Rate Manager → Calendar / Rates / Stay restrictions.
3. **Re-check after the fix.** Re-read Phase 2 for Seesig and confirm the card now lists the same items the push enforces, so the owner can clear them and complete Phase 3.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`: in `scoreProperty`, the `opts.probe_ari === false` branch currently emits no checks. Change it to run the same local scoring used in the pre-publish branch (`computeLocalBookableWindow` + `localBookableWindowChecks` + local rate-coverage check) and only skip the live RU read-back. `phase_status` keeps deciding whether the channel is probed.
- `supabase/functions/push-property-to-ru/index.ts`: on the `PHASE_BLOCKED` return, log the blockers and insert a `ru_sync_runs` row (`action: 'phase_blocked'`, `details: { phase, blockers }`) so the reason is auditable; today nothing is recorded.
- `src/components/integrations/RuOnboardingPipeline.tsx`: keep the last blocked-push reasons in state and render them inside the Phase 2 card alongside `phase.blockers`.
- No schema change, no change to RU adapter payload building or the gate's rules themselves — only where the checks are computed and how they are reported.
