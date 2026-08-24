# Onboarding queue and channel wizard clean-up

Four changes: column relevance follows the "Channel properties only" toggle, the queue stops re-testing channel readiness on every visit, the website controls leave the channel wizard, and a fully green wizard collapses its step detail.

## 1. Columns follow the toggle (/admin/onboarding)

Default state (Channel properties only = on, RU-enabled properties shown):
- Hide the **Website listing** column.
- Hide the **Website wizard** button in the row actions (the dropdown item stays, so the wizard is still reachable).

Toggle off (all properties shown):
- Show **Website listing** again.
- Hide the **RU channels** column — that column is only meaningful for channel properties.

The table header, body cells and the empty-state `colSpan` all react to the same flag so the grid never drifts out of alignment.

## 2. Stop re-testing readiness on every page load

Today the queue paints from local data and then fires a live `phase_status` probe for every ROL'OS property whose ledger is not fully `passed`. Confirmed from the database: the ledger flag is on and rows exist for 11 properties, but none has every step `passed` — most channel-class steps sit at `pending`/`blocked`/`stale`. Because a probe is queued for any channel-class step that is not `passed`, effectively every property is probed on every visit, which is the slowness being reported.

New behaviour:
- Page load reads `property_channel_step_status` only (one batched read, no channel calls) and renders each property's recorded percent and verdict — including partly-graded properties, which now show their recorded progress instead of being re-probed.
- Properties with no ledger rows at all are still seeded (cheap insert of `pending` rows, no channel call) so the next visit has bookkeeping to read.
- Live re-testing becomes explicit: a **Re-check readiness** action per row (in the row menu) and a header action that re-checks the currently filtered rows. Only these paths call the channel.
- A small "as of" hint on the channel bar tooltip shows when the recorded verdict was last checked, so an operator can tell a stale verdict from a fresh one.

## 3. Channel wizard: drop the website controls

In the channel onboarding workspace (Connect a channel / `/admin/onboarding/:id`), remove the top-left **Website** score chip and the **Show on website / Hide from site** button. Both belong to the website listing wizard, which keeps them. The "Ready to sell" chip and progress bar stay.

## 4. Collapse step detail when all five steps are green

When Ready to sell is complete:
- The stage navigation rail and the active-step panel are hidden by default; the green "Ready to sell" panel and the price coverage panel stay visible.
- That panel gains an **Open steps** button that reveals the rail and step detail (and a matching collapse control once open).
- If readiness later regresses, the detail shows automatically again.

## Technical notes

- `src/pages/AdminOnboarding.tsx`: derive column visibility from the existing `ruOnly` state; replace the load-time probe drain with a ledger-only read plus seeding; add explicit re-check handlers that call the existing `phase_status` probe and patch the affected row(s).
- `src/lib/channelStepLedger.ts`: `fetchChannelLedgerBatch` returns the recorded percent for partly-graded properties and surfaces `lastCheckedAt`; `needsChannelProbe` is no longer used to auto-probe on load.
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx`: remove the website chip/toggle (and the now-unused `toggleWebsite` handler); add a `stepsOpen` state that gates the nav rail and active-step section when `readyOverall.allComplete` is true.
- No database or edge function changes.
