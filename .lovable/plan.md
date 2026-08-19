# Channel Step Ledger — Phase 2 (section dirty monitor)

Goal: when property data is saved, mark **only the affected ledger steps** stale. No re-grade, no channel calls, no wizard behaviour change.

## What changes

1. **Two thin helpers** (client + edge) that invoke the existing `ledger_mark_stale` action from Phase 1.
2. **Explicit calls at known save sites** — fired only after the save has already persisted, never blocking or rolling back a save.
3. **No-op semantics**: flag off, ledger not seeded, or any failure → console warn (staff-only toast at most) and the save still reports success.

No DB triggers: the app write paths below cover every surface in the mapping table.

## Save site → steps marked stale

| Save site (file) | Steps |
|---|---|
| `src/pages/PropertyForm.tsx` main save (single `properties` update/insert) | derived per changed field group — see below |
| Room type / unit writes in `PropertyForm.tsx` (`hostfully_room_types`, occupancy, beds) | `rooms` |
| Image / hero-image writes | `media` |
| `src/components/pms/rateplans/RatePlansPanel.tsx`, seasons/rates and availability calendar saves, policies & payment config | `commercial` |
| `ru-cert-portal` `ensure_owner_account` success | `push_owner` |
| `ru-cert-portal` `save_api_keys` / `verify_api_keys` (any terminal outcome) | `keys`, `company_profile` |
| `ru-cert-portal` `ensure_company_details` outcome | `company_profile` |
| `recordSignoff` / `recordSignoffCheck` in `useRolosOnboardingProgress.ts` | `signoff` |
| `resolve_ru_property_ids` / listing pull | `pull_listings` |
| `push-property-to-ru` success | `publish`, `currency` |
| Channel Manager entitlement enabled/disabled | `entitlement` |
| Channel connection state change (where already tracked) | `connect` |

### Field-group derivation for the main property save

`PropertyForm` persists many sections in one row update, so the changed steps are derived by diffing the submitted payload against the record loaded at mount, using the section keys already defined in `src/config/propertyFieldRequirements.ts`:

- `general` (name, type, description, owner/company fields, VAT) → `identity`
- address / city / country / geo fields → `location`
- `images` → `media`
- `rooms`, `info-facilities` → `rooms`
- `rates`, policy/payment fields → `commercial`

If nothing in a group changed, that step is not touched. If the diff is empty, no call is made at all.

## Technical notes

- Client helper `markChannelStepsStale(propertyId, stepKeys)` added to `src/lib/channelStepLedger.ts`; it checks `isChannelStepLedgerEnabled()` first, dedupes keys, then invokes `ru-cert-portal` with `action: "ledger_mark_stale"`. Returns quietly on any error.
- Edge helper: existing `markLedgerStale` in `supabase/functions/_shared/channelStepLedger.ts` is called directly (flag-gated) from the RU writers listed above, wrapped so a ledger failure can never fail the outer action.
- Marking stale keeps prior `passed_at` (already enforced by the Phase 1 trigger).
- Calls are idempotent and skipped when the property has no seeded ledger rows (`seeded: false` no-op).

## Out of scope for this phase

- Wizard still reads readiness exactly as today (no ledger reads).
- No auto-recheck after mark_stale, no ARI probes, no `phase_status` invocation from save handlers.

## Acceptance checks

- Edit photos only → `media` stale; `keys` / `publish` stay `passed`.
- Edit rates → only `commercial` stale.
- With the flag off or the ledger empty, every save path behaves exactly as today.
- `ru_api_log` volume unchanged for normal property edits (no new channel calls).
