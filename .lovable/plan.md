# Make RU booking sync singular and restore inbound polling

## Confirmed findings
- Albatros OwnerID `742620` has a verified child key and active unit listing `5966579`, but the 20:00 and 20:30 reservation polls only called OwnerID `741761`; the operational owner gate excluded Albatros before polling.
- The outbound create path has no durable create-in-flight claim. The UI dispatch and database job can both create, and field-specific job keys allow repeated creates before an external reservation ID exists.
- A deferred create is replayed directly by the RU queue drainer, but its returned reservation ID is not written back to the booking. Later edits therefore look like new bookings and create again.
- The current poll omits modified reservation statuses 3 and 5, although the ingestion layer already supports them.
- Listing `5966579` is mapped to the active Albatros room type, so the current failure is not a missing local unit mapping.

## Implementation
1. Add an atomic, database-backed reservation-sync claim keyed by booking, with states for creating, created, and terminal failure. This will collapse UI, trigger, and worker round trips into one create operation.
2. Change pending-create deduplication from `booking + change` to `booking + create`, and suppress any second create while the first is in flight or queued.
3. Carry `booking_id` through deferred RU create calls. When the queue succeeds, persist the returned RU reservation ID, integration markers, and sync status before allowing later edits to use the modify path.
4. Resolve child OwnerID and unit listing as one pair. Refuse mismatches before transport with a clear mapping error, rather than repeatedly sending a listing under the wrong account.
5. Fix operational owner discovery so a connected property with a live active unit listing, child keys, and company-profile evidence is included in reservation polling. Add statuses 3 and 5 to the 30-minute pull.
6. Keep lifecycle traffic focused: one create for a new ROL'OS booking, one modify for a subsequent stay/guest/price change, and one unit/date-scoped ARI delta only where inventory changed.
7. Deploy the affected functions, run a focused pull for OwnerID `742620`, re-send the failed Albatros booking once, and verify from logs/database that the RU ID is stored and the same payload is not repeated.

## Technical scope
- Database migration for the atomic booking-create claim and booking-level dedupe.
- `supabase/functions/_shared/channelBookingSync.ts`
- `supabase/functions/_shared/ruBookingSync.ts`
- `supabase/functions/cron-ru-call-queue-drain/index.ts`
- `supabase/functions/cron-pull-ru-reservations/index.ts`
- `supabase/functions/_shared/ruSyncGate.ts`
- Minimal reservation XML correction in `buildPutConfirmedReservationXml` only if the final documentation audit confirms the required `PriceScale` placement.

The locked inbound notification handler will not be changed. Any edit to the RU adapter will be limited to the booking-reservation builder/dispatcher explicitly requested here; property, child-authentication, company, and building lock regions remain untouched.
