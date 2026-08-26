# Step A must use the re-assigned owner email

## Verified current state

- PufferFish currently has `owner_email = newjulius@polka.co.za` and is active/unarchived.
- There is no current local distribution account row for the PufferFish property or its DEMO ACCOUNT portfolio, so Step A should resolve from the current property owner email.
- The latest Step A ledger blocker was written after the rebind, but it still references `julius@polka.co.za`.
- The frontend currently sends `confirmedOwnerEmail: chosenLoginEmail || plan?.login_email || null` when running Step A. Because the cached preview plan is not cleared after a successful rebind, a stale modal/plan can override the updated property email.

## What will change

1. **Clear stale Step A preview state after re-assign**
   - After owner re-assignment succeeds, reset the cached Step A plan, selected login, email-conflict state, and remedy code.
   - Close the preview modal so the operator must open a fresh preview that reflects the new owner email.

2. **Prevent stale plan fallback from overriding the backend**
   - When Step A runs, only send `confirmedOwnerEmail` if the operator explicitly chose/typed a login in the modal.
   - If no explicit login override exists, omit `confirmedOwnerEmail` so the backend resolves from the live property/portfolio data.
   - This makes the backend’s current `properties.owner_email` the authority after a rebind.

3. **Refresh preview after rebind**
   - The next “Preview account” call will re-read the account plan and show `newjulius@polka.co.za` as the login source from the property owner email.
   - If the user keeps the modal open through a rebind, it will be invalidated instead of letting a stale login run.

4. **Repair PufferFish’s stale Step A status**
   - Reset the current `monitor_step_a` blocker for PufferFish from the old `julius@polka.co.za` failure back to pending.
   - This is a local database cleanup only; no channel call is made.

## Technical notes

- Main frontend change: `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`.
- The backend already prioritizes `confirmed_owner_email` when supplied, then falls back to the property owner email. The bug is that the frontend was still supplying the old cached value.
- No schema changes are needed.
- No channel traffic is required for the fix or data repair. Channel traffic only happens later if the operator runs Step A again.

## Verification

- Confirm the PufferFish property still reads `newjulius@polka.co.za`.
- Confirm the Step A ledger no longer displays the old `julius@polka.co.za` blocker.
- Confirm a fresh Step A preview resolves the login as `newjulius@polka.co.za`.
