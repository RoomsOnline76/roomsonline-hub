# Policies tab: library first, arrival master listed in it

Two changes to Edit property → Policies.

## 1. Policy library moves to the top

Current order: Master policy → Arrival policy → Policy library → Specials and their terms → Portfolio library.

New order:

```text
Policy library            <- the full list of named policies, first thing you see
Master policy             <- which library policy is the property-wide fallback
Arrival policy            <- the arrival text editor + per-unit overrides
Specials and their terms
Portfolio library
```

Nothing about how the sections work changes — only their order on the page.

## 2. The master arrival policy appears in the library list

Today the library table only lists cancellation/prepayment policies, so the arrival policy — which is a real property-wide policy pushed to channels, guest confirmations and invoices — is invisible there.

The library table gets a pinned first row for it:

- Name: **Arrival policy** with a `Master` badge (it is always the property-wide arrival source).
- Terms column: character count and status — meets the channel minimum, below it, or not written yet.
- Applies to: "All units" plus, when units carry their own instructions, "N unit override(s)"; a unit with no text of its own inherits this one.
- Performance column: not applicable (arrival terms don't affect cancellation metrics) — shown as a dash.
- Row action: **Edit** scrolls to the Arrival policy section and focuses its editor. No delete or set-master actions — there is exactly one arrival policy per property.

The row is visually separated from the cancellation policies below it and is present even when the arrival text is still empty, so a missing arrival policy is obvious from the library alone. The empty state of the library ("No policies in the library yet") still shows for cancellation policies underneath the arrival row.

## Technical notes

- `src/components/property/PoliciesTab.tsx` — reorder the `FormSection` blocks; add an `id`/ref on the arrival section so the library row can scroll to it.
- Arrival state currently lives inside `ArrivalPolicyPanel.tsx` (reads `properties.amenities.house_rules.check_in_instructions` and unit `check_in_instructions`). Extract that read into a small `useArrivalPolicy(propertyId)` hook so both the panel and the library table render the same values, with the panel's save refreshing the hook. No schema or storage change.
- `PolicyLibraryTable.tsx` — new optional `arrival` prop (text, char count, override count, `onEdit`) rendered as a pinned row above the mapped policies; the existing empty-state branch only applies to the cancellation rows.
- Existing arrival policy behaviour (min 20 chars for the channel gate, 200-char editorial target, portfolio copy, TOBI drafting, override clearing) is untouched, and the wizard/readiness rules keep reading the same fields.
