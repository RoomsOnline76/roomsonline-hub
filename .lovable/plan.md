## Current state (audit)

Cancellation terms in ROLOS exist in **two disconnected places**:

1. **`rolos_policies` table** (tiered `days_before` / `forfeit_percent`), edited in `PoliciesTab` (surfaced only inside `RateManagerTab`).
   - Used at checkout / cancel-modal via `usePolicies` + `formatCancellationPolicy` + `CancelBookingModal`.
   - **Not pushed to any channel.**

2. **`properties.amenities.cancellation_policies`** (legacy `{ days, forfeit, description }[]`) and the flat `amenities.cancellation_policy` text.
   - Pushed to Rentals United (`push-property-to-ru` → `mapCancellationPolicies`) and Hostfully (`property.cancellationPolicy`).
   - Rendered on `PropertyShowcase` / `Booking` / `GuestPortal`.
   - **Not evaluated by the checkout policy engine or `CancelBookingModal`.**

Result: an operator entering terms in the Policies tab sees them honoured at checkout but never on channels; entering them via the amenities blob sends them to channels but the checkout engine ignores the tiers. The Nightsbridge-style panel you shared (Forfeit % + days before arrival, 1-night deposit rules, non-refundable toggle, min-advance-stay) has no single equivalent surface today.

## Goal

One manually maintained cancellation policy per property that is:
- Edited in one obvious place in the admin form.
- The single source of truth in DB.
- Pushed to every outbound channel adapter.
- Evaluated by the checkout, guest-portal cancel, and staff cancel-booking flows.

## Plan

### 1. Canonical storage
- Keep `rolos_policies` (policy_type = `cancellation`) as the canonical store — it already backs the checkout engine and supports tiers, non-refundable, date-range overrides, dynamic mode.
- Extend the `rule` JSON with the fields the Nightsbridge panel exposes and channels need:
  - `deposit_percent` (default 100)
  - `one_night_refundable` (bool)
  - `full_payment_within_days` (e.g. arrival ≤ 7 days ⇒ full amount)
  - `additional_terms` (free text shown to guests)
- No schema migration required (JSON column). Add a Zod schema in `src/lib/schemas/cancellationPolicy.ts` so all producers/consumers share one contract.

### 2. Admin UI — promote PoliciesTab to a first-class tab
- Move `<PoliciesTab />` out of `RateManagerTab` and mount it as its own top-level tab in `PropertyForm` (e.g. `Policies`), so it is discoverable next to General / Rates / Rooms.
- Extend `PoliciesTab` with the extra fields above (deposit %, 1-night refundable, full-payment window, additional terms) using the design tokens (no hardcoded colors).
- Add a "Use recommended policy" quick-fill (mirrors the Nightsbridge screenshot: 100% forfeit if cancelled ≤ 7 days before arrival, else free).
- On save: also mirror the same rule into `properties.amenities.cancellation_policies` (translated to legacy `{days, forfeit, description}[]`) and `amenities.cancellation_policy` (human-readable summary from `formatCancellationPolicy`) so existing showcase/channel readers keep working during migration.

### 3. Single formatter / translator
- New helper `src/lib/cancellationPolicy.ts`:
  - `toLegacyAmenitiesShape(rule)` → `{ days, forfeit, description }[]` used by `push-property-to-ru` and Hostfully mapping.
  - `toHumanSummary(rule)` reusing `formatCancellationPolicy` for showcase text.
  - `toHyperGuestPolicies(rule)` for the HyperGuest push shape.
- Server-side twin in `supabase/functions/_shared/cancellation-policy.ts` (Deno) so edge functions can read `rolos_policies` and translate on the fly.

### 4. Channel push updates
- **Rentals United (`push-property-to-ru`)**: fetch `rolos_policies` for the property; if present, use its translated tiers as `cancellation_policies` instead of reading from `amenities`. Keep the amenities fallback for legacy properties.
- **Hostfully (`hostfully-api`)**: same — replace `property.cancellationPolicy` with `toHumanSummary(rule)`.
- **HyperGuest (`hyperguest-api`)**: today it *pulls* the channel's own policy into `rolos_policies`. Add a guard: if a manual policy already exists and is marked `manual_override: true`, do not overwrite on reflection.
- **Nightsbridge / Checkfront / Benson**: they own their policies upstream — no push, but continue mirroring their pulled policy into `rolos_policies` so the checkout engine has a value.

### 5. Checkout + cancel flows
- Already read `rolos_policies` — verify `Booking.tsx` and `PropertyShowcase.tsx` swap the amenities text for `toHumanSummary(rule)` when a `rolos_policies` row exists.
- `CancelBookingModal` and `SmartCancelModal` already accept a `cancellationPolicy` prop from the evaluator — no change needed once the data path is unified.

### 6. Non-goals (kept out this pass)
- No changes to deposit-collection logic, payment gateways, or refund automation.
- No new DB tables or migrations.
- No PMS adapter internals beyond the specific push-payload swap described above (respects `ADAPTER_LOCKS.md`).

## Answer to your question
Manual cancellation terms **can be loaded** today, but only into one of two silos — neither reaches both channels and the checkout engine at once. The plan above collapses them into a single manual entry point that is authoritative for both.
