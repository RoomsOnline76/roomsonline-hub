# Step A: every failure asks for what it needs

Today Step A has exactly one guided recovery: an email already registered at the channel (`RU_EMAIL_IN_USE`) re-opens the preview modal with a login picker. Every other failure ends as a red task row plus a red toast — including a wrong portal password, which arrives as a bare non-2xx "Edge Function returned a non-2xx status code" with no way to correct it in place.

This makes each known Step A failure a **prompt with guidance and an inline remedy**, instead of a dead end.

## The remedy dialog

When a Step A task fails, the monitor opens a single "Fix and continue" dialog naming the account it was working on, what the channel said, and what to do. The dialog carries the remedy the failure actually needs, and on success re-runs Step A from the failed task — no page change, no visit to another tab.

Failures covered, with the remedy each one prompts for:

| What went wrong | What the operator is shown and asked for |
| --- | --- |
| Password rejected by the channel (`RU_CHILD_LOGIN_REJECTED`) | "The channel refused this sub-account's login." Password field, plus a note that the password may be reset in the channel portal for this login and re-entered here. Saving verifies it before storing and then mints the key pair. |
| No credential held (`NO_CHILD_CREDENTIALS`, `NO_STORED_PASSWORD`) | Same password field, worded as first-time capture; alternative: create the account under a fresh login. |
| Key pair refused (`RU_CHILD_KEYS_REJECTED`) | Choice: re-mint from the stored password, or paste an AccessKey/SecretKey pair generated in the portal for this login. |
| Key pair belongs elsewhere (`RU_CHILD_KEYS_WRONG_ACCOUNT`, `RU_CHILD_KEYS_DUPLICATE`) | Names the account the pair actually belongs to and asks for a pair minted while signed in as *this* login. One pair may never serve two accounts. |
| Login already registered (`RU_EMAIL_IN_USE`) | Existing candidate picker and free-text new login (unchanged behaviour, moved under the same dialog). |
| Missing owner details (`RU_IDENTITY_INCOMPLETE`, `NO_OWNER_EMAIL`, `RU_OWNER_NOT_BOUND`) | Names the missing field (owner email, contact name, country) and links to the record that owns it, with binding controls inline. |
| Account not under our master account (`RU_OWNER_NOT_FOUND`) | Explains the stored identity is not listed under our master account; offers re-bind, or create under a fresh login. |
| Account retired (`RU_ACCOUNT_RETIRED`) | Stated plainly; only remedy offered is a fresh login. |
| Company profile refused (`RU_COMPANY_DETAILS_FAILED`) | Lists the fields the channel rejected and offers retry once corrected. |
| Rate limited (`RU_RATE_DEFERRED`) | No dialog — keeps today's amber "waiting, retry in Ns" countdown and auto-resume. Never red, never a prompt. |

Anything not in this list still fails visibly, but now with the account identity, the code and the channel's own message quoted, and a "Retry Step A" action — never a bare non-2xx string.

## Guidance notes

Each remedy carries one or two short sentences of why, in operator language and without vendor naming beyond the existing channel vocabulary: why a sub-account needs its own credential, why one key pair cannot serve two accounts, why the first pair for an adopted account must be generated in the portal. The dialog also always shows the login, OwnerID and scope it is acting on, so the wrong account is never fixed by accident.

## Technical notes

- New `src/config/channelStepARemedies.ts`: a registry keyed by error code → `{ title, explain, guidance, remedy }` where `remedy` is one of `password | api_keys | login_choice | binding | fresh_login | retry`. Single source of truth for copy, so the tab and dialog stay in sync.
- New `src/components/admin/channel-monitor/StepAFixDialog.tsx`: renders the remedy form for a code. Reuses the existing password card and login-candidate picker logic currently inside `StepAccountDialog.tsx` by extracting both into small sibling components (`SubAccountPasswordCard`, `LoginCandidatePicker`) that both dialogs mount — no duplicated invoke logic.
- Portal actions already exist and are reused unchanged: `save_login_password`, `verify_login_password`, `save_api_keys`, `create_api_key`, `ensure_owner_account` (with `confirmed_owner_email`), `rebind_owner`.
- `src/lib/channelOnboardOrchestrator.ts`: propagate `code` from every Step A runner — `verify_keys`, `company_profile` and `adopt_listings` currently drop it, which is why a rejected password reaches the UI as an unclassified failure. Also surface the channel's own message as `detail` rather than the generic invoke error (via the existing `readPortalErrorBody` recovery path).
- `supabase/functions/ru-cert-portal/index.ts`: `verify_api_keys` and the key-mint path return `code` on refusal alongside the message so the classification is not string-matched in the client. `save_login_password` returns the verification outcome (`verified`, `keys_minted`, `access_key` prefix) it already computes.
- `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`: replace the single `RU_EMAIL_IN_USE` special case with a lookup into the remedy registry — first failed result with a known code opens `StepAFixDialog`; on successful remedy, re-run Step A. Toasts stay for pending/rate-limited states only.
- No new tables, no new edge function, no schema change.
