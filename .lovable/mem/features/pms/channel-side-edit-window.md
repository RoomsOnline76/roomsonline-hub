---
name: Channel-side Stay Edit Window
description: A stay-less channel reservation reopens the matching live booking's own nights for 15 minutes so a portal-side stay change can succeed
type: feature
---

A stay change made in the Channel Manager portal re-checks OUR pushed calendar. The nights it needs
are the very nights ROL'OS stamps shut for the booking being edited, so the portal saves a
reservation with an empty `<StayInfos />` ("dates not available") and nothing reaches ROL'OS.

Policy (chosen by the user over "changes belong in ROL'OS only"):
- `supabase/functions/_shared/ruChannelEditWindow.ts` — `openRuChannelEditWindow()` matches a
  stay-less notification to a live `rentals_united` booking by guest email, then name (never the
  same reservation id), captures its stamped nights, releases them and pushes an ARI delta.
- `CHANNEL_EDIT_WINDOW_MINUTES = 15`; a `channel_edit_window_close` background job re-stamps exactly
  those nights unless the booking was cancelled or the modification already landed (nights
  re-stamped by the ingest).
- Trigger lives in `ru-reservation-handler` background path, only when the detail pull was not rate
  deferred; the outcome is logged as a `channel_edit_window` trail event.
- Accepted trade-off: a short window in which another channel could take a night.
