# Cutting duplicate channel traffic

I measured the last 48 hours of channel traffic and grouped calls by "same endpoint, same payload, close together". Four patterns are genuine duplicates, three are legitimate and stay as they are.

## What the traffic actually shows

Noisy — should be removed:

1. **A reservation the channel cannot find is re-probed forever.** Every ~10 minutes the same unresolved reservation id triggers 9 calls: a detail read against the master account and each of the two distribution accounts, then a lead list and a reservation list per account (a 90-day-back / 365-day-forward window). 20 identical detail reads and 20 identical list pulls in the last 90 minutes alone, all answering "does not exist". Nothing stops the loop and nothing tells an operator about it.
2. **Unchanged availability and prices are re-sent.** One availability payload was sent 90 times in 48 hours, byte-identical. Each call already stores a fingerprint of what it sent, but nothing compares it before sending. The 6-hourly full refresh therefore re-publishes a full year of unchanged calendar for every unit, every time.
3. **Two schedules pull reservations, plus a third and fourth caller.** The reservation poll and the lead-lifecycle job both run every 30 minutes and both call the reservation list and lead list per account; the health check and the unresolved-reservation loop call the same two methods again. They compete for the channel's one-call-per-method-per-minute slot, which is where the "maximum number of requests for this API method" refusals come from.
4. **The reconciliation run asks for the listing list twice, half a second apart.**

Valid — leave alone:

- One price call and one availability call per unit per range: the channel takes a single listing per call, so a multi-unit property legitimately produces a run of calls 1.6s apart.
- Content pushes per property, notification subscription checks, and the lead poll's own 30-minute cadence.
- Deliberate read-backs that declare a purpose (coverage audit, availability repair) — already gated and rare.

## What changes

**Give up gracefully on an unfindable reservation.** Record each failed resolution attempt for a reservation id and back off: 2 minutes, 10, 30, 2 hours, then stop after the fifth attempt and raise an open action ("the channel no longer knows this reservation") on the list built last turn. Within one pass, stop as soon as an account answers, and skip the master-scope probe when the accounts have already been asked. A later live notification for the same id clears the memo and resolution starts fresh.

**Do not send a payload the channel already has.** Before an availability or price write, compare the new fingerprint against the last successful send for the same unit and window. If identical, skip the call and record it as "unchanged — not sent" so the monitor shows suppression rather than silence. A real change, a manual push, and the first refresh of each day always send regardless, so the calendar is still proved daily.

**Trim the full refresh.** The 6-hourly job refreshes a rolling near window (next 90 days) only; the full year runs once a day. With fingerprint suppression on top, an untouched property produces almost no traffic between changes.

**One reservation pull per account per window.** A successful reservation-list or lead-list answer is reusable for 5 minutes by any caller (poll, lifecycle job, resolution loop, health check) instead of each making its own call. The health check reads the last pull from the traffic log rather than calling the channel.

**Reconciliation asks once.** The listing list is fetched once per run and shared by the passes inside it.

**Monitor surface.** Endpoint counters gain a "Not sent (unchanged)" and "Reused answer" column beside Refused / Never reached / Throttled, and the live log gets a small "repeat payloads" view showing any endpoint that sent the same payload more than once in an hour — so new noise is visible instead of having to be dug out with a query.

## Verification

After deploying, re-run the reservation poll, the 6-hourly refresh, and the reconciliation, then compare the same 48-hour duplicate query: identical-payload availability sends should drop to at most one per day per unit, the unresolved-reservation probes should stop after five attempts with an open action raised, and the method-limit refusals on the reservation list should disappear. I will report the before/after counts rather than assume the change worked.

## Technical notes

- New table `ru_resolution_attempts` (reservation id, attempts, next_attempt_at, last_error, resolved_at) with RLS via `ru_traffic_viewer()`; consulted in `ruReservationIngest.ts` / `ruReservationIdentity.ts`, cleared by `ru-lnm-handler` on a fresh notification, terminal state raises `recordRuOpenAction({ kind: 'listing_missing' })`.
- Fingerprint suppression in `ruAriDelta.ts` (and the availability/price paths in `push-property-to-ru`), reading the last successful `ru_api_log` row by `fingerprint` + `unit_id` + `push_type`; skipped calls logged with `transport_status='not_sent_unchanged'` so `ru_api_log_endpoint_stats` can count them.
- Short-lived pull reuse extends the 60-second reservation-detail cache in `rentalsunited-api/index.ts` into a shared 5-minute reuse for `list_reservations` / `get_leads` / `get_reservation_by_id`, keyed on method + scope + window, returning `reused_recent_read`.
- `cron-refresh-ru-ari`: near-window (90 days) on the 6-hourly schedule, full year on the 00:00 pass only.
- RPC `ru_api_log_endpoint_stats` extended with `not_sent` and `reused` columns; `useRuLiveTraffic.ts` and `EndpointCounterTable.tsx` updated, plus a `RepeatPayloadsPanel` in the live monitor.
