# Channel Monitor cleanup + RU health moves

Strip the engineering surface back to what is actually used, delete the operator certification rail, and move endpoint/cron tracking to System Health where it belongs.

## 1. Channel Monitor rail

New rail (three items):

```text
Onboard Property   |   Cost Monitor   |   Advanced
```

- "Cert Status & Logs" tab deleted in total, including the Channel step ledger section it carried. Old `?tab=cert` and `?tab=mapping` deep links redirect to Advanced so no bookmark 404s.
- "Advanced (Dev only)" renamed to **Advanced** (still dev/fearless-leader gated).

## 2. Advanced tab layout

Top to bottom, each its own collapsed-by-default frame:

1. **Exchange log (sync & errors)** — stays first, collapsed. Keeps the "inspect this exchange" deep link from the trail below.
2. **Booking Sync Trail** — collapsed.
3. **Refresh compliance** — its own frame, collapsed (lifted out of the certification console's tab strip).
4. **Background call queue** — remains as-is at the bottom.

Removed from Advanced:
- Certification runner card
- "Runs" sub-tab and Recent certification runs
- Manual runs
- Auto-managed properties
- Sync runs (last 7 days)

The sync observability panel keeps only the pieces not listed above (its counters/error handling); if a removal leaves it empty, the panel itself goes.

## 3. Endpoint progress tracker → System Health

- The RU endpoint progress tracker leaves the Channel Monitor entirely.
- On System Health, the **Rentals United** entry in the PMS adapters card becomes clickable and opens a new standalone page: RU endpoint coverage / progress tracker, with a back link to System Health.

## 4. System Health → Sync Pipelines: RU crons

The Sync Pipelines card gains a **Rentals United scheduled jobs** section listing every RU cron with:

- job name and the endpoint/function it drives
- expected cadence (e.g. reservations every 30 min, ARI refresh daily 02:20, discounts daily 04:00, RLNM refresh daily 04:00, full push weekly Mon 01:10, log prune daily 03:30, reconcile daily 03:10, ledger drain every 5 min)
- last run, runs/failures over 7 days, last error
- health grade: green when the last run is inside its cadence window, amber when overdue, red when the last run failed

Grading compares the declared cadence against real run records, so a cron that silently stops shows red instead of just going quiet.

## Technical notes

- `src/pages/AdminChannelMonitor.tsx`: rail reduced to `onboard | cost | advanced`; `cert`/`mapping` added to `LEGACY_TAB_MAP` → `advanced`; Advanced body reordered into `Collapsible` frames; `ChannelCertificationTab` mount removed from the cert branch and the advanced branch replaced by a compliance-only mount.
- `src/components/integrations/RuCertificationConsole.tsx`: `variant="advanced"` drops the runner card and the `runs` tab, leaving `cadence` only, rendered without a tab strip.
- `src/components/admin/channel-monitor/ChannelSyncObservabilityPanel.tsx`: delete the Manual runs, Auto-managed properties, Runs (7d) and Sync runs (last 7 days) blocks.
- New page `src/pages/DevRuEndpointProgress.tsx` mounting `RuSyncProgressTracker`, routed under the dev/system area and linked from the RU row in `SystemOverviewTab.tsx`.
- `SystemOverviewTab.tsx`: add an RU cron registry (function name + cron expression mirrored from the deployed schedules) and grade each against existing sync/cron run records inside the Sync Pipelines card.
- `ChannelCertificationTab.tsx` keeps existing exports; only its cert-variant usage in the monitor is removed.
