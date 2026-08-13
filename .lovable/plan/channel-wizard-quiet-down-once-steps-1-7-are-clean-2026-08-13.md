# Channel wizard: quiet down once steps 1–7 are clean

## What changes

The onboarding wizard currently only goes quiet once the property is **published** (step 8 listing IDs stored) and steps 1–8 are clean. That means a property whose preparation work (steps 1–7) is finished still gets the full nagging wizard until the push is confirmed.

New behaviour:

- When steps 1–7 have no outstanding mandatory work, the floating wizard collapses to a single **Connect Channel** button — no step counter, no expanded checklist. Only if already been pushed and are actively push/pull and syncing.
- The button routes to the channels page as it does today, and a small hide (X) control remains.
- The full wizard re-opens by itself only when a mandatory item in steps 1–7 regresses (existing gate-signature mechanism, re-scoped to 1–7).
- Steps 8–10 (push, currency verification, sign-off) stay reachable by clicking the pill to expand, but never force themselves open.
- When a channel is already connected and everything is green, the wizard still retires completely (unchanged).

## Technical notes

- `src/hooks/useRolosOnboardingProgress.ts`: change `blockingMacros` from `order <= 8` to `order <= 7`, and drop `publishedOk` from `gateSignature` so a not-yet-pushed property with clean prep keeps a stable signature.
- `src/components/onboarding/rolos/RolosOnboardingWizard.tsx`: the quiet branch condition becomes `blockingMacros.length === 0 && !pillOpened` (no `publishedOk` requirement), and its render collapses to just the `Connect Channel` CTA plus hide; keep an unobtrusive way to expand the wizard (click the CTA's sibling chevron / label) for steps 8–10.
- No backend, readiness-scoring, or auto-push changes — delta pushes on save stay as they are.