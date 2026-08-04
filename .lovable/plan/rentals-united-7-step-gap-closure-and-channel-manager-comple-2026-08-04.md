# Rentals United: 7-step gap closure and Channel Manager completion

Reference documents (uploaded): `Gaps_vs_current_ROLOS_RU_state_adapter_pattern.csv` (RU minimum-inventory gap matrix) and `All_new_methods_must_live_in_the_is.txt` (adapter pattern + UI linkage rules).

## Verified starting point

A code survey of `supabase/functions` shows the RU method surface is far more complete than the gap CSV assumes. Already implemented: `Push_PutProperty_RQ`, `Push_PutAvbUnits_RQ`, `Push_PutPrices_RQ`, `Push_PutLiveNotificationMechanismSubscriptions_RQ`, `Pull_ListLiveNotificationMechanismSubscriptions_RQ`, `LNM_PutHandlerUrl_RQ`, `CM_LNM_OrderMinimumContentQualityCheck_RQ`, `Pull_ListReservations_RQ`, `Pull_GetLeads_RQ`, plus discounts, currency, users/API keys and locations. `_shared/ruReadiness.ts` already scores Content, Rooms & beds, Photos, Address & geo, Policies & payments, Availability 365d and Pricing 365d. `cron-refresh-ru-ari` already re-pushes ARI daily; `ru-lnm-handler` and `ru-reservation-handler` exist.

So the CSV rows marked "fully missing" are stale. The real remaining work is: enforcement and evidence (does each rule actually block before push), horizon/delta guarantees, per-method certification playgrounds with duplicate tests, and the Channel Manager front-end surface (step 7), which is the genuinely partial piece (`src/pages/pms/PMSChannels.tsx`, `channels/ChannelCard.tsx`, `ConnectChannelDialog.tsx`).

Every step keeps the adapter rules from the second doc: RU logic stays inside the RU edge functions, writes into the unified `pms_*` model via `pms_mappings`, snake_case on the wire, no changes to core calendar/booking components beyond routing on `external_system`, and locked adapter regions (`.lovable/ADAPTER_LOCKS.md`) are only touched with explicit approval.

---

## Step 1 — Static content completeness (form + wizard + edge)

- Phase 1a: Audit each CSV static-content row against `_shared/ruReadiness.ts` and the `push-property-to-ru` dry-run validation, and produce a single machine-readable rule table (min fields, ≥10 amenities, composition rooms/beds ≥ half `CanSleepMax`, ≥10 photos at 1024×683 with exactly one main, ≥1 payment method, ≥1 cancellation policy). Any rule not currently evaluated gets added.
- Phase 1b: Make the rule table the one source for form-side scoring: wire it into `usePropertyReadiness` / `RuChannelContentChecklist` so every rule shows as mandatory (critical) vs recommended, with `data-field` deep-link markers on the exact input to fix.
- Phase 1c: Hard gate in the edge function — `push-property-to-ru` refuses `Push_PutProperty_RQ` when any mandatory rule fails, returning the failing keys (not a generic error) so the UI can deep-link.
- Phase 1d: Cert console gains a "Static content" playground panel: run the dry run per unit, show pass/fail per rule, and a duplicate-push test (push the same property twice, assert RU returns the same PropertyID and no second listing is created).

## Step 2 — Production PutProperty path

- Phase 2a: Single "Save & Push to RU" path from `PropertyForm` and the onboarding wizard through `RuPushContinueButton`, blocked until mandatory readiness is 100%.
- Phase 2b: Persist the returned RU PropertyID canonically (property/unit row + `pms_mappings`), including the multi-unit fan-out, and record every attempt to `ru_sync_runs` with request/response evidence.
- Phase 2c: Idempotency — reuse the stored PropertyID on re-push (update, never create), and detect an existing RU listing by owner + name/address before creating.
- Phase 2d: Cert console regression suite: create → re-push → modify → re-push, asserting one listing, stable ID, and no duplicate buildings.

## Step 3 — Availability push (365 days)

- Phase 3a: Confirm/normalise the horizon to a rolling 365 days sourced from the existing availability cache and admin calendar (authoritative inventory surface only — never summed leaf calendars).
- Phase 3b: Full nightly push via `cron-refresh-ru-ari` plus event-driven delta push on any availability change (booking, block, cancellation) with per-account pacing to respect RU rate limits.
- Phase 3c: Read-back verification with `Pull_ListPropertyAvailabilityCalendar_RQ`, diffing pushed vs stored, surfaced as an availability health grade.
- Phase 3d: Cert console availability panel: push, read back, diff, plus duplicate/overlap tests (same range pushed twice, overlapping ranges).

