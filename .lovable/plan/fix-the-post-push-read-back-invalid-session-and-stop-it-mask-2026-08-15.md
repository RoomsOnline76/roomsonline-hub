# Fix the post-push read-back ("Invalid session") and stop it masking a good push

## What is happening

Confirmed from the code and the data for Dassiesingel Self-catering Units:

- The push itself is fine. The last two runs pushed 3 units + 1 unit chunk, both recorded as successful, and all four units hold channel listing IDs (Bosbok 5806989, Steenbok 5807016, Dassie 5807017, Grysbok 5807024).
- The automatic read-back that runs straight after the push calls the channel console function with the backend service key as its bearer token. That function only accepts a signed-in user session, so it answers `401 Invalid session` every time. That is exactly the message in the toast — it is an internal auth mismatch, not a channel problem.
- The same read-back invoked from the browser (with your session) succeeds: the property was stamped verified 4 of 4 units at 21:39:56, one minute after the push.
- So the toast says "Read-back did not confirm the listings", the wizard falls back to "use Fetch Channel Manager IDs", and a successful publish reads like a failure.

## What will change

1. **Make the automatic read-back actually run.** The push will pass the caller's own session through to the console function instead of the service key, and the console function will additionally accept a trusted internal service call for the listing-resolve action only (so cron and background pushes, which have no user session, can verify too).

2. **A failed read-back never rewrites the push verdict.** When the push succeeded but the read-back could not answer, the result is reported as "Published N unit(s) — confirming listings…" with a pending state, and the manual "Fetch Channel Manager IDs" button only appears once an automatic retry has also failed. The push success line stays intact.

3. **One paced automatic retry** on the read-back (channel rate-limit windows are the other reason it comes back empty), then a quiet pending state rather than an error toast.

4. **Portal visibility check.** Because you also report the listings not being visible in the channel portal, the same run will record, per unit, which sub-account owns the listing and the status the channel reports for it (active / archived / not found). That evidence is surfaced in the wizard's distribution panel so a listing that exists but sits archived or under a different sub-account login is named explicitly instead of showing as "pushed but missing".

## Technical detail

- `supabase/functions/push-property-to-ru/index.ts`: `verifyListingsAfterPush` currently invokes `ru-cert-portal` with the service-role client. It will take the incoming `Authorization` header (when present) for the nested invoke, and otherwise send an internal service marker.
- `supabase/functions/ru-cert-portal/index.ts`: the auth block returns `UNAUTHORIZED / Invalid session` when `auth.getUser()` finds no user. Add a narrow bypass: a request carrying the service-role bearer plus `action === 'resolve_ru_property_ids'` is treated as an internal system call (role checks skipped, everything else unchanged).
- Read-back result shape gains `pending: true` (distinct from `verified: false` + `error`) plus a per-unit `listing_status` array from the resolve response.
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx` and `src/components/property/PushToRentalsUnited.tsx`: render pending vs failed read-back differently; hide the manual fetch button while pending.
- No database migration is required.

## Verification

- Re-push Dassiesingel and confirm the toast now reads published + confirmed, with `ru_listings_verified_at` stamped by the push itself (no manual fetch).
- Confirm the console function's log shows the resolve call succeeding under the internal path (no `Invalid session`).
- Read the per-unit listing status for the four units and report which sub-account and status the channel holds them under.
