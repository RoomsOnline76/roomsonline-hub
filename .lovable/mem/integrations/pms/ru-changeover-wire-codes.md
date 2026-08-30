---
name: RU changeover wire codes & RUPrice authority
description: Measured Rentals United changeover codes (4 = arrival+departure allowed, 1 = neither) and the rule that RUPrice must equal the channel's own calculated stay price
type: feature
---

**Changeover codes (measured 2026-08-30, listing 5973280).** The `<C>` value in
`Push_PutAvbUnits_RQ` / `Changeover` in the availability calendar is:

- `4` — arrival AND departure allowed (the only code that lets a reservation check in)
- `1` — neither arrival nor departure
- `2` / `3` — one-sided codes; both refused a check-in in the live probe

ROL'OS internal scale stays `0 none, 1 arrival only, 2 departure only, 3 both`, translated in
`supabase/functions/_shared/ruChangeover.ts`. A one-sided internal rule publishes as `4` and is
enforced locally instead — an over-permissive night beats a sales blackout.

**Why:** we previously sent `1` for "both allowed", so every night of every calendar was published
as "no check-in, no check-out". The channel then refused every reservation write with
`Property is not available for a given dates - Can't check in or check out on selected dates`
while `Units="1"` / `IsBlocked=false` read back clean — the refusal message is genuine, not a
sold-night race. After sending `4`, the same stay was accepted immediately. Any calendar pushed
before this fix must be re-pushed before reservations can register.

**RUPrice authority.** The channel prices the stay itself from the published seasons and refuses
any other amount with status 34 `RUPrice is not valid. Correct price is:X`. `push_confirmed_reservation`
therefore restates the stay ONCE at the channel's own price (parsed from the message); the guest
still pays the ROL'OS total on our invoice. A second mismatch is a real fault.

Diagnosis aid: out-of-calendar dates answer `There is no space to add this apartment!`, closed
changeover answers `Can't check in or check out on selected dates` — the two are distinguishable.
