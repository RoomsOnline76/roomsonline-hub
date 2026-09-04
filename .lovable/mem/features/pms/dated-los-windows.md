---
name: Dated LOS / Full Stay Windows
description: LOS rungs and Full Stay cells can target explicit dates (event weekends) per unit, with an advisory min stay mirrored into rolos_stay_restrictions
type: feature
---

Stay-shape rows carry a scope: `season` (a Calendar-painted season) or `dates` (explicit
From/To — event weekends, long weekends, festivals). Both LOS rungs and Full Stay cells
support it, and either can optionally target a single unit (`room_type_id`); blank = all
units on the plan.

- A dated row may carry `min_stay_nights`. It is **advisory pricing metadata**: the save
  path mirrors it into `rolos_stay_restrictions` with `source = 'rate_plan_window'`
  (`source_ref` = plan id) so the calendar and the channel enforce the minimum. It never
  blocks direct ROL'OS checkout, and it must never clobber the plan-level
  `source = 'rate_plan'` row.
- A dated row with a minimum stay and no offset is valid — the offset defaults to 0, so the
  window enforces the minimum while riding the parent nightly.
- Two dated rows with the same nights threshold (and guests, for FSP) and the same unit may
  not overlap; the error names the dates.
- Editor preview derives a dated row from the season covering its first night; when no
  season covers it the row reads "unpriced".
