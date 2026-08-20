# Edit reservation: price and billing must follow the new stay

Editing ROL-700-0002 (RU Test Clone B) exposed three separate faults. The accommodation reprice does work — the stay is now 21 nights and the room total moved to R19,740 — but everything around it stayed frozen.

## What is wrong today

1. **Extras never move.** The reservation still carries an "Extra Guest Fee" of R9,000, calculated as "R250 x 6 guests x 6 nights" when the booking was made. The stay has since been changed twice (to 3 nights, then to 21 nights) and that R9,000 line, and its matching folio entry, never changed. Extras are only ever created once, at booking, and are deliberately skipped if any already exist.
2. **Two of the three charges were never applied at all.** The property has a Tourism Levy (0.5% of accommodation) and a R500 Breakage Deposit configured and active, but neither exists on this reservation. The server-side charge engine recognises method names that no longer match the ones the property editor saves ("flat"/"percentage" instead of "flat per stay"/"percentage of accommodation"), so those two charges silently compute to zero and are dropped.
3. **Billing ignores extras.** The reservation total, balance due, refunds and the guest-facing figures are all built from accommodation only. Balance due currently reads R19,740 while the folio separately holds R9,000 of extras and no accommodation line at all, so no single number is correct.

## What will change

**One guest total.** The reservation total becomes accommodation plus mandatory extras (levies, surcharges, fees). Refundable deposits such as the Breakage Deposit stay itemised separately and are not folded into the total. Balance due, overpayment/refund handling and the price sent to the Channel Manager all follow that one figure.

**Extras recalculate automatically on every edit.** When dates or guest counts change, rule-based extras are recomputed for the new stay, the reservation's charge lines and the folio are corrected in place (old line adjusted, not duplicated), and anything an operator posted by hand on the folio is left untouched.

**One charge engine, correct method names.** The server-side calculation is replaced with the same logic the property editor and the folio use, so flat-per-stay, percentage-of-accommodation, per-night, per-person, per-person-per-night and per-room-per-night all behave identically everywhere. The percentage levy is calculated on the new accommodation figure, not the old one.

**Backfill the missed charges.** On the next edit (and via a repair pass for existing reservations at ROL properties), charges configured on the property but missing from the reservation are created, so the levy and deposit appear where they should have from the start.

**The dialog shows the new bill before saving.** The Modify booking dialog gains a compact breakdown: accommodation for the new stay, each extra with its own working ("R250 x 6 guests x 21 nights"), the refundable deposit listed apart, the new guest total, and what that means for the guest — balance still owing or amount overpaid. The operator can still override the total; doing so keeps the extras breakdown visible so it is clear what was overridden.

**The reservation card matches.** The booking detail account panel is fed from the same figures, so accommodation, extras, deposit, payments and balance reconcile with the dialog and with the folio.

## Technical notes

- New shared module `supabase/functions/_shared/propertyCharges.ts`, ported from `src/components/charges/ChargeCalculator.ts` (identical method names, caps, room-type and night-range scoping, `is_included_in_rate` handling, revenue-stream split). It becomes the single server-side authority.
- `roomsonline-pms-api` `apply_service_charges` switches to that module and loses its divergent inline branches; its "skip if any charge exists" guard becomes a reconcile (create missing, update changed, remove rule-based lines that no longer apply).
- `modify-booking` gains a step after the accommodation reprice: recompute extras for the new stay, reconcile `rolos_booking_charges` and their `rolos_folio_transactions`, write `charges_breakdown` on the booking, and pass `accommodation + non-refundable extras` as `newTotal` into `applyBookingSettlement` and as the Channel Manager `ClientPrice`. Deposits are written to `deposit_amount`, not the total.
- A read-only quote endpoint/action returns the same breakdown for the dialog, so the preview and the save use one calculation rather than two.
- `BookingModifyDialog` renders the breakdown from that quote instead of its current room-rate-only sum; manual override still wins for the accommodation figure.
- `BookingDetailsGrid` reads accommodation, extras, deposit and payments from the reconciled folio.
- Deposits and levies also feed the channel push through the existing `ruDeposits` path — no new channel fields.

## Verification

- Re-run the edit on ROL-700-0002: extras must read R250 x 6 guests x 21 nights, the Tourism Levy must appear at 0.5% of R19,740, the Breakage Deposit must appear as R500 refundable and excluded from the total, and balance due must equal the new guest total.
- Shorten the stay again and confirm the extras and levy fall proportionally and the folio shows corrected lines, not duplicates.
- Confirm a manually posted folio extra survives an edit untouched.
