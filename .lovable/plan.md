

# Test RU Health Connection and Activate in System Health

## Current State

- Rentals United is already registered in `system_health_components` but with `is_active = false`
- The `system-health-check` edge function already has `rentalsunited` in its `PMS_ADAPTERS` map
- The `rentalsunited-api` health_check action works (checks API key/secret, calls ListProperties)
- **Bug**: Line 534 still references `creds.username || !creds.password` (stale from pre-PAI migration) — this will block all non-health-check actions

## Plan

### 1. Fix stale credential check in edge function

In `supabase/functions/rentalsunited-api/index.ts` line 534, replace:
```typescript
if (!creds || !creds.username || !creds.password) {
```
with:
```typescript
if (!creds || !creds.api_key || !creds.api_secret) {
```

### 2. Activate RU in system health components (migration)

```sql
UPDATE system_health_components
SET is_active = true, is_critical = false
WHERE component_key = 'rentalsunited';
```

This makes it appear in the active health monitoring dashboard and get checked during automated health runs.

### 3. Deploy and test

- Redeploy `rentalsunited-api` edge function
- Call health_check via curl to verify API connectivity with stored secrets
- Run system-wide health check to confirm RU appears in results

## Files

| File | Change |
|---|---|
| `supabase/functions/rentalsunited-api/index.ts` | Fix stale `username/password` guard to `api_key/api_secret` |
| Database migration | Set `is_active = true` for `rentalsunited` in `system_health_components` |

