# ROL'OS Rooms & Dashboard: one compact multi-calendar

Both screens keep exactly the information they show today. What changes is the shape: instead of each property becoming its own boxed calendar (and, in the month view, each week becoming another stacked block), everything sits in a single continuous grid — properties listed tightly one under the other, days running to the right, and you move through time by scrolling sideways.

## The target layout (as in the reference)

```text
┌──────────────────────────┬──────────────────────────────────────────►
│  [All properties  ▾] ‹ Today ›            legend · filters           │
├──────────────────────────┼──────┬──────┬──────┬──────┬──────┬───────►
│ Room type          Units │ Thu  │ Fri  │ Sat  │ Sun  │ Mon  │  ...
├──────────────────────────┼──────┴──────┴──────┴──────┴──────┴───────►
│ ▸ Seesig Self Catering Chalets · 9 rooms          (thin property band)
│   Albatros              1 │  1      1      1      1      1     ...
│   Anemoon               1 │  1      1      1      0      0     ...
│ ▸ Tidal Pools Self Catering Apartments · 4 rooms
│   Elf                   1 │  1      1      1      1      1     ...
└──────────────────────────┴──────────────────────────────────────────►
        sticky column                one shared horizontal scroller
```

- One sticky day/week header for the whole surface, not one per property.
- One horizontal scrollbar for the whole surface; every property row scrolls in lockstep, so no per-property scrollbars and no re-finding your place after each block.
- Property bands are thin single-line separators (name + room count + "Manage →"), collapsible, not cards with their own toolbars, legends or nav buttons.
- Denser rows and narrower day columns so more nights fit on screen; day columns keep the tabular numbers, heat colouring, weekend and public-holiday shading, and today marker they have now.

## Property filter

The Portfolio/Single button pair is replaced by one dropdown:

- **All properties (N)** — the stacked multi-calendar above (default when the account has more than one property).
- Any single property — the same grid filtered to just that one; everything else on the page (Add Room, room cards, edit dialogs) keeps working exactly as it does when a single property is selected today.

The keyboard-friendly prev/next property arrows stay for single-property mode.

## Moving along the calendar

- Sideways is the primary movement: drag-to-pan, trackpad/shift-wheel horizontal scroll, and the ‹ Today › › controls in the single top toolbar.
- The loaded window widens so there is real distance to travel to the right, and reaching the right edge extends it further instead of forcing a click.
- Rooms page: expanding a room type still opens its physical room lines inline underneath (status control, occupancy, edit) — that stays vertical, since it is detail, not time.
- Dashboard month view in "all properties" mode stops splitting into Week 1 / Week 2 / Week 3 blocks; the month becomes one continuous horizontal axis with a week band across the top. Week collapse disappears with it, replaced by the property band collapse.

## What is not changing

Room-type availability counts, rates, restriction markers, hover cards, booking sheets, drag-to-create/move on the dashboard room plan, filters, legends, and every data query stay as they are. This is layout and navigation only.

## Technical notes

- New shared surface `src/components/pms/calendar/MultiCalendarSurface.tsx`: owns the single scroll container, sticky label column, week + day header bands, pan/wheel handling and scroll-sync, and renders caller-supplied groups (property band + rows). Density constants (`COL_W`, `LABEL_W`, row height) live beside it and shrink under `.rolos-mobile` per the existing mobile-density rules.
- `src/components/pms/rooms/RoomTypePlanGrid.tsx` is refactored to render *rows only* into that surface — its own header/nav/scroll wrapper moves out. Row/label widths drop (LABEL_W 240 → ~200, COL_W 62 → ~46) and vertical padding tightens.
- `src/pages/pms/PMSRooms.tsx`: replace the `viewMode` toggle with a single `propertyScope` dropdown (`"all"` | property id) driving `activePropertyIds`; render one `MultiCalendarSurface` fed by `propertySections` instead of a `<section>` per property; hoist the plan toolbar and legend above it; widen `PLAN_NIGHTS` and add right-edge extension via the existing `shiftWindow`/`anchorDate`.
- `src/pages/pms/PMSDashboard.tsx`: portfolio branches for `roomplan`, `week` and `month` render into one `MultiCalendarSurface`; remove the per-week chunking loop and `collapsedWeeks` from the portfolio month path (single-property month view keeps `MonthCalendarGrid` unchanged); the portfolio/single switch reuses the same dropdown component.
- `RoomPlanGrid` / `WeekCalendarGrid` keep their internal cell rendering; only their outer scroll/header chrome is bypassed when hosted in the shared surface.
