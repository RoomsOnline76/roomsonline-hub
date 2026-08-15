# Fix channel listing truth: reconcile counts, wrong local ids, duplicate listings

## What the channel account actually holds

I pulled the last real account read (OwnerID 741765, 82 listings) and compared it to our records:

- **30 listings are live** on the account, **52 are archived**. Only ~17 should be live.
- The live 30 include **duplicate generations of the same units**: Elf, Geelstert, Leervis, Oester, Swartmossel, Tobie, Witmossel and friends each exist 2–3 times as live listings from repeated pushes.
- **Seesig** stores 8 unit ids that are already **archived upstream** (SWARTMOSSEL, TOBIE, SEESTER, ANEMOON, ALBATROS, DUIKER, OESTER, WITMOSSEL) — the live copies of those units are newer ids we never wrote back.
- **Tidal Pools** stores the older live generation (5655615–18) while a newer live generation also exists (5763616, 5763881–83, 5763781).
- **Dassiesingel** is genuinely pushed and live (Bosbok, Steenbok, Dassie, Grysbok), but its property-level id is wrong: both Dassiesingel and Seesig carry property id **5655615**, which is actually Tidal's unit "Elf".
- **Fonteinhutte** has push switched on but no listing ids at all — never pushed.
- Four **"(Copy)" clone properties** (Dassiesingel, Fonteinhutte, Seesig, Tidal) are active with no channel footprint, which is what inflates the "13 properties / 13 not connected" gauge.

So the reconcile figures are not fantasy — they are the real mess. But two display bugs make them look impossible.

## Bugs to fix

1. **Double counting.** Reconcile counts an archived listing as live whenever a local record still points at it, so 30 live + 60 archived = 90 on an account that only holds 82. Buckets must be mutually exclusive and add up to the account total.
2. **Local id collisions are silently dropped.** Local records are indexed in one map keyed only by listing id, so Dassiesingel and Seesig sharing 5655615 (and that id also being Tidal's unit) means one record vanishes from the comparison. Index by record kind + id and report a collision class instead.
3. **No "pointing at an archived listing" class.** The single most important finding for Seesig has nowhere to appear, so it reads as "matched".
4. **Cost monitor bills local ids, not channel truth**: it reports 17 billable while the account carries 30 live listings, and it shows a footprint for properties whose stored ids are archived. Fonteinhutte should read "never pushed", not blank.
5. **Inventory & Channels gauge** counts clone and non-trading properties.

## Work

### 1. Reconcile classification (edge function)
- Classify every listing once, by channel state first: `live-matched`, `live-orphan`, `live-duplicate`, `archived-matched` (new: local id points at an archived listing), `archived-orphan`.
- Counts derived from those buckets only, plus a total that must equal the account's listing count; show the account total in the footer so any mismatch is visible.
- Local index keyed `kind:record_id` with a listing-id → records lookup, so one listing id claimed by several records is reported as a **conflicting local id** row.
- Duplicate grouping stays name-based but only within live listings, and marks which copy our records point at.

### 2. Monitor + reconciliation UI
- New sections: "Local ids pointing at archived listings" (with a **Re-point to the live listing** action) and "Conflicting local ids" (with a **Clear the wrong id** action) — both reusing the existing per-row verify → act → verify flow.
- Billable count reads only listings confirmed live upstream at the last reconcile; stale/archived-linked properties are flagged, not counted.
- Property rows show **Never pushed** when push is on and no listing id exists (Fonteinhutte).
- Inventory & Channels gauge excludes non-trading, sandbox and clone properties.

### 3. Data repair (after the UI can show it honestly)
- Clear the bogus property-level id 5655615 from Dassiesingel and Seesig.
- Re-point Seesig's 8 units and Tidal's 4 units to the current live listing per unit name; keep the newest live copy of each.
- Archive the surplus live duplicates upstream through the existing purge flow (verify → archive → verify), then clear their local ids.
- Deactivate the four "(Copy)" clone properties so they leave every channel and billing count.

## Technical notes

- `supabase/functions/channel-manager-entitlement/index.ts` — `reconcile` branch: bucket rewrite, kind-keyed local index, new `archived_matched` and `conflicts` arrays; `purge_listing` and `clear_local_listing` unchanged; a new `repoint_local_listing` action writes a verified live id onto a property or unit record.
- `src/hooks/useChannelReconciliation.ts` — new result fields and `repointListing` / `clearConflict` actions.
- `src/pages/AdminChannelMonitor.tsx` + `src/components/admin/channel/*` — new sections, footer total, "Never pushed" state.
- `src/hooks/useChannelCostMonitor.ts` — billable count sourced from verified-live listings; clone/non-trading exclusion for the gauge.
- Data repair runs as explicit actions from the monitor, not as a blind migration, so every change is verified against the channel first.
