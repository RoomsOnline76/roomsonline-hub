# Channel Manager — sync readiness: collapse & filter to outstanding

## Goal
In the Channel Manager sync readiness card (`RuReadinessScorecard.tsx`), the expanded checklist currently lists every group and every check — passed and failed alike. Make it show **only the remaining outstanding items** by default, with a separate "Show all" toggle for the full list. This mirrors the pattern already shipped in `RuOnboardingPipeline.tsx` (`showAll` / `visiblePhases` / `hiddenPhases`).

## Current state (verified)
- File: `src/components/pms/channels/RuReadinessScorecard.tsx`
- `detailsOpen` auto-opens when score < 100 or blocked; auto-closes at 100%.
- When open, `report.groups` is rendered in a 2-col grid, and within each group **all** checks (passed + failed) are listed.
- There is no concept of "outstanding only" vs "show everything".

## Changes

### 1. Add `showAll` state
```ts
const [showAll, setShowAll] = useState(false);
```
Reset to `false` whenever the report reloads (so a fresh check starts filtered).

### 2. Derive filtered groups
Only render groups that have failing checks unless `showAll` is on:
```ts
const visibleGroups = (report?.groups ?? []).filter(
  (g) => showAll || g.passed < g.total,
);
const hiddenGroups = (report?.groups ?? []).filter((g) => g.passed === g.total);
```
When not `showAll`, also filter the per-group check list to **failed only**, so the expanded card shows just what still needs work.

### 3. Compact "complete" strip (when not showAll)
When `hiddenGroups.length > 0` and not `showAll`, render a small green strip mirroring the onboarding pipeline's `hiddenPhases` strip:
```
✓ N/M requirements met — K groups complete [Show all]
```
Clicking `Show all` sets `showAll = true` and reveals the full grid with passed groups/checks.

### 4. Toggle button
- Keep the existing `Show checklist / Hide checklist` button for collapse/expand.
- Add a secondary `Show all` / `Show outstanding only` toggle inside the checklist header row (only visible when the checklist is open and there are any passed items to hide).

### 5. Preserve existing behaviour
- 100% ready → card stays collapsed with the "All N requirements met" line (unchanged).
- Blocked / <100% → checklist opens automatically (unchanged), but now defaults to outstanding-only.
- `onReport` callback, Re-check button, standalone vs embedded rendering — unchanged.

## Non-goals
- No backend / edge-function changes — readiness payload already carries per-group `passed`/`total` and per-check `passed`.
- No changes to `RuOnboardingPipeline.tsx` or other readiness consumers.

## Technical notes
- Single file edit: `src/components/pms/channels/RuReadinessScorecard.tsx`.
- Follows React 2026 standards: `useMemo` for derived `visibleGroups`/`hiddenGroups`, `useCallback`-free toggle is fine (simple setter).
- No `any`; reuse existing `RuReadinessReport` / `RuReadinessCheck` types.
