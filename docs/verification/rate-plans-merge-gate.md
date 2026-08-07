# Rate Plans — Verification Regime (final merge gate)

Last run: 2026-08-07 · Verdict: **PASS — safe to merge**

The unified Rate Plans model is additive and dormant: every one of the 104
properties still resolves rates through the legacy path
(`properties.rate_resolution_mode = 'legacy'`). Nothing in this change set can move
a served price until a property is deliberately switched.

---

## 1. Automated suite

Two runners, both green.

| Runner | Command | Result |
| --- | --- | --- |
| Edge / shared logic (Deno) | `deno test --allow-read --allow-env supabase/functions/_shared/` | 57 passed, 0 failed |
| Frontend (Vitest) | `npm test` (`vitest run`) | 24 passed, 0 failed |

### What each suite guards

| File | Guards |
| --- | --- |
| `_shared/ratePricing.test.ts` | The pure effective-rate engine: differentials, per-person tiers, rounding. |
| `_shared/ratePricingGate.test.ts` | Tier precedence (daily override → calendar season → plan season → relational → rack → unit daily) and differential stacking. |
| `_shared/ariSnapshot.test.ts` | Golden ARI payloads built from real captured property fixtures — a shape or number change fails here first. |
| `_shared/rateParity.test.ts` | The kill switch: unknown/missing/error modes always fall back to `legacy`; served rate is never `null`/`NaN`; parity logging never throws. |
| `_shared/revenueGate.test.ts` | Accommodation vs F&B split always balances to the guest total, and revenue-eligible statuses are unchanged. |
| `_shared/ruPriceParsing.test.ts` | Channel price parsing (both element and attribute variants). |
| `src/components/pms/rateplans/ratePlanDraft.test.ts` | Editor draft → save payload, including the backward-compatible legacy writes. |
| `src/lib/commissionResolver.test.ts` | Commission type/rate hierarchy and linearity in gross amount. |

### Fixture capture

`scripts/capture-ari-fixtures.sql` snapshots real property rate data as JSON for the
ARI snapshot tests. Re-run it after any intentional pricing change and review the diff.

---

## 2. Data-model compatibility gate

`psql -f scripts/verify-rate-compat.sql` — all 10 checks **PASS**:

1. Baseline row visibility unchanged (42 plans, 65 links, 3 seasons, 0 prices).
2. No existing row hidden by the new soft-delete / `is_active` flags.
3. Every new column is nullable or defaulted — no existing insert can start failing.
4. New tables (`rolos_shared_seasons`, `rolos_rate_plan_season_rates`) exist, are empty, RLS enabled with policies.
5. Compatibility view returns exactly the legacy price projection.
6. That view is `security_invoker`, so caller RLS still applies.
7. Kill switch untouched: 104 / 104 properties on `legacy`.
8. All 9 indexes booking and ARI rely on are present.
9. Legacy reader query shapes still execute unchanged.
10. Calendar remains the season owner (19 properties still hold JSONB seasons).

---

## 3. Shadow parity review

`rolos_rate_resolution_audit` holds 4 drift rows, all from `booking-portfolio-api`,
all with `room_type_id = null`:

| Legacy tier | Unified tier | Cause |
| --- | --- | --- |
| `portfolio_legacy_min` | `calendar_season` | Legacy falls back to the rate type's `baseRate` (e.g. Rack R1 000) for the portfolio "from" price, while the unified engine reads the real season amount for the cheapest unit (e.g. R610). |

Verified directly against `properties.amenities` for Fonteinhutte: R610 exists as a
configured season amount, R1 000 is the Rack `baseRate`. The unified value is the more
correct one, and it is **not served** — these rows are shadow logs only. No action
required before merge; the portfolio "from" price is the first candidate to migrate.

---

## 4. Manual critical paths

Checked in the running preview (Jongensfontein portfolio, 4 properties):

| Path | Result |
| --- | --- |
| ROL'OS → Rate Plans renders all plans grouped by property, with pricing model, rate, min stay and linked units | Pass — zero console errors |
| Calendar (season painting) loads unchanged | Pass — the season configurator UI was not touched |
| Rooms → Room Type Plan availability matrix and per-type room lines | Pass — inventory counts intact |
| Admin → Edit Property → Rates & Pricing, ROL'OS property | Read-only plan summary + "Manage Rate Plans in ROL'OS" CTA; legacy Rate Types / Seasons / Rate Breakdown sub-tabs hidden; no writes issued |
| Admin → Edit Property → Rates & Pricing, non-ROL'OS property | Full editable mirror of the same configurator; original sub-tabs still present |
| Booking + ARI numbers | Unchanged by construction (all properties on `legacy`) and pinned by the ARI snapshot tests |

Two display defects found and fixed during this pass:

- Linked-unit chips rendered a raw UUID when the unit no longer resolved. Now labelled "Archived unit".
- `rateParity` coerced a missing rate to `0`, logging a phantom delta for every night a tier legitimately did not price. Now preserved as `null` (audit-only; no served price affected).

---

## 5. Rollback plan

The change set is additive, so rollback is a switch, not a migration.

**Level 1 — single property (seconds, no deploy).**

```sql
UPDATE properties SET rate_resolution_mode = 'legacy' WHERE id = '<property-id>';
```

Every consumer reads this per request, so the next booking, ARI push and report use
legacy resolution immediately.

**Level 2 — global (seconds, no deploy).**

```sql
UPDATE properties SET rate_resolution_mode = 'legacy' WHERE rate_resolution_mode <> 'legacy';
```

Confirm with check 7 of `scripts/verify-rate-compat.sql`.

**Level 3 — revert the code.** Redeploy the previous build of
`booking-portfolio-api`, `modify-booking`, `pms-channel-sync`, `push-property-to-ru`,
`ru-cert-portal` and `rolos-rate-plans`. The new tables can stay: they are empty for
legacy properties and no legacy reader queries them.

**Level 4 — drop the new surface (only if truly required).** The new tables, columns
and view are additive; dropping `rolos_shared_seasons`, `rolos_rate_plan_season_rates`
and `rolos_v_effective_rates` restores the pre-Phase-2 schema without touching a single
legacy row. Keep the sync trigger's legacy writes in mind: seasonal rates saved through
the new editor also exist in `rolos_rate_prices` and survive the drop.

**Do not roll back by editing data.** Never delete plans or prices to undo a pricing
issue — flip the mode and investigate with `rolos_rate_resolution_audit`.

---

## 6. Re-running the gate

```bash
deno test --allow-read --allow-env supabase/functions/_shared/   # 57 tests
npm test                                                        # 24 tests
psql -f scripts/verify-rate-compat.sql                          # 10 checks, all PASS
psql -c "select consumer, count(*), round(avg(abs(delta)),2) from rolos_rate_resolution_audit group by 1"
```

Merge only when both suites are green, all 10 SQL checks read PASS, and every drift row
in the audit table has a written explanation.
