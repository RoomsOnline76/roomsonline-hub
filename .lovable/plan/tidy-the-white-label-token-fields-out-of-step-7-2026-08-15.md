# Tidy the White Label token fields out of Step 7

## Short answer

No — that panel is not required for this step. Nothing in the onboarding gates, wizard macros, or the readiness checks references the White Label token pair. It is an optional admin escape hatch: the backend normally mints the embedded Channel Manager session from the stored portal login, and the paste fields only exist for the rare case where the Channel Manager refuses to mint tokens.

Because it sits directly under "Sub-account API keys", it reads as a second mandatory credential step and invites people to hunt for tokens they don't have.

## Proposed change

- Keep the capability, remove the noise: collapse the White Label token fields into an "Advanced" disclosure inside the distribution account panel, closed by default.
- Show the disclosure only when the embedded Channel Manager session actually fails to mint (or when the viewer is admin/dev/fearless leader), so owners in the wizard never see it.
- Add one line of copy inside the disclosure making it explicit that tokens are optional and only needed if the embedded Channel Manager will not load.
- No change to gates, no change to the token backend, no data migration.

## Technical notes

- `src/components/property/PropertyRuOwnerPanel.tsx` — wrap `<RuWhiteLabelTokenFields />` in a collapsible, gated on role and/or a failed mint signal.
- `src/components/property/RuWhiteLabelTokenFields.tsx` — copy tweak only; `ru-whitelabel-token` function untouched.
- Verified: no references to WL tokens in `ruPhaseGate.ts`, `rolosOnboardingMacros.ts`, `channelOnboardingStages.ts`, or `useRolosOnboardingProgress.ts`.
