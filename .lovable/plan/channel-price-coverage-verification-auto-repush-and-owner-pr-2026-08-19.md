# Channel price-coverage verification, auto-repush and owner prompts

## What happened with Kaapse Noontjie

The channel portal is asking for "more seasons with defined prices in the upcoming year", yet our own last rate push for that unit recorded a clean result: a 366-day window, 366/366 nights priced, 10 seasons sent, and a read-back that matched 10 of 10 seasons.

So the two sides disagree, and today nothing in ROL'OS can notice that:

- Our read-back only re-reads **the seasons we just sent, inside the window we just sent**. If the channel stores less than that (or stores it against a different listing), the comparison still passes because we never ask "does the channel hold a priced night for every day of the next year?".
- When a read-back cannot be performed at all, the result is recorded as `checked: false` and the push is still reported as a success. A live read for this unit's listing just now came back "Property does not exist" under the credentials the read used — meaning read-backs for this unit may be failing silently and being treated as verified.
- The channel's own listing-quality hints (the "Improve" reasons) are never pulled into ROL'OS, so a channel-side gap is invisible until someone opens the channel portal.

The plan below is written as investigate-then-fix: the exact reason the channel holds less pricing than we sent is not yet confirmed, and step 1 is to establish it.

## 1. Confirm what the channel actually holds (first step, no code changes)

For each affected unit, read the channel's stored prices for the next 365 days using the correct owner-scoped credentials, and compare against what we pushed:

- Does the channel return a priced season for every night, or only a short span?
- Is the listing we push to the same listing the portal row refers to (duplicate/archived listing check)?
- Why did the scoped read return "Property does not exist" — wrong credential scope, or an archived listing id still stored locally?

The answer decides whether the fix is a re-push (channel dropped or partially accepted our seasons), a mapping repair (we push to the wrong listing), or a credential-scope fix for the read-back.

## 2. Make the verification honest

- **Independent coverage audit.** After a rate push, and on a schedule, pull the channel's own prices for the next 365 days and derive from *the channel's answer*: number of priced nights, number of seasons, and any night priced at zero. A push is only "verified" when the channel's own answer covers the whole year.
- **A read that did not happen is not a pass.** An unreadable or rate-limited read-back stops counting as verified: it becomes `unverified` and is re-queued through the existing rate gate instead of closing the push as successful.
- **Record the verdict per unit** so it is queryable and shown in the UI, with the coverage numbers and the first missing date range.

## 3. Auto-correct when our data is complete

When the audit finds the channel short but ROL'OS holds a full priced year for that unit:

- Re-push prices for the affected unit once, through the rate gate (queued rather than failed when rate-limited).
- Re-audit after the push. If the channel still comes back short after one retry cycle, stop retrying and escalate to step 4 rather than looping.
- Toast/notify on completion the same way the existing background channel jobs do ("rates re-sent to the channel" / "queued behind the rate limit").

## 4. Prompt admin/owner when the data is genuinely missing

When the audit is short *because ROL'OS itself has unpriced nights* (no season, no rate-plan rate), no push is attempted — a push would only re-send the same gap. Instead:

- Flag the unit with an actionable gap: what is missing (e.g. "83 nights from 2027-04-12 have no rate") and a deep link to Rate Manager → Calendar/Rates for that unit.
- Show it where the unit is already listed in the onboarding/channel console (the row that currently shows the channel status), and include it in the daily health report as a setup gap, not a code defect.
- Re-run the audit and the re-push automatically once the missing rates are authored, so clearing the gap in Rate Manager is enough — no manual "push" step.

## 5. Backfill the current portfolio

Run the audit across all trading, channel-connected units once, so every unit that is currently short at the channel is either repaired automatically or surfaced as an owner/admin gap.

## Technical notes

- Coverage audit lives beside the existing push verification in `push-property-to-ru` and is reusable from a cron/queue job; parsing reuses `_shared/ruPriceParsing.ts`.
- Verdicts persist per unit (extending the existing readiness/step-status records) so the wizard and console read a stored verdict instead of re-probing, consistent with the current ledger-first behaviour.
- Re-pushes and re-audits go through the existing call queue so the channel's per-minute limits are respected, and are marked deferrable.
- No change to how rates are authored: Rate Plans/Calendar remain the source of truth; this only verifies and re-delivers.
