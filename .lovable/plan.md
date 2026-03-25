

# API Versioning & Rate Limiting

## Current State

- **No versioning**: `roomsonline-pms-api` and `wordpress-plugin-api` have no version prefix — all requests go to a single unversioned endpoint
- **No rate limiting**: The PMS API has zero request throttling; only `send-access-request` has basic in-memory rate limiting
- **No request logging**: No `api_request_logs` table — impossible to track usage, quotas, or generate OpenAPI docs from live traffic
- **API key management exists** in `integration_configs` for the WordPress plugin API but not for PMS API consumers

## Architecture

```text
┌─────────────────────────────────┐
│  api_rate_limits                │ ← Per-property configurable quotas
│  property_id, requests_per_min, │
│  requests_per_hour, burst_limit │
└──────────┬──────────────────────┘
           │
┌──────────┴──────────────────────┐
│  api_request_log                │ ← Every API call logged
│  property_id, api_key_id,       │
│  action, version, status_code,  │
│  response_time_ms, ip, ts       │
└──────────┬──────────────────────┘
           │ sliding window check
┌──────────┴──────────────────────┐
│  Rate limiter middleware        │ ← In edge function, checks
│  (in roomsonline-pms-api)       │   api_rate_limits table
└─────────────────────────────────┘
```

## Changes

### 1. Database Migration

**`api_rate_limits`** — Per-property rate limit configuration
- `id`, `property_id` (unique, references properties), `requests_per_minute` (default 60), `requests_per_hour` (default 1000), `daily_limit` (default 10000), `burst_limit` (default 20), `is_active` (default true), timestamps
- RLS: admin/dev/fearless_leader can write; property owners can read their own

**`api_request_log`** — Request audit trail
- `id`, `property_id`, `api_key_id` (nullable), `api_version` (text, e.g. 'v1'), `action`, `status_code`, `response_time_ms`, `ip_address`, `user_agent`, `request_body_size`, `error_code`, `created_at`
- Partitioned or indexed by `created_at` for performance
- RLS: admin/dev read all; owners read own property

**Extend `integration_configs`** — Add `api_version` column (text, default 'v1')

### 2. Rate Limiter Utility

Create a shared rate-limiting function used by the PMS API edge function:
- Sliding window counter using `api_request_log` table (count requests in last minute/hour)
- Returns `{ allowed: boolean, remaining: number, resetAt: string }`
- On rejection: returns 429 with `Retry-After` and `X-RateLimit-*` headers

### 3. Update `roomsonline-pms-api` Edge Function

- Add version extraction from request body (`version: "v1"` field, defaults to `v1`)
- Insert rate limit check before action dispatch
- Log every request to `api_request_log` (action, status, response time)
- Add standard rate limit headers to all responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Version-aware action routing (currently all v1; structure allows future v2 handlers)

### 4. Update `wordpress-plugin-api` Edge Function

- Same rate limit check + request logging
- Version header support

### 5. API Rate Limits Admin UI

Add a "Rate Limits" tab to the existing API Configurator page (`/admin/system/api-configurator`):
- Per-property rate limit configuration (requests/min, requests/hour, daily)
- Usage dashboard showing request counts per property (last 24h, 7d, 30d)
- Top consumers table

### 6. OpenAPI Spec Generation

Create a static OpenAPI 3.0 JSON spec file at `public/docs/rolos-api-v1.json`:
- Auto-derived from the existing Zod schemas in `roomsonline-pms-api`
- Served at `/docs/api` via a simple Swagger UI page
- Includes all 40+ actions with request/response schemas

### 7. API Usage Tab for Property Owners

Add a read-only "API Usage" card to the property integrations tab showing:
- Requests today / this month
- Current rate limit tier
- Recent errors

## Files

| Action | File | Purpose |
|--------|------|---------|
| Migration | SQL | `api_rate_limits`, `api_request_log` tables, extend `integration_configs` |
| Modify | `supabase/functions/roomsonline-pms-api/index.ts` | Add rate limiting, request logging, version routing |
| Modify | `supabase/functions/wordpress-plugin-api/index.ts` | Add rate limiting + logging |
| Create | `src/components/api-configurator/RateLimitsTab.tsx` | Rate limit config + usage dashboard |
| Modify | `src/pages/AdminApiConfigurator.tsx` | Add Rate Limits tab |
| Create | `public/docs/rolos-api-v1.json` | OpenAPI 3.0 specification |
| Create | `src/pages/ApiDocsViewer.tsx` | Swagger UI viewer page |
| Create | `src/components/integrations/ApiUsageCard.tsx` | Owner-facing usage stats |
| Modify | `src/components/integrations/ApiTab.tsx` | Add ApiUsageCard |
| Modify | `src/App.tsx` | Add `/docs/api` route |

