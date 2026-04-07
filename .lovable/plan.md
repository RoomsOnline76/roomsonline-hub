

# Phase 4: Route `useAuth` Database Calls Through Edge Function

## Current State

- **`SearchContext.tsx`** — contains **no database calls at all**. It is pure React state (useState/useCallback). No changes needed.
- **`useAuth.tsx`** — contains **3 direct Supabase queries**:
  1. `user_roles` table — fetch roles for current user
  2. `profiles` table — fetch profile for current user
  3. `sales_reps` table — fetch sales rep ID if user has that role

There is no existing `data-access-api` edge function. One needs to be created.

## Plan

### Step 1: Create `supabase/functions/data-access-api/index.ts`

A new edge function that handles authenticated data-access requests. Initial action:

- **`get_user_context`** — accepts the user's JWT (via Authorization header), extracts `user_id` from claims, then queries `user_roles`, `profiles`, and conditionally `sales_reps` server-side. Returns a single JSON payload:

```json
{
  "success": true,
  "data": {
    "profile": { "id": "...", "email": "...", "full_name": "...", "avatar_url": "...", "role": "..." },
    "roles": ["admin", "dev"],
    "sales_rep_id": "uuid-or-null"
  }
}
```

This replaces three round-trips with one. JWT validation via `getClaims()` ensures only the authenticated user's own data is returned — no user_id is accepted from the client.

### Step 2: Update `src/hooks/useAuth.tsx`

Replace `checkRolesAndProfile()` (lines 29–74) — remove the three `supabase.from(...)` calls and replace with:

```typescript
const { data, error } = await supabase.functions.invoke("data-access-api", {
  body: { action: "get_user_context" },
});
```

Then unpack `data.data.roles`, `data.data.profile`, and `data.data.sales_rep_id` into the existing state setters. The rest of the hook (auth listener, signOut) stays unchanged.

### Step 3: Add config entry

Add `[functions.data-access-api]` to `supabase/config.toml`. This function **requires** JWT — it will validate via `getClaims()` in code.

## Files changed

| File | Change |
|---|---|
| `supabase/functions/data-access-api/index.ts` | **New** — `get_user_context` action |
| `src/hooks/useAuth.tsx` | Replace 3 direct DB calls with single edge function invoke |
| `supabase/config.toml` | Add function entry |

## What does NOT change
- `SearchContext.tsx` — no DB calls to remove
- Auth listener / `onAuthStateChange` / `getSession` — stays client-side (Supabase Auth SDK)
- `signOut()` — stays client-side
- No database migrations
- No user-facing behavior changes

## Benefits
- Removes all direct table queries from `useAuth` (3 → 0)
- Reduces client-server round-trips from 3 sequential calls to 1
- Role resolution logic moves server-side, reducing attack surface
- Establishes `data-access-api` as the centralized data layer for future hook migrations

