# Post-verification cleanup: docs, help text, architecture note

The verification gate is green (57 Deno + 24 Vitest tests, 10/10 SQL compatibility checks, all drift rows explained). This is the follow-up housekeeping pass.

## 1. Shim removal — verified position: remove nothing yet

Checked before writing this plan:

- All **104 / 104** properties still have `rate_resolution_mode = 'legacy'`.
- `rolos_rate_plan_season_rates` = 0 rows, `rolos_shared_seasons` = 0 rows, `rolos_stay_restrictions` = 0 rows, `rolos_rate_prices` = 0 rows, `rolos_rate_plans` = 42 rows.

So the "legacy" path is not a shim — it is the only path currently serving prices. Removing the dual-write or the legacy resolver tiers today would break booking, ARI and reporting for every property. That contradicts the zero-breakage requirement, so this step becomes an **audited inventory plus one safe deletion**, not a purge:

- Write `docs/rates-shim-inventory.md` listing every compatibility surface, its live consumers, and the exact precondition that must hold before it may be deleted:
  - `trg_sync_rolos_rates_to_overview` / `sync_overview_rates_to_rolos` (`rolos_rate_plans` ↔ `properties.amenities.pms_rate_types`) — live, read by Admin and the legacy resolver.
  - `trg_mirror_rate_plan_season_rate` (new plan-season rows → `rolos_rate_prices`) — dormant but required the moment the editor is used; keep.
  - Legacy tiers in `_shared/rateResolution.ts` (`calendar_season`, `rack`, `unit_daily`) — live for all 104 properties.
  - `rateParity.ts` shadow logging + `rolos_rate_resolution_audit` — the migration's only safety net; keep until the last property is switched.
  - Legacy writes emitted by `ratePlanDraft.ts` → `rolos-rate-plans` — keep.
- Only genuinely consumer-free item found: the view `rolos_v_effective_rates` has zero application consumers (referenced solely by `scripts/verify-rate-compat.sql` check 5 and generated types). It stays, re-labelled in docs as a verification-only artifact rather than a migration shim, so nobody wires app code to it.
- Deletion preconditions recorded per surface: `count(*) from properties where rate_resolution_mode <> 'unified'` = 0, zero unexplained drift rows for 30 days, and the ARI snapshot suite green after a re-baseline.

## 2. Documentation + operator help text

Single rule stated everywhere, in the same words:

> **Calendar = seasons only (when). Rate Plans = commercial rates + unit links (what it costs).**

- `docs/rolos-pms-module-spec.md` — rewrite section 6 (Rate Plans & Pricing Engine) and the sync-matrix row so Rate Plans is described as the single configurator; note the Admin Rates tab is read-only for ROL'OS properties with a deep link, and that legacy Rate Types / Seasons / Rate Breakdown sub-tabs exist only for non-ROL'OS properties.
- `docs/system-capability-reference.md` — same correction where rate authoring is described.
- `docs/rates-backward-compatibility-contract.md` — add a "current status" header pointing at the merge-gate report and the shim inventory.
- Operator-facing help text (in-app copy, no logic changes):
  - Rate Plans page header/description and the editor's "Pricing by Season" section: state that season dates come from the Calendar and are read-only here.
  - Calendar / Seasons surface: state that seasons define dates only and pricing lives in Rate Plans.
  - Admin Rates & Pricing read-only panel: one line explaining why it is read-only for ROL'OS properties.
  - Matching help article body updates for the rate-management article so the assistant answers with the new rule.

## 3. Architecture note

New `docs/architecture/rate-plans-adapter-note.md`, short:

- Rate resolution is an **adapter boundary**: every consumer (booking-orchestrator-api, booking-portfolio-api, modify-booking, pms-channel-sync, push-property-to-ru, ru-cert-portal, reporting) calls one resolver and receives the same `{ nightly rate, tier, restrictions }` shape. The unified model was added behind that interface, not beside it.
- Why nothing broke: additive schema only; a per-property kill switch (`rate_resolution_mode`) defaulting to `legacy`; the new engine ran in **shadow mode**, computing and logging deltas without serving them; the legacy mirror kept the old readers whole.
- How it was proven: golden ARI snapshots from real captured fixtures, pure-engine precedence tests, kill-switch fallback tests, revenue/commission invariance tests, 10 SQL compatibility checks, and audit-table drift review.
- Diagram of the tier precedence and the switch, as ```text.

## Commit message

```text
rates: document unified Rate Plans surface; no shim removal (zero-breakage)

Calendar owns seasons; Rate Plans owns commercial rates + unit links.
Docs, operator help copy and a new adapter-pattern architecture note updated
to match the single Rate Plans configurator.

Compatibility shims are retained deliberately: all 104 properties still
resolve via rate_resolution_mode = 'legacy', so the legacy tiers and the
rolos_rate_prices mirror still have live consumers. Deletion preconditions
recorded in docs/rates-shim-inventory.md.

Verified: 57 Deno + 24 Vitest tests green, scripts/verify-rate-compat.sql
10/10 PASS, ARI golden snapshots unchanged, all rolos_rate_resolution_audit
drift rows explained (shadow-only). No served price changes.
```

## Technical notes

- Docs and copy only. No migrations, no edge function changes, no resolver changes, so no re-run of the gate is required beyond a typecheck.
