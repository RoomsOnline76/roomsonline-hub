# Three RU traffic refinements from the Test 4 replay review

## 1. Stop the wasted currency write, and stop calling status 339 a failure

Verified current behaviour:

- `push-property-to-ru` calls the currency decision *before* the property push, because the
  property envelope carries `<CurrencyID>` and must already be right.
- `decideRuCurrency` only skips the write when it holds read-back evidence (scoped location
  read-back, or a durable listing-level verdict for the same account/location/ISO). Location
  83272 had neither, so it fired the write and got 339.
- `rentalsunited-api` already returns 339 as `success: true, already_set: true` to the caller.
- The traffic row still reads failed: `ruApiLog` accepts only status ids `0` and `5`, so a 339
  response is written with `success: false` and a `channel_error` reason.
- The 10-minute "identical flip already succeeded" shortcut queries `ru_api_log` with
  `success = true`, so a prior 339 never satisfies it — which is why the write repeats.

Changes:

- Treat 339 as an accepted channel status when logging, so the row is green and carries no
  `channel_error` reason (scoped to that status id, with the reason line stating "already on the
  requested currency" rather than a refusal).
- Widen the pre-flight shortcut to accept a recent 339 row, not just a `success = true` row, so a
  location confirmed on the authored ISO within the window is answered from the log with no write.
- Record the confirmation durably on the 339 path (scoped location currency + listing verdict) so
  the next run short-circuits before it ever reaches the channel — this is what turns "wasted write
  every run" into "one write, ever".
- Keep the decision where it is in the sequence (the property envelope needs the resolved ISO), but
  when the decision resolves from evidence no call is made at all; a genuinely needed flip stays a
  pre-push write because publishing in the wrong currency is worse than one extra call.

## 2. Delete the login/password key-mint branch

`mintChildKeyPair` currently queues three envelopes: the held credential, the same credential again
after 6s, then a master-authenticated mint scoped to the OwnerID. For a brand-new child the held
credential is login + password, which the channel answers with `-4` twice before the owner-scoped
mint succeeds — two guaranteed refusals per account.

Change: only queue the credential envelope when a stored **key pair** exists (rotation on an
existing account). When the only credential is a login/password, go straight to the
master + OwnerID mint. The retry variant is kept only for the key-pair envelope, where a transport
blip is a real possibility. Attempt trails and the `-4` self-healing labels stay intact for the
paths that remain.

## 3. Replay cooldown before the next Test 4 run

Nothing currently stops a fresh run from starting inside the channel's sliding minute for calls the
previous run just made, so the replay manufactures its own 429s.

Change: add a pre-flight cooldown to the onboarding orchestrator. Before starting a run it measures
the remaining sliding-window time for this property's `Push_PutAvbUnits_RQ` and
`Pull_ListOwnerProp_RQ` keys (using the existing rate-gate slot helper) and, when either is still
inside the window, returns the run as rate-deferred with a `retry_after_ms` instead of firing —
which the existing gate countdown in the workspace already renders. No new table and no polling
loop: the run resumes on the same automatic resume path used for channel rate deferrals today.

## Technical notes

- `supabase/functions/_shared/ruApiLog.ts` — accepted-status handling for 339.
- `supabase/functions/rentalsunited-api/index.ts` — `push_change_currency` log shortcut.
- `supabase/functions/_shared/ruCurrency.ts` — durable record on the 339 path.
- `supabase/functions/ru-cert-portal/index.ts` — `mintChildKeyPair` variant list.
- `supabase/functions/ru-onboard-property/index.ts` — replay cooldown pre-flight, using
  `ruSlotBusyMs` from `_shared/ruRateGate.ts`.
- Memory `mem://features/pms/step-a-self-healing-key-mint` is updated to record that the
  password-authenticated mint variant is removed.
