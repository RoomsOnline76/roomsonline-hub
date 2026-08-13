# Fix instant channel booking sync (Anemoon 14–21 Aug)

## What actually happened

The channel did notify us in real time — we received the webhook at 13:35:23 UTC today (reservation 146986680, guest "Dwie Test"). We failed to turn it into a booking. Confirmed from the notification log and function logs:

1. The envelope arrived with an **empty stay block** (no dates, no channel property id) — normal for this channel; the detail must be pulled back.
2. Our detail pull was rejected: `Reservation does not exist.` Because the envelope carried no property id, we could not resolve which distribution account owns the reservation, so we asked the **master account only** — reservations that live under a sub-account are invisible there.
3. The fallback ("pull the whole window") found nothing: the lead pull returns empty and the reservation pull only returns two cancellations.
4. The notification was mis-labelled as **cancelled**. Classification happens per reservation block, and the block loses the envelope name, so status id 4 on an *unconfirmed reservation* envelope reads as a cancellation.
5. Separately, two cancel webhooks from yesterday/today were labelled `reservation_request`, because `LNM_CancelReservation_RQ` matches none of our cancel patterns.
6. Two channel property ids in the poll results (5655616, 5655617) map to nothing in our data (stale listings), so those notifications loop forever as unprocessed.

Result: no booking exists for Anemoon 14–21 Aug, and 4 recent notifications sit unprocessed with no visible error anywhere in the UI.

## Fix

**1. Correct classification**
- Recognise `LNM_CancelReservation_RQ` (and `cancelreservation`) as a cancellation.
- Carry the envelope kind into per-block classification so an *unconfirmed reservation* envelope stays a lead/request even when the block's status id would read as cancelled. Envelope intent wins; the status id only refines within the same family.

**2. Make the detail pull find the reservation**
- When the notification has no property id, fan the lookup out: master account first, then each distribution sub-account, stopping at the first hit. Log which account resolved it.
- If the by-id lookup still says "does not exist", fall back to the lead listing and the reservation listing for that same account and match on reservation id (leads are not always retrievable by id).
- Retry once on transport errors.

**3. Never leave a notification silently unprocessed**
- Store the failure reason and a resolution state on the notification row instead of just `processed = false`.
- Trigger the reconciliation pull immediately (per resolved account when known), not only when every block fails.
- Unknown channel property ids are flagged as "unmapped listing" and surfaced in Channel Reconciliation for one-click cleanup, instead of re-queuing every 30 minutes.

**4. Visibility**
- Reservations panel / diagnostics gets an "Unprocessed notifications" strip: reservation id, kind, error, and a Retry button that re-runs the ingest for that single notification.

**5. Recover the missing booking**
- After the fix, re-run ingest for reservation 146986680 so the Anemoon 14–21 Aug stay lands in Rooms/Dashboard, then process the two stuck cancellations.
- Verify the Anemoon nights show as blocked and that availability is pushed back to the channel.

## Technical notes

- `supabase/functions/_shared/ruReservationParsing.ts` — `classifyRuNotification` (cancel patterns, envelope-kind precedence).
- `supabase/functions/ru-reservation-handler/index.ts` — envelope/block kind resolution, notification state writes, immediate scoped reconcile.
- `supabase/functions/_shared/ruReservationIngest.ts` — `fetchRuReservationById` account fan-out plus lead/list fallback and retry.
- Migration: add `resolution_state` and `error_message` to `ru_notifications` (with grants), backfill existing rows to `pending`/`unmapped`.
- UI: `src/components/integrations/RuReservationsPanel.tsx` (unprocessed strip + retry), Channel Reconciliation for unmapped listing ids.
- No change to the 30-minute safety poll; it stays as the backstop.
