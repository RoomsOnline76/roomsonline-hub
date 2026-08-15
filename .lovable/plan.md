# Reorder the distribution-layer steps

The distribution half of the Channels wizard currently runs: push owner → keys → push property + ARI → location & currency → sub-account verification → enable Channel Manager. Verification therefore happens after the property is already published, and existing listings under the sub-account are never pulled before pushing.

## New order (steps 6–12)

```text
6.  Push owner: create the distribution sub-user
7.  Create key & secret for the sub-account
8.  Sub-account verification            (human check on the live sub-account)
9.  Pull listings (if any)              (NEW - adopt existing listing ids)
10. Push property & full ARI publish
11. Location & currency verification
12. Enable Channel Manager
13. Connect channels
```

## What changes

1. **Reorder the macros** so verification and the listing pull come before the push, and renumber the steps.
2. **New step: Pull listings (if any).** Lists the properties already present under the newly keyed sub-account and adopts any match onto this property/unit as its listing id, so the later push updates an existing listing instead of creating a duplicate. When the sub-account is empty, the step passes as "nothing to adopt" and the wizard moves on.
3. **Rework the sub-account verification checklist.** It runs before publish now, so the items that assume a live listing (property present, calendar currency, content-quality warnings) are replaced with pre-push items: sub-account login works, owner details correct, company details correct, currency/locale on the account correct, and no unexpected pre-existing listings.
4. **Update the prerequisite rules** so each step points at the right predecessor: verification and pull listings need the stored key & secret; push needs verification done plus complete Ready-to-sell content; currency verification needs a published listing; Channel Manager and Connect channels keep their existing prerequisites with corrected step numbers in the messages.

## Technical notes

- `src/config/rolosOnboardingMacros.ts` — reorder macro entries, add a `pull_listings` macro (`action: "pull_listings"`, admin-only, state key for adopted/none), rewrite `ROLOS_SIGNOFF_CHECKLIST` for pre-push items.
- `src/hooks/useRolosOnboardingProgress.ts` — new state check for the listing pull, and updated `actionBlockedReason` switch (step numbers and dependencies).
- `src/config/channelOnboardingStages.ts` — update `macroKeys` order for the distribution stage to include `pull_listings`.
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx` — action button + busy state for the pull, keep the dark border on the (now earlier) verification card.
- Backend: reuse the existing `ru-cert-portal` listing discovery (`Pull_ListProp_RQ` / `resolve_ru_property_ids`, `list_ru_candidates`) for the pull action; no new RU method and no schema change beyond recording the pull outcome on the roadmap row.
