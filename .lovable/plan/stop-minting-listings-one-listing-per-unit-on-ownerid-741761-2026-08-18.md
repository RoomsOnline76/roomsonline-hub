# Stop minting listings: one listing per unit on OwnerID 741761

## What the data actually shows (verified before writing this)

Local records for the four Jongensfontein properties:

| Property | Active units | Units holding a channel listing id | Other ids held |
| --- | --- | --- | --- |
| Dassiesingel Self-catering Units | 1 | 1 | 1 id on an **inactive** unit |
| Fonteinhutte Self-Catering Chalets | 8 | 8 | building listing 5808606 |
| Seesig Self Catering Chalets | 9 | 9 | — |
| Tidal Pools Self Catering Apartments | 4 | **3** | — |

So ROL'OS itself is already inconsistent: one Tidal unit has no listing id at all (that is the "missing unit"), and Dassiesingel holds a listing id on a unit that is no longer active — neither is surfaced anywhere today.

The last account read (03:10 cron, OwnerID 741761) returned **26 live + 13 archived = 39 listings**, with 8 live orphans (Kaapse Noontjie, Roman, Blaasoppie, Steenbras, Perekil, Kabejou, Mosselkraker, Karel Grootoog) and 19 counted as billable locally. The portal now showing 51 active means another generation was minted after that read.

Why creates keep happening, from the adapter code:

1. The duplicate pre-check only adopts a **non-archived** listing whose name matches exactly. A listing that was archived (by cleanup or in the portal) is never adopted or reactivated — the next push creates a brand-new listing instead.
2. If the owner listing read fails or is rate-limited, the pre-check logs a warning and **continues as a create**. A single throttled read mints a full new generation.
3. Matching is exact-name-only, so any whitespace/case/renaming difference in a unit name creates again.
4. Only 741761 has stored API keys; every other sub-account returns "no keys — listings could not be read", so the "no other account holds listings" rule is currently assumed, not proven.

## What to change

### 1. Never create when the account already holds the listing
- Adoption looks at **all** listings for the owner, archived included. An archived match is reactivated (existing set-status path) and then updated — no new id.
- Name matching is normalised (trim, collapse whitespace, case-fold, strip punctuation) and falls back to the property/unit's previously stored id even if it was cleared locally.
- If the owner listing read fails or is throttled, the push **defers that unit** with a clear reason instead of creating. Creating blind is what produced the extra generations.
- Creates are never retried blindly: on a transport failure or a channel error that returns an id, re-read the account and adopt.

### 2. Make every unit tracked, or visibly untracked
- Reconciliation gains a per-property "expected vs channel" line: active units, units holding a listing id, units with no id, ids held by inactive units.
- The Tidal unit with no id and the Dassiesingel id on an inactive unit are shown as actions ("push to create/adopt", "release or reactivate") rather than being invisible.
- The header check becomes: matched + duplicates + orphans + archived = account total, and separately local active units = matched live listings.

### 3. Enforce 741761 as the only account holding listings
- Any listing found on an owner other than 741761 is a red violation with the account named.
- Accounts we cannot read (no stored keys) are reported as "unverifiable — cannot prove empty", not silently treated as zero, with a one-click prompt to store keys or archive the sub-account.

### 4. Bring the account back to 26
Once counters are honest, run cleanup from the monitor: archive every live listing on 741761 that is not the keeper for an active unit (surplus duplicate copies and the orphan generation), then confirm a fresh read returns 26 live and the per-property lines match the table above.

## Technical notes

- `supabase/functions/rentalsunited-api/index.ts` (`push_property`): pre-check uses full listing list; archived hit → `Push_SetPropertiesStatus_RQ` reactivate then update; failed/throttled list read returns `RU_ADOPTION_UNVERIFIED` instead of falling through to create; keep the existing status-92 distances handling and stranded-id adoption.
- `supabase/functions/push-property-to-ru/index.ts`: treat `RU_ADOPTION_UNVERIFIED` as a deferred unit (resumable, reported), persist adopted/created ids before ARI (unchanged behaviour, verified in place).
- `supabase/functions/channel-manager-entitlement/index.ts` (`reconcile`): add per-property footprint block (active units, ids, gaps), owner-allowlist violation flag, unverifiable-account classification.
- `src/hooks/useChannelReconciliation.ts` + `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx`: render the per-property footprint rows, untracked-unit actions and the 741761-only violation banner.
- No schema change.
