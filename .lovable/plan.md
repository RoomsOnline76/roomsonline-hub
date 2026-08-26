# Repoint the Channel Monitor key blocker to Step A

## Goal
The Channel Monitor status strip (`ChannelRuStatusStrip`) shows a top-priority blocker when sub-account API keys are missing:
> "Sub-account API keys are missing — Store keys"

Key minting is no longer a manual step — it is automated inside the **Step A preview account modal** on the Onboard tab. The "Store keys" action wording is obsolete and misleads operators toward a manual capture flow that no longer exists as the primary path.

Keep the blocker (keys are still the real primary blocker), but repoint its action to Step A.

## Change

**File:** `src/components/admin/channel-monitor/ChannelRuStatusStrip.tsx`

1. Extend the local `TabKey` union to include `"onboard"` (the Onboard tab, where Step A's preview modal lives). The existing `"accounts"`/`"cert"` keys stay for the chips, which already deep-link through the page's legacy tab map.

2. In the `blocker` memo (lines 50–56), repoint both key-related blockers:
   - **Missing keys** (line 52): keep label `"Sub-account API keys are missing"`, change action from `"Store keys"` → `"Run Step A"`, change `tab` from `"accounts"` → `"onboard"`.
   - **Unverified keys** (line 55): keep label `"Stored keys have not been verified against the channel"`, change action from `"Verify keys"` → `"Run Step A"`, change `tab` from `"accounts"` → `"onboard"`.

3. Keep the icon (`KeyRound`) for both — it still reads as a key/credential action.

No other blockers (live listings, footprint, certification) change. The informational chips (`Accounts X/Y keys verified`, `… live · … listings`, `Certification …`) are untouched — they already report state correctly, and the Onboard rail chip already reports unverified key counts.

## Why the navigation already works
`AdminChannelMonitor.tsx` already maps the legacy `accounts` tab to `onboard` (`LEGACY_TAB_MAP.accounts === "onboard"`), and the code comment at the onboarding rail chip states account/key health "now reports on the Onboard chip — Step A owns that surface." This change makes the strip's action explicit and label-accurate instead of relying on legacy indirection.

## Verification
- TypeScript / build check on `ChannelRuStatusStrip.tsx` (the `TabKey` change and label changes).
- Confirm no other file references the removed `"Store keys"` / `"Verify keys"` action strings from this strip.
