

# Exclude Revoked Contracts from Admin Contracts Page

## Intent

Revoked contracts exist to "clear the way" for re-issuing to a new owner. Once revoked, they should disappear from the main contracts list — they are historical artifacts, not actionable items.

## Changes to `src/pages/AdminContracts.tsx`

### 1. Filter out revoked contracts from the main list

In the `filteredContracts` memo (~line 210), after building `latestByOwner`, filter out any contract with `status === 'revoked'` before applying status/search filters. This removes them from the table entirely.

### 2. Remove "Revoked" from filter buttons and stats

- Remove `"revoked"` from the `StatusFilter` type and the filter button array (line 648)
- Remove the "Revoked" stats card (lines 626–633)
- Remove `revoked` count from the `stats` memo
- Keep `revoked` in `STATUS_CONFIG` so any historical references still render correctly if encountered

### 3. Keep the Revoke action

The "Revoke Contract" menu item and confirmation dialog stay — revoking still works, the contract just won't appear in the list afterward. A toast already confirms the action.

### 4. Adjust total count

The `stats.total` count will naturally exclude revoked contracts since they're filtered out before counting.

## Files changed

| File | Change |
|---|---|
| `src/pages/AdminContracts.tsx` | Filter revoked from list, remove revoked filter button and stats card |

## What does NOT change
- Revoke action and dialog remain functional
- No database changes
- `useOwnerContract.tsx` unchanged
- `ContractStatusBadge.tsx` unchanged (still supports rendering `revoked` if needed elsewhere)

