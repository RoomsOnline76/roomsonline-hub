# Retire the "paused" channel switch — listed means live

## What actually happened (verified)

Nothing paused your channel. There is a hidden per-property switch, `ru_push_enabled`, and it is
**off by default**:

- The column was created with `DEFAULT false`, so any property created after that point starts off.
- The clone routine explicitly forces it back to `false` for every copied property — which is why
  "RU Name Change" (a clone) was off. Nobody switched it off; it was born off.
- It only flips on through a narrow trigger (when a property's PMS becomes ROL'OS, or on insert with
  those flags set) — a clone doesn't hit that path.
- The sync gate refuses every push while it is off, and until this week that refusal was logged as
  "not listed on the channel", so the operator saw nothing at all.

Current state: all 8 listed properties (Dassiesingel, Fonteinhutte, RU Name Change, Clones A/B/D,
Seesig, Tidal Pools) now have it on, so nothing is blocked right now. But the same trap fires again
on the next clone or new property.

## The rule going forward

A property is either **distributed** (it has live channel listings) or it isn't. There is no third
"listed but paused" state.

- If a property has at least one live channel listing, saves push. No extra switch to remember.
- If it has no listing yet, saves don't push — because there is nothing to push to.
- Pausing distribution becomes an explicit, deliberate act with a reason and a visible badge, used
  for real situations only (owner off-boarding, a listing under repair). Never a silent default.

## What changes

### 1. The gate stops asking for the extra switch

The channel gate keeps the checks that genuinely matter — bound channel account, keys present,
company profile accepted, at least one live listing — and drops "push explicitly enabled" as a
separate hurdle. Wizard readiness is already covered by those checks.

### 2. Clones and new properties inherit reality, not "off"

- Cloning no longer forces the switch off. A clone that carries no listings simply has nothing to
  push; once it gets listings, it pushes.
- New properties no longer depend on the auto-enable trigger to become pushable.

### 3. Pausing becomes explicit and visible

- The switch is repurposed as a **deliberate hold**: default is "distributing", and turning it off
  requires an admin action and records who/when/why.
- When a property is held, the Channel Manager card and the property editor show a clear "Channel
  distribution on hold" badge with that reason, and saves report "held" rather than looking
  delivered or silent.

### 4. No more silent refusals

Every refused or parked delta keeps naming its real reason ("no listing yet", "on hold since
<date>"), both in the save toast and in the channel monitor, so "did my change reach the channel?"
always has an answer on screen.

## Technical notes

- `supabase/functions/_shared/ruSyncGate.ts`: remove the `ru_push_enabled !== true` deny; keep
  `RU_NOT_LISTED`, owner binding, company details and credential checks. Add a `RU_ON_HOLD` deny
  that only fires for an explicit hold.
- Migration: flip the column default to `true`, add `ru_hold_reason` / `ru_hold_set_at` /
  `ru_hold_set_by`, and backfill existing `false` rows that have live listings to `true` (already
  true today, so the backfill is a safety net for anything created since).
- Clone routine (`clone_property`-style migration block): stop overriding `ru_push_enabled`;
  the copy keeps no channel ids, which is the correct reason it can't push yet.
- `auto_enable_ru_push` trigger becomes unnecessary once the default is `true` — drop it so there is
  one rule instead of two competing ones.
- `ruStaticDelta.ts` / `ruPendingDeltas.ts`: keep parked-delta behaviour, but the park reason for a
  held property reads "on hold", and "no listing yet" stays a skip.
- Surfaces that read the flag today (`AdminRentalsUnited.tsx`, `PortfolioRuAccountsTab.tsx`,
  `PushToRentalsUnited.tsx`, `useChannelCostMonitor.ts`, `daily-health-report`,
  `cron-push-all-properties-to-ru`, `cron-refresh-ru-ari`, `cron-refresh-ru-discounts`,
  `cron-channel-price-coverage`, `channel-manager-entitlement`) switch from "enabled?" to
  "on hold?" semantics — crons skip only held properties.
- Deploy: `push-property-to-ru`, `ru-static-delta`, `ru-cert-portal`, the four crons,
  `channel-manager-entitlement`, `daily-health-report`.
