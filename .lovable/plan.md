# Show stop-sell / blocked nights in Dashboard Week and Month views

## What's wrong

The Room Plan view treats a night as blocked when **either** the stop-sell flag is set **or** available units is 0. The Week and Month calendar grids only look at the stop-sell flag, so nights blocked by setting units to 0 render as normal, sellable days.

Confirmed in the data: for dates from 1 Aug 2026 onward there are 80 nights with the stop-sell flag (these do show) and **125 nights blocked only by units = 0** (these show nothing in Week/Month).

Week/Month also give no block attribution — the red line tooltip just says "Stop Sell Active", while the Room Plan and Rooms views now show who blocked it, when, and why.

## What will change

- A night is blocked in Week and Month views under the same rule as the Room Plan: stop-sell flag set **or** available units = 0.
- Blocked cells get the same red hatched shading used in the Room Plan, so they read as blocked at a glance in both single-property and portfolio stacks.
- The red restriction line appears for both kinds of block, and its tooltip carries attribution: "Blocked — 16 Aug 2026 / By Dawie Kotze · 12 Aug 2026 09:14 / Owner stay", falling back to the channel/system label (Channel Manager, NightsBridge) or "Source unknown" for legacy rows.
- Right-clicking a blocked cell in Week/Month opens the restriction editor for that span, matching the Room Plan shortcut.
- No change to availability data, booking logic, or how blocks are created.

## Technical notes

- Add a shared `isBlockedOverride(o)` predicate (stop-sell true OR `available_units === 0`) in `src/pages/pms/PMSDashboard.tsx` and reuse it in `makeIsBlocked`, `RestrictionLines`, and `dateCellBg` so the three surfaces cannot drift again.
- `RestrictionLines` takes the blocked flag from that predicate instead of `restriction.is_stop_sell`, and builds its tooltip with `formatBlockedTooltip` / `systemBlockLabel` from `src/lib/blockAttribution.ts`; line continuity (rounded ends) uses the same predicate on prev/next.
- `dateCellBg` gains the hatched `repeating-linear-gradient` style used by `RoomPlanGrid` for blocked cells; `WeekCalendarGrid` → `RoomTypeSection` and `MonthCalendarGrid` → `MonthRoomTypeRows` pass the predicate result rather than `!!restriction?.is_stop_sell`.
- Both cell renderers get an `onContextMenu` that calls the existing `openBlockEditor(roomTypes, propertyId)` helper, wired the same way as the Room Plan (portfolio stacks pass their own property id and room types).
- Portfolio Week/Month already receive per-property `overrideMap`/`getRestriction`, so the attribution fields (`blocked_by_label`, `blocked_reason`, `blocked_at`, `external_system`) are already fetched — no query changes needed.
