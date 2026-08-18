# Fix key verification for OwnerID 742004 (ru-owner@roomsonline.co.za)

## What it is actually using (verified in code + logs)

The save never uses the portal password. When you press "Verify & store", `save_api_keys` runs two
probes against the channel:

1. `verify_child_login` → `Pull_ListBuildings_RQ` with **only** the pasted
   `<AccessKey>`/`<SecretKey>` in the envelope (no UserName/Password anywhere).
2. `verify_child_key_owner` → `Pull_ListProp` for OwnerID 742004 + `Pull_ListMyUsers_RQ`.

The channel answered step 1 with its generic auth rejection, whose text is literally
"Incorrect login or password" — that message is the channel's wording for "this key pair was not
accepted on this method", not proof that a login/password was sent. The function logs also show the
same `Pull_ListBuildings_RQ` being replayed and coming back rate-limited
("called with the same parameters less than a minute ago — retry in 53s"), so repeat attempts can be
rejected for rate-limit reasons and still surface as the same rejection text.

So two real problems: the probe method is the wrong one for a sub-user key pair (account-level
buildings read, no OwnerID scope, and it is the most rate-limited call we make), and every failure
mode collapses into one misleading message.

## What gets changed

### 1. One correct probe instead of two

Validity and ownership become a single OwnerID-scoped read for the account being captured
(`Pull_ListProp` for OwnerID 742004, authenticated with the pasted pair), with the API-key listing
read as the secondary identity check. `Pull_ListBuildings_RQ` is dropped from the verification path,
which also removes the duplicate-parameter rate-limit trap of calling it twice in a row.

### 2. Truthful failure reporting

The response distinguishes, and the toast says which:

- rejected — the channel refused the pair (keys wrong, wrong scope, or generated under a different
  sub-user)
- deferred — rate limited, retry in N seconds, nothing stored, nothing condemned
- wrong account — pair is valid but authenticates as another sub-user (names it)

Each carries the method used, the channel status id and the account it authenticated as, so the
cause is readable instead of guessed.

### 3. Distinguish "keys bad" from "account bad"

If the key pair is rejected, one confirmatory check runs with the sub-user's stored portal login for
742004 (the operator password set at creation). If that succeeds, the message says the account is
fine and only the key pair needs regenerating; if it also fails, it says the sub-user login itself is
not usable yet. Nothing is stored on either path.

### 4. Scope the capture dialog to one sub-account

Opening key capture for `ru-owner@roomsonline.co.za` shows only that account: the login and OwnerID
742004 as fixed read-only context, no picker listing 741761 or any other sub-user, so the wrong row
can't be selected and the panel stops implying a choice.

## Technical notes

- `supabase/functions/rentalsunited-api/index.ts`: `verify_child_login` accepts `owner_id` and
  probes the owner-scoped listing read; `verify_child_key_owner` reuses that result rather than
  re-reading. Rate-limit/deferral answers are passed through as `deferred`, not as rejection. This
  touches the child-auth region flagged as adapter-locked — approving this plan is the approval for
  that region.
- `supabase/functions/ru-cert-portal/index.ts`: `save_api_keys` collapses to the single probe, adds
  the portal-login confirmatory check, and returns `{ success:false, state:'rejected'|'deferred'|
  'wrong_account', method, ru_status_id, authenticated_as }` with HTTP 200 so the UI keeps showing a
  toast.
- `src/components/portfolio/PortfolioRuAccountsTab.tsx` and
  `src/components/property/PropertyRuOwnerPanel.tsx`: single-account capture context, per-state
  messaging, retry hint on deferral.
- No schema change; secrets stay server-side (only the key tail is ever displayed).
- Verification after deploy: save the pair for 742004 and confirm it either stores and verifies, or
  reports precisely which of the three states applies.
