# Fix booking changes rejected by the channel

## Confirmed diagnosis

The failed edit is not reaching the channel as a modification because booking `ROL-700-0001` has no channel reservation ID. Each edit therefore falls back to `Push_PutConfirmedReservationMulti_RQ` (create).

The create recovery then reopens the stay with internal changeover value `1`. The shared mapping correctly converts that to channel wire value `2`, which means **arrival only**, not “arrival and departure allowed.” The channel read-back confirms `Changeover=2` for 29 August, so departure remains prohibited and the channel rejects the reservation.

A second defect masks the failure: the outer recovery queue can receive a successful `queued:true` response when its replay is deferred into a nested queue. It currently marks the outer row done and the booking `synced` even though no channel reservation ID was returned.

## Implementation

1. **Correct the focused availability repair**
   - Reopen only the affected stay/listing as today, but use the canonical internal value for **both arrival and departure allowed** (`3`), which serializes to channel `<C>1</C>`.
   - Keep the existing focused date range and one-unit availability; do not trigger a property-wide ARI push.

2. **Make queue completion truthful**
   - Treat `success:true, queued:true` from a queue replay as a hand-off, not channel delivery.
   - Do not mark the booking synced or write `integration_type='rentalsunited'` until the terminal queue replay returns an actual channel reservation ID.
   - Preserve/propagate the booking identity into nested rate-limit queue rows so the final successful replay can store the returned reservation ID against the correct booking.
   - Settle the reservation-operation claim only on terminal delivery or terminal refusal, not on an intermediate queue hand-off.

3. **Stop repeated impossible creates**
   - On a genuine terminal channel refusal, mark the booking sync status failed with the exact channel response rather than leaving a misleading synced state.
   - Once creation succeeds and the channel ID is stored, subsequent date/price/guest changes route through `Push_ModifyStay_RQ`.

4. **Repair this booking and verify**
   - Clear only the stale failed/in-flight create state for `ROL-700-0001`, then replay its current stay once through the corrected flow.
   - Verify raw exchange logs show focused availability with `<C>1</C>`, successful confirmed-reservation creation with a returned reservation ID, and no repeated create loop.
   - Perform one follow-up edit and confirm it emits `Push_ModifyStay_RQ`, not another create.

## Technical scope

- Shared channel booking sync helper: changeover repair and operation-claim settlement.
- Channel call queue drainer: nested queue hand-off and final booking status/ID persistence.
- Targeted backend data cleanup for the affected booking only.
- No broad availability or price push, no adapter-contract changes, and no UI changes.
