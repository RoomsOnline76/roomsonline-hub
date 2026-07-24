
## Context: what already exists

`rentalsunited-api` implements every mandatory RU XML action (`Push_PutProperty_RQ`, `Push_PutAvbUnits_RQ`, `Push_PutPrices_RQ`, `LNM_PutHandlerUrl_RQ`, `Pull_ListReservations_RQ`, `Pull_GetLeads_RQ`, `Push_PutLongStayDiscounts_RQ`, `Push_PutLastMinuteDiscounts_RQ`, plus building/user management). `push-property-to-ru` orchestrates the multi-unit push. `ru-reservation-handler` receives RLNM callbacks. `cron-push-all-properties-to-ru` and `cron-pull-ru-reservations` exist as functions.

## Gap analysis vs RU White-Label mandatory requirements

| RU requirement | Frequency | Current | Gap |
|---|---|---|---|
| `Push_PutProperty_RQ` on change + weekly | weekly | Function exists | **No pg_cron schedule; only fires manually from UI** |
| `Push_PutAvbUnits_RQ` on change + every 24h | daily | Only pushed inside full property push | **No dedicated daily availability refresh cron** |
| `Push_PutPrices_RQ` on change + every 24h | daily | Only pushed inside full property push | **No dedicated daily price refresh cron** |
| `LNM_PutHandlerUrl_RQ` | continuous | Re-subscribed inside weekly push cron | OK once weekly cron scheduled |
| `Pull_ListReservations_RQ` every 30 min | 30 min | Function exists | **No pg_cron schedule** |
| Auto-enable RU push when property PMS = ROLOS | — | Manual UI toggle only | **Missing auto-activation trigger** |
| Minimum content validation (Floor, Space, ZipCode, DetailedLocationID, PaymentMethods, CancellationPolicies, beds ≥ CanSleepMax) | — | Validates only images/amenities/coords | **Pre-push readiness gate incomplete** |
| Guest Communication REST API | optional | not wired | Deferred to Phase 4 |
| WL User Management (`create_user`, `fill_company_details`) | as needed | Actions exist in `rentalsunited-api` | UI review only |

## Phased rollout

### Phase 1 — Cron scheduling (mandatory cadences)
Create a single migration `supabase/migrations/<ts>_ru_cron_schedules.sql` that uses `net.http_post` via `supabase.insert` (per project rule — user-scoped anon key, not `supabase--migration`). Schedules:
- `ru-refresh-content-weekly` — Sunday 02:00 UTC → `cron-push-all-properties-to-ru` (full property + RLNM re-subscribe).
- `ru-refresh-ari-daily` — 03:00 UTC daily → **new** `cron-refresh-ru-ari` edge function (pushes `Push_PutAvbUnits_RQ` + `Push_PutPrices_RQ` for every RU-connected unit; skips full content push).
- `ru-pull-reservations` — `*/30 * * * *` → `cron-pull-ru-reservations`.

### Phase 2 — New / updated edge functions
- **New** `supabase/functions/cron-refresh-ru-ari/index.ts` — iterates all RU-connected properties/units and invokes `rentalsunited-api` `push_availability` + `push_prices` (365-day window). Adapter-lock aware: reuses payload builders in `push-property-to-ru`, does **not** modify `ru-reservation-handler`.
- **Update** `cron-push-all-properties-to-ru` — add structured result logging to a new `ru_sync_runs` table for observability (batch id, action, unit id, ok/error, http status, elapsed ms).
- **Update** `push-property-to-ru` validation: extend `validateUnit()` to enforce Floor, Space, ZipCode, DetailedLocationID, PaymentMethods ≥1, CancellationPolicies ≥1, and total-beds ≥ `CanSleepMax`. Return blocking errors before any RU call.

### Phase 3 — Auto-activation when PMS = ROLOS
- **DB trigger** on `properties` (via `supabase--migration`): when `primary_pms`/`external_system` transitions to `rolos` (and property is active), set `ru_push_enabled=true` (new column, default false). Existing rows updated by the same migration.
- Weekly cron already skips rows without `rentalsunited_property_id`; extend it to first-time-create the RU property when `ru_push_enabled=true` and `rentalsunited_property_id IS NULL` (calls `push-property-to-ru` which already handles create-vs-update).
- UI: `PushToRentalsUnited.tsx` gets a read-only badge "Auto-managed (ROLOS PMS)" plus a manual "Push now" button; the manual toggle stays for non-ROLOS properties.

### Phase 4 — Observability & optional extras
- New admin page `src/pages/admin/RUSyncStatus.tsx` reading `ru_sync_runs` (last run per action, per property, error surface, "push now" button).
- Add nightly RLNM health probe (calls `subscribe_notifications` if last confirmed > 20h) inside the daily ARI cron so we don't wait a full week for re-subscription recovery.
- Guest Communication API wrapper (`rentalsunited-guest-api`) — scaffold only, gated behind admin flag; deferred build until user confirms need.

## Technical notes

- All new RU calls go through `rentalsunited-api` (adapter contract preserved: `{success, data, error}`, snake_case wire, camelCase TS).
- `push-property-to-ru` and `ru-reservation-handler` remain in `.lovable/ADAPTER_LOCKS.md`; changes limited to (a) validation additions in `push-property-to-ru`, and (b) result logging — both explicitly requested in this turn, satisfying the lock's "same-turn approval" rule. RLNM handler is **not** modified.
- Cron scheduling uses `supabase--insert` (SQL contains project ref + anon key which mustn't ship as a migration — matches existing pattern in `<schedule-jobs-supabase-edge-functions>`).
- New table `ru_sync_runs` created with RLS (admin/dev/fearless_leader read; service_role write) via `supabase--migration`.

## Deliverables checklist

```text
[migration] properties.ru_push_enabled + auto-activation trigger
[migration] ru_sync_runs table + RLS + grants
[insert]    3 pg_cron schedules (weekly content, daily ARI, 30-min pulls)
[edge]      cron-refresh-ru-ari (new)
[edge]      cron-push-all-properties-to-ru (logging + ARI-skip flag)
[edge]      push-property-to-ru (extended validation only)
[ui]        PushToRentalsUnited.tsx (auto-managed badge)
[ui]        admin/RUSyncStatus.tsx (new)
```

No changes to `ru-reservation-handler`, no changes to the booking orchestrator, no changes to other PMS adapters.
