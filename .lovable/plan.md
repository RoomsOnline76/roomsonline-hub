# Step A key minting: fix the password-auth false failure

The current failure is more specific than the earlier generic password prompt:

```text
RU_CREATE_KEY_FAILED: Incorrect login or password
```

I checked the active code path. The "Save password & mint key pair" action stores the password, then calls the key-mint helper, which calls the backend channel API with `auth_username` + `auth_password`. That backend builds a `Push_CreateApiKey_RQ` request using `<UserName>` + `<Password>`. So the password can be valid for the web portal while the XML key-creation endpoint still rejects that authentication mode or expects a different credential form.

This plan fixes the root issue and still adds the proper Step A recovery UI.

## 1. Prove the failing branch before changing it

- Read the latest `ru-cert-portal` and `rentalsunited-api` logs for the failed key creation.
- Confirm which account/login was used, the auth mode reported by the function, and the RU status payload.
- Confirm whether `verify_child_login` succeeds with the same captured password while `create_child_api_key` fails, because that distinguishes "bad password" from "wrong key-mint auth path".

## 2. Stop treating `RU_CREATE_KEY_FAILED` as simply "wrong password"

The UI should no longer say or imply the saved password is wrong when the portal login works.

For `RU_CREATE_KEY_FAILED` with `Incorrect login or password`, Step A will show:

- The sub-account login and OwnerID being used.
- A note that the password was saved, but the channel refused the API key-creation request.
- Two recovery choices:
  1. Re-enter or replace the password and retry verification.
  2. Paste an AccessKey/SecretKey pair generated in the channel portal for that exact sub-account.

If password verification passes but key creation still fails, the dialog keeps the API-key paste form open instead of looping the password prompt.

## 3. Split password verification from key minting

The "Save password & mint key pair" button currently behaves as one action. It should become a two-stage flow:

1. **Save & verify password**
   - Store the password.
   - Run `verify_child_login`.
   - Show a clear success/failure result.

2. **Mint key pair**
   - If the channel accepts key creation from password auth, mint and store the pair.
   - If the channel refuses key creation, fall through to "Paste API keys" without marking Step A as failed.

This prevents a valid password from being overwritten or blamed for a separate key-minting refusal.

## 4. Add a known-failure remedy registry for Step A

Step A failures become guided prompts instead of red terminal rows.

| Code | Remedy |
| --- | --- |
| `RU_CREATE_KEY_FAILED` | Verify saved password, then retry minting or paste portal-generated AccessKey/SecretKey. |
| `RU_CHILD_LOGIN_REJECTED` | Ask for the corrected/reset portal password for this login. |
| `NO_CHILD_CREDENTIALS`, `NO_STORED_PASSWORD` | Ask for the portal password or offer a fresh-login path. |
| `RU_CHILD_KEYS_REJECTED` | Ask for a valid pair minted under this login. |
| `RU_CHILD_KEYS_WRONG_ACCOUNT`, `RU_CHILD_KEYS_DUPLICATE` | Explain that the pair belongs to another account and require a pair for this OwnerID/login. |
| `RU_EMAIL_IN_USE` | Keep the existing alternative-login picker and fresh-login field. |
| `RU_OWNER_NOT_FOUND` | Offer re-bind or fresh-login creation; do not keep trying to bind an unlisted account. |
| `RU_RATE_DEFERRED` | Keep the amber countdown and auto-resume; never open a failure prompt. |

Unknown failures still show the exact code and channel message with a retry action, never only the generic non-2xx text.

## 5. Technical changes

- `rentalsunited-api`: include `auth_mode` and the channel `ru_status_id`/message in `create_child_api_key` error responses.
- `ru-cert-portal`: preserve `RU_CREATE_KEY_FAILED` details from the key-mint helper and return them to the client; do not collapse them into a generic invoke error.
- `StepAccountDialog`: replace the single "Save password & mint key pair" path with the two-stage password verification + key mint result state, then expose manual AccessKey/SecretKey capture when minting is refused.
- `ChannelOnboardTab` and the Step A orchestrator: classify `RU_CREATE_KEY_FAILED` as a recoverable blocked state, not a hard failure, and re-open the fix dialog with the correct account context.
- No database schema change is required.

## Verification

- Reproduce the current failure against the affected Step A account.
- Verify the password save path reports "password verified" separately from key creation.
- Verify a key-mint refusal opens the API-key capture form and does not blank-screen.
- Save a valid AccessKey/SecretKey pair and confirm Step A continues to company/profile work.
- Confirm `RU_RATE_DEFERRED` still displays waiting/countdown and auto-resumes.
