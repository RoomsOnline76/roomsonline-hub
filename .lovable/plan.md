

# Integrations Tab for All Properties + Experience Engine Templates

## Two Changes

### 1. Make Integrations Tab Available to All Properties

Currently the tab has `rolOnly: true` and is filtered out for non-ROL PMS properties (line 4517). Also wrapped in `selectedPMS === "roomsonline"` guard at line 11305.

**Fix**: Remove the `rolOnly` flag from the integrations tab definition (line 4510) and remove the `selectedPMS === "roomsonline"` wrapper around the `TabsContent` (line 11305). The NightsBridge filter (line 4519) also needs `"integrations"` added to its allowed tabs.

### 2. Upgrade Templates Tab When Experience Engine Is Enabled

The existing Templates tab (line 7377) is a basic `RichTextEditor` + mailer timing fields stored in `amenities.templates`. For properties with Experience Engine enabled, this should show the richer AI-powered email designer (similar to what PMS Messaging has).

**Approach**: 
- Check if the property has `experience_engine_enabled` in `rolos_ui_configs`
- If YES: render a new `ExperienceEmailDesigner` component that reads/writes `rolos_message_templates` with the AI writer (`EmailAIWriter`) and TipTap editor — same components used in `PMSMessaging.tsx`
- If NO: show the existing basic textarea UI (current behavior)

This requires creating an `ExperienceEmailDesigner` component that reuses existing hooks (`usePmsMessaging` template CRUD + `EmailAIWriter`) but works outside the PMS shell context by accepting a `propertyId` prop directly.

## Files

| Action | File | What |
|--------|------|------|
| Modify | `src/pages/PropertyForm.tsx` line 4510 | Remove `rolOnly: true` from integrations tab |
| Modify | `src/pages/PropertyForm.tsx` line 4517 | Remove the `rolOnly` filter logic |
| Modify | `src/pages/PropertyForm.tsx` line 4519-4521 | Add `"integrations"` to NightsBridge allowed tabs |
| Modify | `src/pages/PropertyForm.tsx` line 11305 | Remove `selectedPMS === "roomsonline"` guard |
| Create | `src/components/property/ExperienceEmailDesigner.tsx` | AI-powered template editor using `EmailAIWriter` + `usePmsMessaging` hooks |
| Modify | `src/pages/PropertyForm.tsx` Templates tab (~line 7377) | Conditionally render `ExperienceEmailDesigner` when experience engine is enabled |

