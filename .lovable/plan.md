# RU onboarding condensing + clearer NightsBridge upload feedback

## 1. Rentals United onboarding — hide what's already passed

Today all four phases render as full cards with hints, evidence blocks and action buttons, so passed phases take as much space as failing ones.

Change the pipeline to a condensed view:

- Passed phases collapse into a single compact strip, e.g. `Phases 1-3 complete` with small green ticks and the phase labels only. No hints, no evidence, no action buttons while passed.
- Only phases that are `blocked` or `pending` stay expanded with their blockers, evidence and actions.
- A single "Show all phases" toggle expands everything back to the current full detail (per-phase actions like Restart Phase 1 and re-push stay reachable there).
- If a refused push is attributed to a passed phase, that phase stays expanded regardless — a green strip must never hide an outstanding requirement.
- When all four phases pass, the whole block collapses to one line: `Rentals United onboarding complete — 4/4 phases` plus the summary badges (owner scope, RU OwnerID, last quality check) and the expand toggle.

## 2. NightsBridge import — confirm the file is loaded

Currently selecting a file only swaps the dropzone caption text, which reads as if nothing happened.

- On selection (click or drop), show a distinct "file attached" state: check icon, file name, size in KB/MB, and a Remove/Change action, replacing the dashed prompt styling with a solid confirmed row.
- Toast confirmation on successful selection, and keep the existing rejection toasts for wrong type / oversize.
- Make the next step obvious: highlight `Validate (dry run)` as the primary action once a file is attached, and keep the "Validate first, then import" hint.
- Reset back to the empty dropzone state when the file is removed.

## Technical notes

- `src/components/integrations/RuOnboardingPipeline.tsx` — introduce a `showAll` state; split rendering into a passed-summary strip and expanded phase cards; keep `pushBlock` phase attribution as a force-expand condition.
- `src/components/property/NightsBridgeBookingImport.tsx` — add attached-file UI state around the existing `file` state and `pickFile` callback; no changes to `nb-import-bookings` or parsing logic.
- Presentation-only work; no backend, schema or edge function changes.
