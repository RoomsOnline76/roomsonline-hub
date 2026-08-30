---
name: Season Change Delta Push
description: Calendar season edits are a rates change — mirror rolos_shared_seasons on save before the channel delta, and push siblings that inherited the dates
type: feature
---

Yes, season changes must fire a delta push. A season is a date window and every published nightly
price resolves through it, so moving/adding/renaming/removing one re-prices real nights.

Rules:
- `amenities.seasons` is a tracked channel field (rates section) — the property's own delta fires from
  the normal changed-field save flow.
- The `rolos_shared_seasons` mirror (`rolos-rate-plans` action `sync_seasons`) MUST be refreshed on
  property save whenever seasons changed, **before** the channel push. It used to run only when the
  Rate Plan editor was opened, so saves pushed the old windows or resolved nothing new and reported
  "nothing owed" — season edits appeared never to leave ROL'OS.
- `syncPortfolioSeasonDates()` returns the sibling ids it rewrote; each sibling gets its own mirror
  refresh plus a `pushRatePlanRates(..., "rate_plan_update", { label: "Season dates" })` delta.
  A sibling that inherited new dates is just as mispriced at the channel.
- Helper: `src/lib/seasonChangePush.ts` (`mirrorCalendarSeasons`, `propagateSeasonChange`).
