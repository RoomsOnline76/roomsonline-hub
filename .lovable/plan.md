# Nightly channel reconciliation with disparity alerts

Today "Reconcile with Channel" only runs when an admin clicks it. This adds an automatic nightly run that emails dev / fearless leader when the channel manager and ROL'OS disagree.

## What gets built

**1. Nightly reconcile job**
- New scheduled function runs every 24 hours (03:10 UTC, clear of the existing ARI/discount/prune cadences).
- It performs the exact same reconciliation the button performs (same backend scope, all accounts), so results always match what the page shows.
- Every run is recorded (timestamp, counts, findings snapshot, whether an alert was sent) so history is visible and repeat noise can be judged.

**2. Disparity detection**
A run is a disparity when any of these are non-zero, ignoring accounts that errored:
- Live listings on the channel with no local match (orphans — these still bill).
- Surplus same-name duplicate listings.
- Local listing ids the channel no longer knows (stale ids).
- Accounts that returned an error (reported as "could not verify", separate from a true mismatch).

Clean runs send no email — they are only recorded.

**3. Warning email (dev / fearless leader)**
- Recipients: profiles holding `dev`, `admin` or `fearless_leader`, with an env override list; falls back to dev@roomsonline.co.za if none resolve.
- Subject states the scale, e.g. "Channel manager disparity — 3 orphan listings, 1 stale id".
- Body, in Ivory-and-Charcoal branding consistent with other internal emails:
  - Summary line: local billable listings vs listings the channel actually holds.
  - A findings table per category (listing id, name, channel account/owner, portfolio and property where known).
  - "What to do" block with the concrete action per category: remove orphan/duplicate listings at the channel (they bill), clear stale local ids, re-check credentials for accounts that errored.
  - A prominent embedded button/link straight to `https://sleepinafrica.roomsonline.co.za/admin/channel-monitor` (production domain, per project policy), plus the same URL as plain text.
- Send is logged so delivery can be verified in the email log.

**4. Page surface**
- The reconciliation panel gains a small line under the button: last automatic run time, its outcome (clean / N findings), and whether an alert was emailed.

## Technical notes

- New edge function `cron-channel-reconcile`, `verify_jwt = false`, `schedule = "10 3 * * *"` in `supabase/config.toml`; it calls `channel-manager-entitlement` with `{ scope: "reconcile", entity_id: "all" }` using the service role so no user session is needed.
- New table `channel_reconciliation_runs` (ran_at, channel_listing_count, orphan_count, duplicate_count, stale_count, error_account_count, findings jsonb, alert_sent, alert_recipients, alert_error) with grants and RLS restricted to admin/dev/fearless_leader reads plus full service_role access; the function writes with the service role.
- Recipient resolution follows the existing `_shared/billingAdminRecipients.ts` pattern in a new `_shared/opsAlertRecipients.ts` (roles dev/admin/fearless_leader, `OPS_ALERT_EMAILS` override, cached per instance).
- Email sends via Resend with the `RESEND_FROM_EMAIL` key pattern already used by `daily-health-report`, and is written to `email_send_log` with a stable `message_id` (`channel-recon-<run date>`) so a retry does not double-count.
- Frontend change limited to `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx` plus a small hook read of the latest run row. No change to the existing manual reconcile/cleanup paths.
