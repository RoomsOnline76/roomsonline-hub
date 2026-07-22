## Goal

Ensure the ROLOS-authored **cancellation policies** and **payment methods** are correctly surfaced through both public APIs (`roomsonline-pms-api` and `booking-portfolio-api`) end-to-end, and confirm rate-level policy overrides flow through.

## Scope (surfacing only — no channel push, no checkout UI)

### 1. `booking-portfolio-api` — verify enrichment
- Re-confirm the `include_static_content=true` branch returns:
  - `cancellation_policies[]` (from `rolos_policies`, resolved via `rolos_policy_rate_links` when a rate plan is linked; fallback to property-level policy)
  - `payment_methods[]` (from `properties.payment_*` fields + `payment_gateway_registry` for enabled providers)
  - `contact_details[]` (already added)
- Add per-rate-plan policy resolution so each rate row in the response carries its linked `cancellation_policy_id` + summary.

### 2. `roomsonline-pms-api` — add rate-level linkage to existing actions
- `get_cancellation_policies`: extend response to include `linked_rate_plans[]` (id + name from `rolos_policy_rate_links` → `rolos_rate_plans`).
- `get_payment_methods`: include provider display name + logo key from `payment_gateway_registry` when available.
- Add new action `get_reservation_policies` mirroring cancellation-policies structure but reading from `rolos_reservation_policies` (deposit/guarantee/no-show terms).

### 3. Docs
- Update `src/pages/ApiDocsViewer.tsx`:
  - Document the new `get_reservation_policies` action.
  - Add response-shape examples for cancellation/payment/reservation policies.
  - Document that portfolio API rate rows now carry `cancellation_policy` + `reservation_policy` snippets when `include_static_content=true`.

### 4. Verification
- `supabase--curl_edge_functions` smoke tests against both endpoints for a known property (Jongensfontein) confirming policies + payment methods appear.
- `tsgo` typecheck.

## Out of scope
- Cancellation-policy authoring UI (already done).
- Payment-provider selection UI (already done).
- Channel push of these fields (separate future task).
- Checkout UI consumption (separate future task).

## Files touched
- `supabase/functions/booking-portfolio-api/index.ts`
- `supabase/functions/roomsonline-pms-api/index.ts`
- `src/pages/ApiDocsViewer.tsx`
