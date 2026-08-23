---
name: Confirm Request & Terminal Stays
description: Channel acceptance is never retried for closed/in-house stays; ARI delta waits on a pending acceptance; health report grades only connected accounts
type: feature
---
**Acceptance attempts**
- A held channel request is never re-sent when the local stay is closed (`checked_out`, `departed`, `completed`, `cancelled`, `no_show`, `rejected`, `declined`) — result is `skipped` with reason `stay_already_<status>`.
- An in-house stay (`checked_in`, `in_house`) gets exactly ONE acceptance attempt; if `ru_sync_runs` already shows a `ruBookingSync:confirm` attempt, it is skipped.
- "Property is not available for a given dates" on such a stay is the stay's own nights being held locally — a false positive, never a pipeline fault.

**ARI delta race**
- While a `confirm_request` is `pending` in `ru_call_queue` for a property, `queueRuAriDelta` returns `confirm_pending` and does NOT push — otherwise the delta re-closes the nights the acceptance just reopened.

**Echo loop**
- `enqueue_channel_booking_sync()` skips enqueuing for ANY change kind (including `confirmed`) within 90 s of a `synced` `booking_sync_status` write, so the 30-minute reservations poll's rewrites of rooms/notes never bounce back out as an outbound push.

**Health report**
- Grades only connected accounts: a property with any non-passed `property_channel_step_status` step other than `connect`, or any `WIZARD_SYNC_NOT_READY` row, is excluded from every number.
- Retired and in-progress exclusions are deliberate and are NEVER printed in the email (the AI digest still receives the retired list as context).
