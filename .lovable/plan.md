# Fix: the wizard is pulling and authenticating against the wrong distribution account

## What I verified

- Dassiesingel's portfolio account is correct on paper: OwnerID **741761**, login **rooms@roomsonline.co.za**, company details sent.
- But the stored API key pair for 741761 is **the same AccessKey as OwnerID 741765 (connect@roomsonline.co.za)** — identical key tail `…6398NS`, same label `connect`. So every sub-account-scoped call for Dassiesingel authenticates as a *different* account, which is why "Pull listings" reports the sub-account as empty and why the whole step feels like it ran against the wrong login.
- Root cause of the bad save: `save_api_keys` validates a pair only by asking Rentals United "is this pair valid?" (`verify_child_login`). It never checks the pair belongs to the OwnerID it is being stored against, so one sub-user's keys can be saved onto another sub-user's row.
- Secondary cause: `list_properties` (the listing pull) is child-scoped but **not** in the strict set, so when no usable sub-account key exists it silently falls back to the master/RoomsOnline credentials instead of failing — a pull that reads the master account looks like "sub-account was empty".
- The `dev@roomsonline.co.za · 2026/08/15` lines under the tick boxes and under "Pulled …" are the operator who clicked, not the login used — but nothing on the card states which account the pull actually ran as, so it reads as "it pulled against dev".

## What gets built

### 1. Keys can only be stored against the account they belong to

`save_api_keys` gains an ownership check after the validity check: authenticate with the supplied pair and confirm it resolves to the target OwnerID (list the authenticating account's own users/properties under those keys and match the OwnerID). A pair that belongs to another sub-account is rejected with a clear message naming the account it really belongs to — it is never written.

### 2. Repair the bad row

Clear the mis-saved key pair for OwnerID 741761 (and any other row sharing an AccessKey with a different OwnerID), so the panel shows "API keys required" for rooms@roomsonline.co.za instead of silently using connect@'s keys. The operator then pastes the pair generated while signed in as rooms@roomsonline.co.za.

### 3. No master fallback for the listing pull

Add `list_properties` to the strict child-auth set. With an OwnerID supplied and no usable sub-account keys, the call returns the existing `RU_CHILD_AUTH_REQUIRED` error instead of reading the master account. `resolve_ru_property_ids` surfaces that reason verbatim so the wizard says "keys required for rooms@roomsonline.co.za", never "empty".

### 4. Make the account in use visible on both cards

- **Pull listings**: the result line names the account the pull authenticated as (`Pulled as rooms@roomsonline.co.za · OwnerID 741761`), with the operator shown separately as "checked by".
- **Sub-account verification**: keep the sub-account login in the header and relabel the per-tick line as "confirmed by" so the operator email can't be mistaken for the login.
- The pull records the authenticated account (login + OwnerID + auth mode) alongside the existing matched/unmatched counts.

### 5. Guard against a repeat

A duplicate-AccessKey check runs whenever keys are saved or listed, and the RU accounts panel flags any two accounts sharing a key pair so a cross-saved pair is obvious immediately.

## Technical notes

- Edits: `supabase/functions/ru-cert-portal/index.ts` (`save_api_keys` ownership check, `resolve_ru_property_ids` error pass-through and authenticated-account echo), `supabase/functions/rentalsunited-api/index.ts` (`list_properties` into `CHILD_AUTH_STRICT_ACTIONS`; add an ownership probe action used by the check), `src/hooks/useRolosOnboardingProgress.ts` (persist the authenticated account on the listing-pull record), `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx` (card copy).
- `rentalsunited-api` child-auth builders are adapter-locked; this touches the strict-action list and adds a read-only ownership probe. Approving this plan is the explicit approval for that region.
- The bad key row is cleared by a data migration; no schema change. Secrets stay server-side — only the AccessKey tail is ever shown.
- After deploy: run "Pull listings" for Dassiesingel and confirm it either names rooms@roomsonline.co.za or asks for that account's keys, then re-verify with the correct pair.
