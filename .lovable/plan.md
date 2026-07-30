# Rentals United — Testing Regime: Coverage + Property Readiness Gate

## What already exists (verified)

- `ru-cert-portal` edge function with actions: certification `run` (step-by-step milestone runner with request/response capture), `compliance` (cadence rules + pg_cron job inventory), `wl_readiness` (per-property dry-run validation + live 365-day ARI probe), `discounts`, `user_management` (parked).
- Cadence rules already encode RU's max ages: content 168h, availability/prices 24h, reservations 1h, RLNM 24h — with four expected cron jobs (weekly content, 6-hourly ARI, 30-min reservations, daily RLNM re-subscribe).
- `push-property-to-ru` supports `dry_run` and returns a validation object per unit (name, ObjectTypeID, CanSleepMax, images count, main image, amenities count, coordinates, street, zip, space, floor, DetailedLocationID, description, payment methods, cancellation policies, beds, rooms).
- `rentalsunited-api` handles RU Status 5 (partial success with `<Notifs>`) and uses AccessKey/SecretKey only.
- Console UI (`RuCertificationConsole.tsx`) has tabs: Runs, Refresh compliance, Discounts, WL readiness, Users.

## Part A — Close the gaps in the Certification & Compliance module

1. **Photo rule is incomplete.** Today only the count (≥10) is checked; the 1024×683 minimum is not. Add per-image dimension validation in `push-property-to-ru`'s dry-run payload build (use stored width/height where available, otherwise flag as "unverified dimensions") and surface `images_meeting_size` alongside `images_count`.
2. **Beds rule is wrong.** Current check requires total beds ≥ CanSleepMax; RU requires beds to cover **at least 50%** of CanSleepMax. Relax to the 50% rule and report the actual ratio.
3. **Room amenities not checked.** Add a check that every CompositionRoom has a valid `CompositionRoomID` **and** at least one room-level amenity/bed entry, per requirement 9–10.
4. **Milestone matrix view.** Add a `milestones` summary derived from the last certification run, showing the 11 mandatory methods (health check, `Pull_ListOwnerProp_RQ`, `Pull_ListSpecProp_RQ`, `Pull_ListPropertyAvailabilityCalendar_RQ`, `Pull_ListPropertyPrices_RQ`, `Push_PutProperty_RQ` create + update, `Push_PutAvbUnits_RQ`, `Push_PutPrices_RQ`, `LNM_PutHandlerUrl_RQ`, `Pull_ListReservations_RQ`) plus optional `Pull_GetLeads_RQ`, each with pass/fail/never-run and last-run timestamp.
5. **Status-code panel.** Explicitly display RU status IDs per step, calling out Status 5 partial successes with the `<Notifs>` text so they are not read as clean passes.
6. **Evidence export.** Add a "Download certification evidence" action producing a single JSON/printable bundle of the run's request and response XML — what RU asks for on the certification call.

## Part B — ROLOS property readiness scorecard with sync gating

Applies to properties where ROLOS is the PMS and the Channel Manager toggle is on.

1. **Shared scorer.** Extract the readiness scoring currently inline in `ru-cert-portal.wl_readiness` into a shared module under `supabase/functions/_shared/ruReadiness.ts` so admin and ROLOS both score identically. Expose a new `property_readiness` action taking a single `property_id`.
2. **ROLOS UI.** Add an "RU Readiness" scorecard to the ROLOS Channels page (and the Rentals United card in ROLOS Integrations):
   - Big percentage score plus a Ready / Not ready badge.
   - Grouped checklist: Content, Rooms & beds, Photos, Address & geo, Policies & payments, Availability 365d, Pricing 365d.
   - Each failing item shows the deficiency in plain language and a deep link to the exact tab/field that fixes it.
   - Refresh button re-runs the dry run.
3. **Hard gate.** Block RU sync until the score is 100% on mandatory items:
   - Frontend: disable "Push to Rentals United" / channel-connect actions with the reason shown.
   - Backend: `push-property-to-ru` rejects non-dry-run pushes for properties failing mandatory checks (returns `NOT_READY` with the gap list), so the gate cannot be bypassed via API. Admins keep an explicit `force: true` override.
4. **Admin roll-up.** The existing WL readiness tab gets a sortable score column and a "blocked from sync" flag so you can see the whole estate at a glance.

## Technical notes

- No schema change is required for scoring; it is computed from `properties`, room types, images and the live RU ARI probe. If image pixel dimensions are not stored on the image records, a follow-up migration to persist `width`/`height` at upload time would be needed for the 1024×683 check to be authoritative rather than best-effort — I will confirm during implementation and flag it if so.
- Discounts (long-stay, last-minute) stay optional and are excluded from the mandatory gate.
- Guest communication and RU user management remain out of scope/parked.
