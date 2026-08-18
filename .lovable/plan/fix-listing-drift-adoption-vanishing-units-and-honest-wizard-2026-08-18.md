# Fix listing drift: adoption, vanishing units, and honest wizard readiness

## What the data shows (checked before writing this)

**1. Local ids and units, right now**

| Property | Active units | Active units holding a listing id | Inactive units | Property-level id |
| --- | --- | --- | --- | --- |
| Dassiesingel Self-catering Units | 1 (Bosbok) | 1 | 3 — Dassie (holds 5808363), Grysbok, Steenbok | 5806175 |
| Fonteinhutte Self-Catering Chalets | 8 | 8 | 5 — incl. Galjoen | 5808606 |
| Seesig Self Catering Chalets | 9 | 9 | 0 | none |
| Tidal Pools Self Catering Apartments | 4 | 4 | 0 | **5808606 (same as Fonteinhutte)** |

So the "missing units" are not missing at the channel — they are **inactive locally**. Grysbok and Steenbok were deactivated at 15:02 today, Galjoen at 04:57. Dassiesingel is 1 active unit of 4 records, Fonteinhutte 8 of 9.

The single mechanism that does that: saving a property in the editor deactivates every active unit row that is not present in the form's loaded room-type state ("orphan cleanup" in `PropertyForm`). A save made while the units tab held a partial set silently archives the rest — no confirmation, no log the user sees.

**2. The conflicting id is created by the pull itself**

A live pull for Dassiesingel just now returned `remote_count: 58` and re-pointed Bosbok from `5806170` to `5808364`, and additionally claimed `5806175` as a *property-level* listing for a multi-unit property. The matcher:

- searches **all 58 listings, archived included**, with exact → slug → substring fallback, first hit wins;
- assigns `properties.rentalsunited_property_id` from a name match even when the property has active units (no building listing exists);
- has no cross-property uniqueness guard, which is how `5808606` ended up claimed by both Fonteinhutte and Tidal Pools.

**3. "Sub-account is empty" is a stale, sticky message**

The toast fires whenever a pull returns `remote_count === 0`, and that value is persisted into the property's roadmap row, so the wizard keeps reporting "Nothing to adopt — sub-account is empty" afterwards. The account is not empty (58 held).

**4. Readiness 80% is not a content problem**

The server scorer returns `score: 100`, `mandatory_passed: 356/356`, zero gaps for Seesig. The 80% on the onboarding page is wizard **macro** completion, and the macros still open are the read-back ones: `ru_listings_verified_at` is null for Seesig and Fonteinhutte (only Dassiesingel and Tidal carry a read-back), plus the pull/sign-off records. Pushed-and-syncing properties therefore read as 80%.

## What to change

### 1. Adoption may not re-point or invent ids

- Match live listings first; an archived listing is only adopted when nothing live matches, and it is reactivated as part of adoption.
- A unit that already holds an id keeps it unless the account no longer returns that id; never silently re-point a held id to a different listing.
- Drop the substring fallback for units; exact and slug matching only, so "Kaapse Noontjie" can never claim "Kaapse Nooientjie".
- Never write `properties.rentalsunited_property_id` for a property that has active units — a multi-unit property has no building listing.
- Refuse and report any id already held by another property or unit instead of writing it (the 5808606 case), and clear that conflict on Tidal Pools/Fonteinhutte as part of the run.

### 2. Read-back after every push, so readiness is honest

- A successful push immediately runs the read-back and writes `ru_listings_verified_*` (this is what Seesig and Fonteinhutte are missing), so the wizard reflects reality without a manual pull.
- The pull result is only persisted when the channel read actually succeeded; a failed or rate-deferred read leaves the previous record and reports the channel's own reason rather than "sub-account is empty".
- "Sub-account is empty" is only said when the account genuinely returned zero listings for that owner, and the message names the owner.

### 3. Units cannot disappear on save

- The editor's orphan cleanup only runs when the units tab was actually loaded for that property, and it never deactivates a unit that holds a channel listing id.
- Anything it would deactivate is confirmed first, in a branded dialog naming the units.
- Units deactivated while still holding a listing id are surfaced in the property's channel panel as "held at the channel, inactive locally — reactivate or release".

### 4. Reconcile the four Jongensfontein properties after the fix

Reactivate the legitimately-live units (Grysbok, Steenbok, Galjoen, Dassie as applicable), re-adopt their existing listings instead of creating, clear the duplicated `5808606` claim, then confirm per property: active units = matched live listings, and the wizard shows 100% for all four.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts` (`resolve_ru_property_ids`): live-first matching, archived-only-as-fallback with reactivate, drop substring matching for units, skip property-level writes when active units exist, cross-record id conflict check, and only persist verification fields on a successful read.
- `supabase/functions/push-property-to-ru/index.ts`: chain the read-back on push success so `ru_listings_verified_at` is written by the push path.
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx` + `src/hooks/useRolosOnboardingProgress.ts`: only record a pull when the read succeeded; owner-named empty message; treat a fresh push read-back as satisfying `listings_verified`.
- `src/pages/PropertyForm.tsx`: gate the orphan-unit deactivation on a hydrated units tab, exclude units holding listing ids, and confirm via `AlertDialog`.
- No schema change and no new edge function.