## Step 4 — Pricing push (365 days, daily)

- Phase 4a: Source daily prices from the ROLOS rate hierarchy (calendar season/rate prices first, then rack) for the full 365-day horizon, in the property's published currency.
- Phase 4b: Event-driven delta on rate/season/special changes plus a nightly full push; PriceLabs-suggested prices included where activated.
- Phase 4c: Read-back with `Pull_ListPropertyPrices_RQ` and a pricing-coverage counter (days priced / 365) feeding the readiness score.
- Phase 4d: Cert console pricing panel with duplicate-push and overlapping-season tests, and evidence capture.

## Step 5 — LNM + MCQ infrastructure

- Phase 5a: Verify subscription completeness per account (master + every sub-user) for all change types incl. `PropertyMCQEligibilityCheck`, with XSD element order preserved and a daily refresh.
- Phase 5b: Read-back diff (`Pull_ListLiveNotificationMechanismSubscriptions_RQ`) to catch silent drift; alert when RU holds a stale UrlBase or change-type set.
- Phase 5c: Handler hardening — `ru-lnm-handler` answers 200 within 3 s, treats every notification as a re-pull signal, is idempotent under at-least-once delivery, and logs to `ru_sync_runs`.
- Phase 5d: MCQ ordering (sub-user credentials only) with result persistence in `ru_mcq_orders`, surfaced as a status chip in `PropertyForm` and on the portfolio RU tab; RU-side `Status 17` is reported as an RU fault with the ResponseID, not a ROLOS payload bug.
- Phase 5e: Cert console coverage: subscribe → read back → order → receive, plus duplicate-subscription test.

## Step 6 — Reservation ingestion

- Phase 6a: Dual path — RLNM/`ru-reservation-handler` for live pushes and `Pull_ListReservations_RQ` polling as the safety net (never rely on notifications alone).
- Phase 6b: Normalise into the unified reservation model (`pms_reservations` + `bookings` where applicable) with native-code → UUID mapping, guest data, channel creator username mapped to a channel, and availability blockout written on insert.
- Phase 6c: Idempotency keyed on RU reservation ID (insert-or-update), plus cancel/modify handling via `Push_CancelReservation_RQ` / `Push_ModifyStay_RQ` reconciliation.
- Phase 6d: Cert console reservation playground: pull, ingest, re-ingest (assert no duplicate booking), cancel, modify.

## Step 7 — Channel Manager surface

- Phase 7a: Channel registry becomes data-driven (channel key, logo, connection mode: RU white-label vs direct, required identifiers), so an admin can add a channel that RU exposes without a code change; sales channels resolved via `Pull_ListSalesChannels_RQ`.
- Phase 7b: Each `ChannelCard` gains a "readiness to connect" badge/counter driven by the same RU readiness model; clicking a non-100% counter deep-links to the exact outstanding fields (via existing `data-field` markers).
- Phase 7c: Connect flow: RU white-label channels connect through master → sub-user token scope with the embed/script injection point; non-RU channels use the thin custom connection UI over existing owner/property IDs. Status, eligibility (MCQ), and last push timestamps shown per card.
- Phase 7d: Placement — the Channel Manager surface lives on property detail (`PMSChannels`) and at portfolio level, with a portfolio roll-up of connected channels and blockers.
- Phase 7e: Cert console verification that inventory is visible and eligible per channel (listed on RU, availability + pricing coverage, MCQ passed), with the milestone tracker and JSON/PDF evidence export extended to channel readiness.

---

## Technical notes

- All RU calls stay in `rentalsunited-api` / `push-property-to-ru` / `ru-cert-portal` / `ru-lnm-handler` / `ru-reservation-handler`; UI layers call them PMS-agnostically.
- One shared readiness rule table (`_shared/ruReadiness.ts`) must remain the only scorer used by the form, the push gate and the cert console — no second copy of the rules.
- Sub-user AccessKey/SecretKey auth for anything scoped to a white-label owner; master keys never used as a fallback.
- Every push and pull writes an evidence row to `ru_sync_runs` so the Coverage tab, compliance counters and PDF/JSON export stay accurate.
- Locked adapter regions require explicit approval before edits; availability must come from authoritative inventory endpoints.

## Delivery order

Steps run in the listed sequence (1 → 7); each step ends with its cert-console panel and duplicate tests green before the next begins.
