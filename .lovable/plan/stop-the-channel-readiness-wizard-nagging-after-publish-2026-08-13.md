# Stop the channel readiness wizard nagging after publish

The wizard currently re-opens, expanded, on every visit to the property editor and every ROL'OS page for any property on ROL'OS that is not 100% across all eleven steps. Because steps 9–11 (currency verification, manual sign-off, channel connection) are administrative and often stay open long after the property is published, a property with steps 1–8 done keeps getting the full floating panel. "Hide" and "collapse" are both deliberately reset on every mount, so it always comes back.

## What changes

1. **Publish is the retirement point.** Once the property is published (listing IDs stored for every active unit) and no mandatory step 1–8 is violated, the floating wizard no longer opens by itself. It reduces to a small, quiet pill in the corner ("Channel readiness · 8/11") that expands on click, showing the remaining administrative steps.

2. **It comes back only on a real regression.** If any mandatory item in steps 1–8 fails again (a description shortened, a photo removed, keys unverified, a unit unpublished), the wizard auto-expands with the regression named — that is the only automatic re-open.

3. **Hide sticks.** Hiding is remembered per property, together with a signature of the current mandatory state. Reloading the editor does not bring it back; a change in that signature (i.e. a new blocker) does. Collapse state is remembered the same way.

4. **Saves stay silent.** Ordinary edits on a published property continue to auto-push through the existing delta pipeline with no wizard involvement — no re-open, no toast chain from the wizard. Only a save that introduces a mandatory blocker (which parks the push) surfaces the wizard again.

5. **Channels step no longer required to silence it.** Reaching "published + no blockers" is enough for the quiet state; connecting channels remains a step in the panel and the "Connect Channels" action stays available from the pill.

## Technical notes

- `src/hooks/useRolosOnboardingProgress.ts`: expose `publishedOk` (the `listing_ids` state check) and `blockingMacros` — mandatory-outstanding macros with order ≤ 8 — plus a stable `gateSignature` string built from the outstanding mandatory keys of steps 1–8.
- `src/components/onboarding/rolos/RolosOnboardingWizard.tsx`:
  - Replace the current `dismissed`/`collapsed` reset effects with `localStorage` persistence keyed `rolos-wizard:<propertyId>` storing `{ hidden, collapsed, signature }`; ignore the stored value when the live `gateSignature` differs from the stored one.
  - New render mode: when `publishedOk && blockingMacros.length === 0` and not all steps complete, render the compact pill instead of the full panel; clicking it opens the panel for that session.
  - Keep the existing all-complete and channels-connected early returns as they are.
- No schema change, no edge function change; the auto-push pipeline (`ru-static-delta` / `ru-ari-delta`) is untouched.
