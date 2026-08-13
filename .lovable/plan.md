# Release RU rejection 146986812 and prevent stale holds

## Verified state

- RU reservation `146986812` is local booking **ROL-TID-0242** for Elf, 22–28 August.
- It is still `pending` with no `hold_released_at` value.
- All six nights remain blocked locally (`available_units: 0`, `is_stop_sell: true`).
- The backend has received only the original request and the 14:00 status-4 poll result. There is no rejection/cancellation event for this reservation yet.
- The scheduled reservation poll runs every 30 minutes, so the latest recorded poll predates the reported portal rejection.
- The shared ingest supports statuses 2/7/8 as cancellation, but currently resolves the channel property/unit before looking up an existing booking. A sparse rejection payload without stay/property details can therefore fail before it reaches the cancellation-and-release path.

## Plan

1. **Reconcile and repair this booking immediately**
   - Pull reservation `146986812` from its owning RU sub-account.
   - Require RU to return rejected/cancelled/expired status before changing local state.
   - Run the normal shared cancellation ingest so the booking becomes `cancelled`, records `channel_cancelled`, and releases Elf for 22–28 August.
   - Confirm all six local availability rows become sellable and that the booking disappears from active calendar occupancy.

2. **Make sparse RU rejection events reliable**
   - Change shared ingest to find an existing RU booking before requiring a property mapping.
   - For cancellation/rejection, fall back to the existing booking’s property, room type, and stay dates when RU omits `StayInfos` or `PropertyID`.
   - Keep the channel-first rule: only release locally after a verified status 2, 7, or 8, or a cancellation envelope.

3. **Preserve both automatic convergence paths**
   - Keep RLNM as the immediate path when RU sends a rejection callback.
   - Keep the 30-minute reservation poll as the safety net when the portal action emits no callback.
   - Ensure either path uses the same idempotent cancellation logic and cannot re-open a rejected lead during subsequent lead polling.

4. **Verify end to end**
   - Replay a sparse rejection fixture for an existing held lead and confirm cancellation plus availability release.
   - Replay it again to prove idempotency.
   - Verify an active status-4 request remains held and is not accidentally cancelled.
   - Inspect the final booking, six availability dates, and notification/poll outcome separately.

## Technical scope

- Shared reservation ingest and parsing helpers.
- RU reservation handler/poll tests or certification fixtures.
- One verified data reconciliation for reservation `146986812`.
- No changes to booking references, pricing, or unrelated channel behaviour.