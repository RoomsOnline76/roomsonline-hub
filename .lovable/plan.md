

# Add Property Column + Revoke Contract Feature

## Changes to `src/pages/AdminContracts.tsx`

### 1. Add "Property" column to the contracts table

After loading contracts, fetch linked properties for all owner emails in a single query:
```sql
SELECT owner_email, array_agg(DISTINCT name) as property_names 
FROM properties 
WHERE owner_email IN (...) AND permanently_deleted_at IS NULL 
GROUP BY owner_email
```

Store as a `Map<string, string[]>` and display in a new "Properties" column between "Owner" and "Status", showing property names as comma-separated text (or badges if multiple).

### 2. Add "Revoke" action for signed/overridden contracts

Currently, the dropdown menu hides "Override" for signed/overridden contracts and has no way to revoke them. Add a **"Revoke Contract"** menu item for `signed` and `overridden` contracts that:
- Opens a confirmation dialog asking for a reason
- Inserts a new `owner_contracts` row with `status: 'revoked'` and the next version number, storing the revoke reason in `override_reason` and the admin user ID in `override_by`
- This effectively "un-signs" the contract so a new one can be sent

### 3. Database migration

Add `'revoked'` as a valid contract status. Currently `status` is a plain `text` column with no CHECK constraint, so no migration is needed — just add UI support.

Add `"revoked"` to:
- `StatusFilter` type
- `STATUS_CONFIG` map (icon: `XCircle`, variant: `destructive`, label: "Revoked")
- Filter buttons
- Stats cards (new "Revoked" card)

### 4. Update search to include property names

Extend the `filteredContracts` search to also match against property names.

## Files changed

| File | Change |
|---|---|
| `src/pages/AdminContracts.tsx` | Add properties lookup, "Properties" column, "Revoke" action with confirmation dialog, revoked status support |

## What does NOT change
- No database migrations needed (`status` is text, not enum)
- No edge function changes
- `useOwnerContract.tsx` hook unchanged
- Contract signing flow unchanged

