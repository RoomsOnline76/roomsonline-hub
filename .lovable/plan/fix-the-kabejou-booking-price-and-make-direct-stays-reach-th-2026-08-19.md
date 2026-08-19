# Fix the Kabejou booking price and make direct stays reach the Channel Manager

Two separate faults, both confirmed against the live record for this booking (Kabejou, RU Test Clone A).

## 1. The price is frozen, not calculated

What the data shows:

- The booking carries **no rate plan** (`rolos_rate_plan_id` is empty).
- The repricing step only runs when a rate plan is present, so it returned nothing on all five date changes. The total stayed at **R21,546.67** while the stay went from 8 nights down to 1 night (19–20 Aug).
- The room line records R8,080 for the original 8 nights (R1,010/night), which does not reconcile with R21,546.67 either — the two numbers were written by different code paths.
- The Kabejou unit has **no season price** on the "Rack" plan, even though it is linked to it. The plan is `per_unit` at R1,000/night, so a correct 1-night total is R1,000.
- The repricing step also reads the **legacy** season price table, not the Rate Plans season rates that own pricing today.

The fix:

- Resolve the property's active rate plan for the unit when the booking has none, instead of silently skipping the recalculation. If no plan can be resolved, refuse the modification with a clear message rather than leaving a stale total.
- Price nights from the **Rate Plans** season rates (`rolos_rate_plan_season_rates`), falling back to the plan's base rate, and drop the legacy price-table lookup.
- Reprice per night across season boundaries and honour the plan's pricing model, then write the new total, balance and the room line's nightly rate together so the card, line and total always agree.
- Backfill this booking to its correct 1-night total and store its rate plan.
- Surface a "Kabejou has no season price on Rack" gap in Rate Plans so the missing season rate gets authored.

## 2. Direct stays never reach the Channel Manager

Confirmed behaviour, by design in two places:

- The outbound sync pushes a reservation only for channel-sourced stays; this one is `direct`, so the event trail records `skipped / not_a_channel_booking`.
- The availability push counts only confirmed-class stays as sold. This booking is `pending`, so its nights are pushed to the channel as **open** — the channel can resell them.

The fix:

- Treat a local stay on a channel-listed property as real occupancy for availability: `pending` ROL'OS bookings that hold a unit close the night upstream (unpaid checkout carts with an expired hold stay excluded).
- Push direct stays as confirmed reservations to the channel so they appear in the portal, using the existing rate gate — a rate-limited push is queued, not lost, and the operator sees the queued/pushed toast.
- Record the outcome on the booking sync trail for both the reservation push and the availability delta, so "did this reach the channel?" is answerable from Diagnostics.
- Re-push availability for this property afterwards and confirm the channel shows the Kabejou night as sold.

## Technical notes

- Files: `supabase/functions/modify-booking/index.ts` (rate-plan resolution + season-rate pricing), `supabase/functions/_shared/channelBookingSync.ts` (reservation push for local stays), `supabase/functions/push-property-to-ru/index.ts` sold-night selection (adapter-locked region — change limited to the sold-status filter), `src/components/pms/ManualBookingDialog.tsx` (store the rate plan on new bookings).
- The push-property-to-ru edit touches a locked adapter region; it is confined to which local statuses count as sold and keeps the inventory-authority rule intact.
- One data correction for the affected booking; no schema change required.
