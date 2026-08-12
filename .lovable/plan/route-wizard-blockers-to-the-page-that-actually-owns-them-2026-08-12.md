# Route wizard blockers to the page that actually owns them

## The problem

Step 1 (Property identity & company profile) reports "Description & content depth" failures that are unit-level: `SEESTER: Name rejected …`, `SEESTER: Description is 444 characters`, `SEESTER: Arrival instructions are 0 characters`. Those are edited on the **Rooms** page, but "Open step" always opens the macro's own section (Identity & Location), because the button falls back to `macro.section` whenever the step has no outstanding *field* items. The failing content checks are only rendered as a joined text line, so nothing in them is navigable either.

## What changes

1. **Keep each failure separate instead of one joined string.**
   The wizard progress hook already receives every failure (`label`, `detail`, `unit`, `mandatory`) from the readiness groups but flattens them into `detail`. It will also carry them through as a `failures[]` array on each state check.

2. **Every failure becomes its own clickable line.**
   Each blocker renders as a "fix it" row resolved through the existing content-requirement catalogue (name → name field, description → description, arrival instructions → arrival policy, beds → rooms, photos → images, and so on). When the failure names a unit (e.g. `SEESTER`), the destination is forced to the **Rooms** section and the unit's card, regardless of the property-level default the catalogue would return — that is the fix for the reported behaviour.

3. **"Open step" follows the first real blocker.**
   Priority order: first blocking state-check failure's resolved section → first outstanding mandatory field's section → the macro's own section. So a step whose only blockers live on Rooms opens Rooms.

4. **Unit-scoped focus.**
   Where a unit name is present, after navigating to Rooms the target unit card is scrolled to and pulsed (matching the existing requirement-pulse treatment) so the owner lands on the exact chalet type, not the top of the page.

## Technical notes

- `src/hooks/useRolosOnboardingProgress.ts`: add `failures?: { label; detail?; unit?; mandatory }[]` to `DistributionCheck`; populate it in `groupCheck` (keep `detail` for the summary line).
- `src/components/onboarding/rolos/RolosOnboardingWizard.tsx`: replace the plain `detail` line with a list of resolved blocker buttons; extend the existing `resolveCheckTarget` helper to first try `resolveMcqRequirement(failure.detail ?? failure.label)` and to override `section` to `rooms` when `failure.unit` is set; compute `Open step`'s destination from that same resolution.
- `src/lib/requirementFocus.ts`: add a unit-aware focus helper that finds the room card by `data-room-name` / heading text and pulses it; `RoomManagerTab` gets the matching `data-room-name` hook if it is not already present.
- No backend or readiness-rule changes — the checks themselves are correct, only their routing is wrong.
