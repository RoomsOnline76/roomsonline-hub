# Manual / Auto key provisioning toggle for Step A.2

Add a **[Manual | Auto]** toggle to the "Onboard a Property" form in Channel Monitor. It decides how Step A.2 ("Capture & verify account credentials") gets the sub-account's AccessKey/SecretKey pair.

- **Manual (default, today's behaviour):** after the sub-account is created, Step A pauses and asks the operator to paste the key pair created in the channel portal, then verifies it.
- **Auto:** immediately after the sub-account is created, the backend authenticates *as the new sub-account* (its login + the password we just set) and mints the pair with `Push_CreateApiKey_RQ`, stores it (the secret is returned only once), and Step A.2 clears without operator input.

Nothing else about Step A changes: A.1 create/adopt, A.2 credentials, A.3 company profile, A.4 pull listings stays one linear pass with one channel call per leg. Master credentials remain user-management only.

## What the operator sees

- A small segmented toggle next to the property picker / Connect button, remembered per operator.
- On **Auto**, the A.2 row reports `Key pair minted and stored for OwnerID … · AccessKey ABC123…`.
- If the automatic mint is refused or rate-limited, A.2 does **not** pretend to pass: it falls back to the manual capture prompt with the channel's own reason (e.g. key creation not enabled, `-4` login refused, or a rate window countdown). The operator can paste keys and continue in the same run.
- On **Manual**, behaviour is exactly as now.

## Technical notes

1. **UI** — `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`: add `keyMode` state (`"manual" | "auto"`, persisted in `localStorage`), render the toggle in the onboarding header row, and pass it into `runOnboardStep(...)` alongside `confirmedOwnerEmail`.
2. **Orchestrator** — `src/lib/channelOnboardOrchestrator.ts`: add `keyMode` to the run options / `RunContext`; forward as `key_mode` on the `ensure_owner_account` portal call. Extend the A.2 runner so `key_source === "minted"` passes (already supported) and a mint failure under auto mode surfaces the channel reason while still routing to the manual capture prompt.
3. **Backend** — `supabase/functions/ru-cert-portal/index.ts` `ensure_owner_account` (both the freshly-created and existing-binding branches): when `key_mode === "auto"` and no pair is stored for the OwnerID, call the existing `mintChildKeyPair` helper with the child login and the password from this run (or the retained encrypted password for an existing account), then set `key_source: "minted"`, `keys_minted: true`, `auth_mode: "child_keys"`, and return the AccessKey plus the ordered attempt trail. When `key_mode` is absent or `"manual"`, keep returning `RU_MANUAL_KEYS_REQUIRED` as today.
4. `Push_CreateApiKey_RQ` already exists end-to-end (`_shared/ruApiKeyXml.ts` → `rentalsunited-api` action `create_child_api_key`, Label + `Scope XmlApi`, no OwnerID element, secret encrypted into `ru_api_credentials` on return). No new endpoint work — auto mode just re-enables that path behind the toggle. One request per envelope; a rate window is reported as a wait, never retried in-loop.
5. **Step A copy** — `src/config/channelOnboard.ts` A.2 description becomes mode-aware ("minted automatically" vs "pasted from the portal").

## Verification

Run Step A for **Pufferfish** with the toggle on **Auto** and account email `rutest@polka.co.za`: confirm one `Push_CreateUser_RQ`, one `Push_CreateApiKey_RQ` authenticated as the sub-account, the pair stored (AccessKey last 4 + `verified_at`), A.2 cleared with no manual prompt, then A.3 company profile and A.4 listing pull succeeding under the child keys. Isolate the wire log to confirm no duplicate or master-authenticated calls.
