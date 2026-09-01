# Rate plan deck: stacked cards, tabs, and inline rate comparison

Turn the per-property list of rate plan cards into a single "deck of cards" surface: one card in front, the others peeking behind it, and a row of named tabs to bring any plan forward. Tabs can also be multi-selected, in which case the rate matrix grows extra rows per unit — one row per selected plan — so rates can be compared side by side on the same nights.

## Behaviour

1. **Deck** — Each property section shows one stack instead of a vertical list. The front card is the active plan; plans behind it are visible as slightly offset, scaled-down, dimmed card edges (like a fanned hand of cards). Deck depth caps at 3 visible ghost layers regardless of plan count.
2. **Tabs** — Above the deck, one tab per plan showing the plan name (plus its inactive/primary badges as small dots). Clicking a tab brings that plan to the front.
3. **Compare** — Ctrl/Cmd-click, or a small "Compare" toggle on each tab, adds a plan to the comparison set. With 2+ plans selected the front card switches to comparison mode:
   - The card header shows the compared plan names as chips (each removable).
   - The matrix renders, for every linked unit, one sub-row per selected plan, grouped under the unit name with the plan name in a second label column. Unit name spans its plan rows.
   - Season columns are the union of the compared plans' season names; nightly columns stay a single shared window so cells line up.
   - Cheapest cell per unit/night is highlighted subtly so differences read at a glance.
4. **Single plan** — With exactly one plan selected, the card and matrix look and behave exactly as they do today.
5. **Read-only mode** — Same deck, tabs, and comparison; no editing entry points, unchanged from current read-only rules.

## Technical notes

- `src/components/pms/rateplans/RatePlanRateMatrix.tsx`: change the props from a single `ratePlanId` to a `plans: { id: string; name: string }[]` series (single-element array preserves today's rendering). Fetch `preview_plan` once per plan id in parallel for the same window, keyed results in a `Map<planId, Map<unitId, Map<date, Day>>>`. Season rate rows come in as today but filtered per plan. Row rendering becomes unit → plan sub-rows, with `rowSpan` on the unit label when more than one plan is compared. No new edge function action; `preview_plan` is reused as-is.
- New `src/components/pms/rateplans/RatePlanDeck.tsx`: owns `activePlanId` and `comparePlanIds` state, renders the tab strip, the stacked ghost layers (absolute positioned, `translate-y`/`scale`/`opacity`, `pointer-events-none`), and the front card via a render-prop so `RatePlansSurface.renderPlanCard` stays the single source of card markup.
- `src/components/pms/rateplans/RatePlansSurface.tsx`: replace the `grid grid-cols-1` plan list per section with `<RatePlanDeck plans={section.plans} …>`; extend `renderPlanCard` to accept the comparison set so it can pass the plan series and the compared season rows into the matrix. Card click-to-edit still opens only the front plan; tabs and compare controls stop propagation.
- Season colour map, holiday tints, base-rate fallbacks, the 30-night window, and the date-navigation controls are unchanged and shared across compared rows.
- Presentation only: no schema change, no edge function change, no pricing math change, and no change to what any plan sells.
