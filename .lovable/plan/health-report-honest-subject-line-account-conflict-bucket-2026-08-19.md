# Health report: honest subject line + account-conflict bucket

Two low-risk changes to the daily health report so the email subject matches the body, and so registration/ownership conflicts stop being graded as code faults.

## 1. Subject line respects failing pipelines

Today the body computes an `effectiveStatus` (degraded when any channel pipeline is failing), but the subject is computed separately from `criticalIssues` / `failedCount` only. That is why the subject can read "All Systems Operational" while the body strip reads "Failing".

Change: compute the effective status once, before the email is built, and derive both the body header and the subject from that single value.

- Extract the current effective-status logic (failing pipelines + overall status) into a small shared helper returning `{ status, label, emoji, failingActions }`.
- The body header uses it exactly as it does now (no visual change when nothing is failing).
- The subject becomes, for example:
  `⚠️ ROL System Health Report - Degraded — ensure_company_details failing - 19 Aug 2026`
- Critical stays `🚨 … CRITICAL ISSUES`, fully healthy stays `✅ … All Systems Operational`.
- `[Manual]` prefix behaviour unchanged.

## 2. Registration / ownership conflicts count as setup, not faults

`isSetupGap` already routes owner-configuration gaps into the yellow "Waiting on owner setup" box and excludes them from pipeline failures. Account-level conflicts (the `connect@roomsonline.co.za` duplicate-registration case) are the same class of thing: operational, not a code defect.

Change: add a sibling predicate `isAccountConflict` covering messages such as:

- "account registration conflict"
- "already registered"
- "email already in use" / "email in use"
- master-vs-sub / ownership conflict wording
- error code `RU_EMAIL_IN_USE`

These are treated exactly like setup gaps: excluded from `isPipelineFailure`, and surfaced in the existing yellow box (relabelled "Waiting on owner setup / account reconciliation") with the conflict reason shown. Once the account is migrated, the rows stop appearing on their own — no manual clearing.

## 3. Optional polish

Add a short-lived "Recently reconciled" line to the same yellow box: conflicts that appeared in the previous window but not the current one are listed as cleared for a day or two, so the AI opportunity line can note the successful reconciliation.

## Out of scope

The 24 h window and recovery logic stay exactly as they are — they already handled the three transient pipelines correctly.

## Technical notes

- Single file: `supabase/functions/daily-health-report/index.ts`.
- Helper added next to `isSetupGap` / `isPipelineFailure`; effective-status helper hoisted out of `generateEmailHtml` so the send path can call it too.
- No schema changes, no new RU calls, no cron changes. Function redeployed after the edit.
