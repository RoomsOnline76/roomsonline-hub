

# Access Requests: Hide Declined, Truncated Messages, Origin Tracking

## Three Changes

### 1. Hide declined requests by default
Add a status filter toggle (defaulting to show only Pending + Approved). A "Show Declined" toggle or filter dropdown reveals them when needed.

### 2. Truncate messages with hover/click reveal
Replace the full message column with a truncated preview (first ~60 chars). Use a `HoverCard` or `Tooltip` to show the full message on hover. Clicking the row or a "View" icon opens a small dialog with full details.

### 3. Capture request origin metadata
**Database migration** — add columns to `access_requests`:
- `source_ip` (text, nullable) — client IP from `x-forwarded-for`
- `user_agent` (text, nullable) — browser user agent string
- `referrer_url` (text, nullable) — HTTP Referer header (where they came from)
- `source_page` (text, nullable) — which page/portal submitted the request (e.g. `/auth`, `/connect`)

**Edge function update** (`send-access-request/index.ts`):
- Extract `user-agent` and `referer` headers from the request
- Accept optional `source_page` from the POST body
- Store all four fields on insert

**Frontend update** (`AdminAccessRequests.tsx`):
- Display origin info (IP, browser, referrer) in the message hover/detail view
- Show a small icon or badge indicating source (e.g. "Connect Portal" vs "Auth Page")

## Files

| Action | File |
|--------|------|
| Migration | Add `source_ip`, `user_agent`, `referrer_url`, `source_page` to `access_requests` |
| Modify | `supabase/functions/send-access-request/index.ts` — capture headers |
| Modify | `src/pages/AdminAccessRequests.tsx` — filter toggle, message truncation, origin display |

