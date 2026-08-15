# Fonteinhutte — Phase 2 bed coverage blocker

## What's actually wrong

Phase 2 blocks on one unit only:

- **Karel Grootoog** — takes **6** guests, but the channel counts only **5** sleeping places.

Its authored beds are: 1 double (bedroom 1), 2 singles (bedroom 2), 1 sofa bed (living area).

The discrepancy is a **capacity-table mismatch**, confirmed in code:

- ROL'OS front end (`src/lib/bedConfig.ts`) counts a `sofa-bed` as sleeping **2**, so the wizard totals 2+2+2 = 6 and reports the unit fully covered.
- The channel push (`push-property-to-ru/index.ts`) maps `sofa-bed` to RU amenity 237 (sofa bed), which sleeps **1**; a double sofa bed / sleeper couch is a different RU bed (200) worth 2.

So a single sofa bed silently loses one sleeping place at the channel boundary — the wizard passes and Phase 2 fails. Blaasoppie shows the same 1-person loss (5 beds vs 5 guests) but happens not to breach its own max.

## Fix

1. **Align the front-end bed table to channel semantics** (single source of truth): `sofa-bed` sleeps 1; add a distinct **Double sofa bed / sleeper couch** option that sleeps 2 and maps to RU 200. Legacy `sofa`/`couch` labels keep mapping to the 1-person sofa bed.
2. **Make the wizard tell the truth up front**: the Rooms/bed-configuration coverage line and the onboarding readiness check use the same capacity table, so a shortfall appears in Step "Rooms & beds" instead of only in Phase 2. Keep the existing inline "set max guests to capacity" shortcut next to the shortfall.
3. **Resolve Karel Grootoog** — one of two data choices (no code difference):
   - the living-area bed is a **sleeper couch** → change its type to Double sofa bed → beds sleep 6, matches max guests; or
   - it genuinely sleeps 1 → set max guests to **5**.
4. Re-run the readiness check for Fonteinhutte so the stored verdict refreshes, then continue the push.

## Technical notes

- Files touched: `src/lib/bedConfig.ts` (capacity + option list), the bed-type mapping in `supabase/functions/push-property-to-ru/index.ts` (add the double-sofa label), and the coverage display in `src/components/property/ContentRuleHint.tsx` / `RoomManagerTab.tsx` if a label change is needed.
- No migration required; `hostfully_room_types.bed_configuration` already stores typed entries.
- Readiness thresholds in `_shared/ruReadiness.ts` stay unchanged — certification still requires beds to equal max guests.

## Question for you

Is Karel Grootoog's living-area bed a **sleeper couch for two**, or a single sofa bed (making the unit a 5-sleeper)? I'll apply the matching data fix with the code change.
