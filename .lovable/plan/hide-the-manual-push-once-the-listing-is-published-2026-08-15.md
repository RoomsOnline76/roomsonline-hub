# Hide the manual push once the listing is published

Once the property (and every unit) carries a Channel Manager listing id, the push has been verified and updates flow automatically, the big "Push Building + Units" button is noise — it invites a duplicate push. In that state the panel should simply state that the Channel Manager is enabled and the only thing left is connecting a channel.

## What changes

1. **Published state for the push panel.** When the listing ids are present for the property and all units (and the readiness gate is clean), the primary action changes from "Push Building + Units" / "Publish to Channel Manager" to a calm status line:
   - "Published to the Channel Manager — awaiting a channel connection", with a "Connect channels" link into ROL'OS → Channels.
   - The automatic-sync line ("Updates push to the Channel Manager automatically") stays visible.
2. **Manual re-push becomes opt-in.** The push button moves inside the existing "Manual sync (not needed)" style disclosure — collapsed by default, labelled as a forced re-push — matching how content/rates force buttons already behave. "Fetch Channel Manager IDs" and "Validate" stay where they are.
3. **Not-yet-published behaviour unchanged.** Before the ids exist, or when the gate blocks, the button and its blocked/disabled messaging stay exactly as they are today.
4. **Wizard parity.** In the Channels wizard's publish step, the same rule applies: once published, the step shows the published/awaiting-connection state instead of a live "Publish now" primary action, with the re-push behind the same disclosure.

## Technical notes

- `src/components/property/PushToRentalsUnited.tsx` — derive `published` from `ruPropertyId` / `rentalsunited_building_id` plus every unit having `ru_property_id`; branch the header action row on it and wrap the push button in a collapsible.
- Reuse the disclosure pattern in `src/components/property/ChannelContentSyncStatus.tsx` for consistent copy and styling.
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx` — same published branch for the publish step's action button.
- No backend, gate, or schema changes; `pushPropertyToRu` and the readiness logic are untouched.
