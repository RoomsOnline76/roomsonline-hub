# Policies tab rework — master-first UX, linked to Specials

The Policies tab (Rate Manager → Policies, in both /admin/edit property and ROL'OS → Setup property) still renders the pre-wizard stacked-card list. It gets restructured around one decision that must always be explicit — what the property's master fallback policy is — and around how policies feed the Specials tab.

## 1. Master policy decision panel (top of tab)

A prominent panel that always shows one of three states:

- **Master set** — policy name, plain-language summary ("Flexible — free cancellation up to 30 days, then 100% forfeit"), deposit line, and actions: Edit, Change master.
- **No master chosen yet** — warning styling, "Choose a master policy" with a picker of existing policies, or "Create master policy", or "This property has no cancellation policy".
- **Explicitly none** — confirmed neutral state: "No cancellation policy — bookings are fully flexible / terms handled offline", with a Change action. This removes the permanent red warning once the owner has deliberately made that choice.

"Explicitly none" is persisted, so the state survives reloads and can be reported on by the readiness/quality gate rather than being an absence of data.

Below the panel, a short resolution explainer (the actual checkout order): selected special's policy → rate-plan linked policy → master → none.

## 2. Policy library as a table

Replaces the stacked cards with a compact table matching the reference layout:

| Policy | Terms summary | Applies to | 90-day performance | |
|---|---|---|---|---|
| name + Master/Default/Linked/Copied badges | "Flexible — 30 days", "Non-refundable", deposit note | rate plans, channels, **and specials using it** | room nights / revenue / cancel rate | row actions |

Row actions move into a single menu: Edit, Set as master, Set as default, Apply to other properties, Push to linked copies, Delete. Delete is blocked with a clear reason when the policy is master, default, linked to rate plans, or referenced by a special.

## 3. Link to the Specials tab

- Each row lists the specials that reference the policy, each one clicking through to the Specials tab.
- A "Used by specials" section summarises specials with no policy attached (they inherit the master) so it's obvious what the master governs.
- On the Specials tab, every special card gains its resolved cancellation-policy label — its own policy, or "Inherits master: <name>" / "No cancellation policy" — with a link back to Policies.

## 4. Portfolio library

The "Available from other portfolio properties" block stays but becomes a collapsible section with sibling property name, terms summary, and the existing Copy / Link choice, so it no longer competes visually with the property's own policies.

---

## Technical notes

- Migration: add a nullable `properties.cancellation_master_mode text` (`unset` | `policy` | `none`, default `unset`) plus a check constraint via trigger; existing properties with a master policy are backfilled to `policy`. No new table, so no new GRANTs beyond what `properties` already has.
- `PoliciesTab.tsx` becomes the composition root: `MasterPolicyPanel`, `PolicyLibraryTable`, `PortfolioPolicyLibrary` — each its own file under `src/components/property/policies/` to keep files small.
- `useReservationPolicies` gains `masterMode` state plus `setMasterMode('none' | 'policy')`; `setMaster` also flips the mode to `policy`.
- Specials cross-reference reads `property_specials.cancellation_policy_id` (already present) with a small `usePolicySpecialUsage(propertyId)` hook; the resolved-label helper is shared with `useResolvedCancellationPolicy` so tab display and checkout agree.
- No change to the checkout resolver behaviour: an explicit "none" master simply means the existing `source: "none"` path, and the legacy `rolos_policies` fallback is skipped when mode is `none`.
- Verification: typecheck plus a Playwright pass over the Policies tab in both entry points (admin edit property and ROL'OS setup property), covering set master, explicit none, and a special's inherited label.
