## What I verified in the code first

- **Phase 1 (sub-user) is out of order today.** `push-property-to-ru` has a `resolveRuOwnerAccount()` helper and a `ru_owner_accounts` table, but line 1974 hard-codes `const ruOwnerId = 738925` ("master account, sub-accounts disabled"), so every property is pushed under the master OwnerID and the helper never runs. `Push_FillCompanyDetails_RQ` is never called during onboarding — it exists only as a manual button in the cert portal, behind the `user_management` flag in `ru_platform_settings`.
- **Phase 2 exists and works.** `wl_readiness` / `property_readiness` in `ru-cert-portal` score against the shared `_shared/ruReadiness.ts`.
- **Phase 3 order is correct.** Push property → store `rentalsunited_property_id` → `pushARI()` (availability + prices) → `pushDiscounts()`, with a `mandatoryGaps()` hard gate before the live push in both the single-unit and multi-unit paths. Building creation precedes unit links in the multi-unit branch.
- **Phase 4 partial.** Read-back and cadence/cron compliance exist. `CM_LNM_OrderMinimumContentQualityCheck_RQ` is not implemented anywhere in the repo.

So: order is right for Phases 2–3, wrong/missing for Phase 1, and incomplete for Phase 4.

## What to build

### 1. Portfolio sub-user (Phase 1)
- Extend `ru_owner_accounts` to key on `portfolio_id` (nullable) alongside the existing owner email, plus columns for company-details completion (`company_filled_at`, `company_payload`). Standalone properties get their own record keyed on the property.
- New `ru-cert-portal` actions: `ensure_owner_account` (resolve portfolio → existing record → else `Push_CreateUser_RQ` → `Pull_ListMyUsers_RQ` to capture OwnerID → persist) and `fill_company_details` extended to write back completion state.
- Rewrite the OwnerID block in `push-property-to-ru` to call the resolver (portfolio first, then property owner, then master as an explicit admin-chosen fallback) instead of the hard-coded constant.

### 2. Hard gate every phase
A single shared gate module (`_shared/ruPhaseGate.ts`) returning phase status for a property:
- **P1** blocked unless a sub-user OwnerID exists *and* company details are filled.
- **P2** blocked unless `external_system = roomsonline` and `ruReadiness` mandatory score is 100%.
- **P3** ARI/discount pushes blocked unless `rentalsunited_property_id` is stored; building step first for multi-unit.
- **P4** MCQ order blocked unless read-back (`Pull_GetProperty_RQ` + availability + prices) succeeded within the last 24h.

`push-property-to-ru` calls the gate before any RU write and returns `PHASE_BLOCKED` with the failing phase and remedies. Existing `force_push` remains an admin-only escape hatch and is logged to `ru_sync_runs`.

### 3. MCQ (Phase 4.3)
- Add `order_mcq` to `rentalsunited-api` building `CM_LNM_OrderMinimumContentQualityCheck_RQ` (auth block + PropertyID), plus a `mcq_status` read-back if RU exposes one.
- Store results on a new `ru_mcq_orders` table (property_id, ru_property_id, ordered_at, status_id, response_preview) with admin RLS + grants.
- Expose "Order MCQ" in the certification console, gated on P4.

### 4. Onboarding UI — the ordered flow
- New `RuOnboardingPipeline.tsx`: a 4-phase stepper (sub-user → readiness → push → verify) showing per-step state, blockers, and the action button for the current step only. Later steps render disabled with the reason.
- Mount it as a new "Onboarding" tab in `AdminRentalsUnited.tsx` and reuse it (property-scoped, read-only for owners) inside `PropertyFormIntegrationsTab.tsx` and ROLOS → Channels, replacing the bare "Push to RU" button with the pipeline.
- Trigger point: whenever a property is set to ROLOS as PMS with the Channel Manager toggle on, the pipeline is what the admin/owner walks.

### Technical notes
- Files touched: `supabase/functions/push-property-to-ru/index.ts`, `rentalsunited-api/index.ts`, `ru-cert-portal/index.ts`, new `_shared/ruPhaseGate.ts`, `src/pages/AdminRentalsUnited.tsx`, `src/components/integrations/RuCertificationConsole.tsx`, `src/components/property/PropertyFormIntegrationsTab.tsx`, `src/components/pms/channels/RuReadinessScorecard.tsx`, new `src/components/integrations/RuOnboardingPipeline.tsx`.
- Migrations: alter `ru_owner_accounts`, create `ru_mcq_orders` (with GRANTs + admin/dev/fearless_leader RLS).
- No change to cadence crons or the RLNM handler; adapter-locked regions in the RU adapter are left untouched.
