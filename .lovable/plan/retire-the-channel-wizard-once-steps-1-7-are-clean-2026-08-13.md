# Retire the channel wizard once steps 1–7 are clean

## What you're seeing

Rentals United onboarding shows 4/4 phases complete, yet the floating card opened in full at "Step 8: Push…" (9/10 steps) instead of the quiet "Connect Channel" pill.

Confirmed cause (read from the code):

- The pill-only state requires **both** "no outstanding step 1–7" **and** `publishedOk`.
- `publishedOk` is the `listing_ids` state check: every active unit must carry a stored channel listing id.
- Tidal Pools has one unit (Elf) that was rejected on push ("Duplicate value in distances"), so it has no stored listing id. `listing_ids` is false, `publishedOk` is false, and the full wizard re-opens on every visit — even though property preparation (steps 1–7) is 100% clean and the push failure is already reported inline on the Publish to Channel Manager card.

## Change

1. Gate the quiet pill on property preparation only: steps 1–7 clean → show the "Connect Channel" pill, regardless of whether step 8's listing ids are all stored. Steps 8–10 stay administrative and never force the card open.
2. When the last push left units unpublished, the pill carries a small non-blocking marker (e.g. "1 unit not published") that expands the card on click — the error text itself stays on the Publish card where the retry lives.
3. Keep the existing full retirement rule: connected to a channel with every step green → nothing renders at all.
4. Keep the return behaviour: if any step 1–7 regresses, the gate signature changes, any stored "hide" is discarded and the full wizard comes back by itself.

## Technical detail

- `src/components/onboarding/rolos/RolosOnboardingWizard.tsx`: drop `publishedOk` from the pill condition (`blockingMacros.length === 0 && !pillOpened`), and pass the unpublished-unit count from the `listing_ids` check into the pill label.
- `src/hooks/useRolosOnboardingProgress.ts`: expose the unpublished-unit count alongside `publishedOk` (the detail string `x/y units published` already exists) so the pill can label itself without recomputing.
- No changes to readiness scoring, the push gate, the RU pipeline panel, or the auto-push delta pipeline.
