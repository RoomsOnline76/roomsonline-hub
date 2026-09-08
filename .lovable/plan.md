# Sealion "Channel reads the stay's nights as closed" — resolved, but the board can't say so

## Answer

Yes, it cleared itself. Timeline for Sealion this morning (all times Johannesburg):

- 09:28:13 and 09:33:32 — the channel refused the acceptance: "Property is not available for a given dates".
- 09:33:34 — ROLOS reopened the request's own nights (recorded as a successful availability push).
- 09:35:05 — the acceptance was sent again and the channel answered with its success code.
- 09:35:17, 09:36:20 and 10:05:38 — three stay changes for the same booking went through cleanly.
- Nothing has failed on Sealion since 09:33; every call after that is a success.

So the entry you are looking at is the record of the refusal at 09:33:32, not a live problem.

## Why it still says "Blocker · Active"

That board groups the last seven days of failures by pattern and stamps "Active" purely because the newest example is under six hours old. It never looks at what happened next, so a pattern that fixed itself keeps its red badge until six hours have passed. That is the real defect here, not the channel.

## What to change

1. Outcome-aware status. For each grouped pattern, look for a later success of the same action on the same property. If one exists after the last failure, badge the group **Resolved** (green) with "last failed 09:33, succeeded 09:35" instead of "Active".
2. Keep "Active" only when the newest event for that action and property is still a failure.
3. Show the recovery step. Where a self-heal ran (reopen, requeue, retry), name it on the group so it reads as a handled incident rather than an open one.
4. Same treatment on the counters at the top: "Need manual fix" should count only patterns with no later success, so the number reflects work actually waiting on a person.
5. Leave rate-limit deferrals out of the fault count — they are already logged as queued successes.

## Technical notes

- Data is already available: `ChannelSyncObservabilityPanel` loads all `ru_sync_runs` rows for seven days (successes included), so the outcome check is a client-side pass in `RuErrorHandlingTab` with no new query.
- Group key stays `classifyRuError(...).key`; resolution is computed per `(action, property_id)` by comparing the group's newest failure timestamp against the newest successful run for that pair.
- `activityChip()` becomes outcome-aware rather than purely time-based.
- `ru_open_actions` currently holds no rows, so nothing on this board is driven by it; no backend change is needed for this fix.
