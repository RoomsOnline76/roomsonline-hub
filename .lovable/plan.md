# ROL'OS Channel Readiness Wizard

Turn `docs/rolos-onboarding-channel-readiness.md` into a working feature: one floating,
persistent wizard that drives a property from "just switched to ROL'OS" all the way to
connected channels, in the runbook's eleven macro steps, with hard gates between them.

Existing surfaces (readiness checksheet, RU onboarding pipeline card, push button, currency
panel, LNM panel, Channels page) stay exactly where they are — the wizard becomes the driver
that scores them and deep-links into them.

## What the owner/admin sees

- A compact floating launcher docked bottom-right on the property editor and every ROL'OS
  page, shown whenever the selected property uses ROL'OS as its PMS and onboarding is not
  finished. Collapsible to a pill, remembers collapsed state.
- Opening it shows the eleven macro steps as a vertical timeline: done / current / locked,
  with the mandatory task list inside the current step.
- Each unmet task is a row with a "Take me there" action that navigates to the owning tab
  and paints the exact field (reuses the existing focus/deep-link mechanism).
- Locked steps state plainly why they are locked ("finish Media first").
- Steps 6, 7, 8, 9 expose their action buttons inline: push owner, capture key + secret,
  push property + ARI publish, verify currency. Step 8's push stays disabled until mandatory
  readiness is 100%.
- Step 10 is a manual checklist with an admin-only sign-off (who + when, recorded).
- Step 11 shows the Channel Manager entitlement state and, once accepted, closes the wizard
  and routes to ROL'OS → Channels.
- Owners see everything; the manual/admin actions (owner push, sign-off, entitlement toggle)
  are admin/dev/fearless_leader only, read-only for owners with a "your ROL'OS team will
  finalise this" note.

## Step-to-source mapping

| Macro | Completion source |
| --- | --- |
| 1 Identity & company | field registry sections: general, identity, contacts |
| 2 Location & geo | field registry location items + RU location id + Google place id |
| 3 Rooms & composition | `hostfully_room_types` composition/occupancy/amenity checks |
| 4 Media | image count, dimensions, single main image, tags |
| 5 Policies, rates, pricing | policy library, payment provider, 365-day pricing + availability coverage |
| 6 Push owner | `ru_owner_accounts.ru_owner_id` present |
| 7 Key & secret | `ru_api_credentials` verified pair for that sub-owner |
| 8 Push property & ARI | listing ids persisted, ARI read-back, LNM subscriptions, MCQ pass |
| 9 Location & currency | `ru_currency_state` verified |
| 10 Sub-account verification | new sign-off record |
| 11 Connect channels | `channel_manager_enabled` on billing config + connected channels |

## Technical approach

- `src/config/rolosOnboardingMacros.ts` — declarative registry: eleven macros, each with
  id, label, goal, gate ("previous complete"), and tasks. Each task carries either a
  requirement key from `propertyFieldRequirements.ts` (so scoring/highlighting stay one
  system) or a `resolver` id for backend-derived state.
- `src/hooks/useRolosOnboardingProgress.ts` — composes `usePropertyReadiness` (field +
  server checks) with one extra query for distribution state (`ru_owner_accounts`,
  `ru_api_credentials`, `ru_currency_state`, `ru_mcq_orders`, listing ids, billing config,
  `rolos_channel_connections`) and the stored sign-off. Returns per-macro
  `{ status: done | current | locked, tasks, blockers }` plus overall progress.
- `src/components/onboarding/rolos/` — `RolosOnboardingWizard.tsx` (floating shell +
  timeline), `MacroStepCard.tsx`, `MacroTaskRow.tsx`, and `ManualSignOffCard.tsx`.
  Action buttons reuse the existing calls: `push-property-to-ru`, `ru-cert-portal`
  (`push_owner`, `store_child_keys`, `order_mcq`), `verify_ru_currency`.
- Mount once in the property editor shell and the ROL'OS shell layout so it persists across
  navigation; it reads the active property from the existing property-selection hooks.
- Progress persistence: store macro state, the step-10 sign-off, and dismiss/collapse
  preferences in the existing `property_onboarding_roadmap.roadmap` JSONB (keyed
  `channel_readiness`). Derived task truth is always recomputed live — only manual
  acknowledgements and sign-off are persisted. No new tables.
- Navigation targets reuse `propertySectionOrder` keys and the `?section=&focus=` deep-link
  contract already honoured by `PMSPropertySetup` and the admin `PropertyForm`.

## Out of scope for this pass

- No removal of `RuOnboardingPipeline`, `RuPushContinueButton` or the readiness checksheet.
- No new database tables or edge functions; only reads plus a roadmap JSONB write.
