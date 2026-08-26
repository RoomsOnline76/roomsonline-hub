# Optional manual sub-account email on Channel Onboarding

## Goal
On the "Onboard a property" card, when the pick is **not linked to a sub-account yet**, offer an optional **Add sub-account** button next to **Create Account** so the operator can specify the owner email to use. If the dialog is left incomplete/cancelled, Step A proceeds with the normal slug-generated email; if an email is entered, Step A uses that email instead.

## UI changes (`src/components/admin/channel-monitor/ChannelOnboardTab.tsx`)

- Next to **Create Account**, render an outline **Add sub-account** button (visible only when `!accountProvisioned` and no binding exists).
- Clicking it opens a small dialog:
  - Email input (validated: trimmed, lower-cased, must be a valid email, max 50 chars to match the channel limit).
  - **Save** sets `chosenLoginEmail` and closes; **Cancel**/close leaves it empty.
- When `chosenLoginEmail` is set, show it inline beside the "Distribution sub-account" line as "Will use: `<email>`" with a small ✕ to clear it (clears back to the slug path).
- Create Account / Retry Step A unchanged: it already passes `chosenLoginEmail` as `confirmed_owner_email` on the Step A run, so a saved email overrides the slug flow; when empty, the existing slug generation proceeds untouched.

## Backend
No changes required — the Step A orchestrator and `ru-cert-portal` already honor `confirmed_owner_email` (existing plumbing used by the conflict-resolution chooser).

## Verification
- Build clean.
- Manual check: pick an unlinked property → Add sub-account → enter email → Create Account → Step A header shows the entered email instead of the slug email; clearing the chip reverts to the slug path.
