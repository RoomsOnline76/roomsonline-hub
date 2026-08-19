# Stop the pricing warning appearing for unconfirmed reads

## What is actually happening

All nine units on RU Test Clone A are stored with the verdict `unverified` — the channel price read-back was rate-deferred, so the audit never got an answer. Verified in the database: every one of the nine rows reads `verdict = unverified`, `channel_priced_days = 0`, `local_unpriced_days = 0`, with the summary "Price coverage could not be verified at the channel — re-queued for another read."

That is not a pricing problem. It means "we haven't been able to look yet". Two things go wrong today:

- The panel treats every non-`verified` verdict as a problem, so unconfirmed reads get an amber "Pricing for the year ahead needs attention on 9 units" warning.
- Re-check counts only real gaps (`channel_short` + `local_incomplete`), so the toast correctly says all clear while the banner stays — the two disagree.

The daily health report already ignores `unverified` and only reports real gaps, so the panel is the outlier.

## The fix

1. Only warn about real gaps. The amber block appears only when a unit is `channel_short` (rates being re-sent) or `local_incomplete` (owner must author rates).
2. Show unconfirmed reads as a quiet, neutral status line instead of a warning: "Still confirming the priced year for 9 units — the channel read is queued and retries on its own." No amber, no alert icon, no "needs attention" wording.
3. Make re-check and the display agree: the toast counts the same set the banner does, and after a re-check the panel refreshes and briefly polls so that when the queued read lands the line resolves to confirmed on its own without another click.
4. When some units are confirmed and others are still pending, show both: the confirmed summary plus the quiet pending line.

## Technical detail

- `src/components/onboarding/channel/ChannelPriceCoveragePanel.tsx`: split `problems` into `gaps` (`channel_short`, `local_incomplete`) and `pending` (`unverified`). Warning block renders on `gaps.length > 0` only; `pending` renders as muted text. Re-check keeps using the `channel_short + local_incomplete` summary and adds a short reload poll (a few reads over ~30s) so a draining queued read updates the line without user action.
- No change to `supabase/functions/_shared/ruPriceCoverage.ts` verdict logic, no schema change, and no change to the health report — the audit is classifying correctly; only the presentation was wrong.
