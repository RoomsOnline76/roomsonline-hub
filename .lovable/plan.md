# Hide expired seasons from Calendar and Rate Plans

Seasons whose date windows are all in the past still clutter the Calendar / Seasons view and add dead columns to Rate Plans → Pricing by season. They stay in the data (rates already booked against them are untouched) but they get hidden from both surfaces.

## Rule

A season is **expired** when every one of its periods ends before today. A season with at least one period ending today or later stays visible, even if it also has old windows.

## Calendar / Seasons

- The season legend chips, the season detail card, and the "Room Rates by Season" table only list live seasons.
- The year-grid painting is unchanged for the year being viewed — colours still show for whatever year you page to, so scrolling back to 2025 still reads correctly.
- A small "Show past seasons (N)" toggle above the legend reveals the hidden ones when the owner needs to edit or delete an old season. Off by default.

## Rate Plans

- `Pricing by season` drops expired season columns, so the matrix only shows seasons that can still be sold.
- The rate plan card's season rate chips and the 7-night preview strip are unaffected in behaviour (they are already date-driven) but will no longer surface names of dead seasons.
- Saving a plan does not delete rates previously authored against expired seasons — those rows are left in place and simply not editable in the UI.

## Technical notes

- Add a shared helper (`isSeasonExpired` / `filterLiveSeasons`) next to the existing season utilities so the Calendar and Rate Plans use one definition.
- `readCalendarSeasons` in `src/components/pms/rateplans/ratePlanDraft.ts` gains an option to drop expired seasons; `RatePlanEditor` passes it on.
- `src/components/property/SeasonsCalendar.tsx` derives a `visibleSeasons` memo used by the legend, detail card and rates table; colour indexing keeps using the full list so existing season colours do not shift.
- Unit tests cover: all-past season hidden, mixed-window season kept, season ending today kept, and expired columns absent from the rate plan season list.
