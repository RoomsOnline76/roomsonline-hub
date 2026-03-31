

# Phase 4: AI Personalised Guest Journey Emails

## Overview

Transform the PMS Messaging tab from a basic textarea template editor into a rich, property-specific email design system with AI content generation. The `experience-engine` gains a `guest_email` handler that resolves per-property email templates and generates AI-personalised content. The existing `send-booking-email` edge function gains an Experience Engine integration point so properties with the feature enabled get their customised templates automatically.

## Current State

- **PMSMessaging.tsx**: Simple 3-tab page (Templates, Log, Queue) with basic textarea editor, placeholder buttons, trigger events. Templates stored in `rolos_message_templates`.
- **send-booking-email**: 1314-line monolith that checks `property.amenities.templates.template_content` for custom HTML, else generates hardcoded HTML. Uses Resend directly. Supports branding via `resolveBranding()`.
- **pms-message-dispatcher**: Handles template CRUD + queue processing + manual sends via `rolos_message_templates`.
- **experience-engine**: `guest_email` type exists in valid types but currently falls through to generic `resolveExperienceConfig` (returns empty config).

## 1. Enhanced Template Editor UI — PMSMessaging.tsx

Replace the textarea-based template editor dialog with a rich editing experience:

**Rich Text Editor**: Replace `<Textarea>` body field with TipTap editor (already available in the project via contract editor). Include:
- Toolbar: bold, italic, headings, links, images, alignment
- Placeholder insertion buttons (existing `MESSAGE_PLACEHOLDERS`) as TipTap inline nodes or click-to-insert
- **AI Writer button**: "Generate with AI" button that calls the experience-engine `guest_email` handler to generate email content based on the trigger event, property details, and an optional prompt. The generated content populates the TipTap editor for further editing.
- **Live preview pane**: Side-by-side or toggle view showing the rendered email with property branding applied (colors, logo, fonts from brand_kit)

**Template categories**: Group templates by trigger event with visual cards showing template name, trigger, channel, active status, and a mini-preview snippet.

**New trigger events**: Add `modification` and `invoice` to `TRIGGER_EVENTS` array.

## 2. Experience Engine — `guest_email` Handler

**File**: `supabase/functions/experience-engine/index.ts`

Add a dedicated `guest_email` case (currently falls through to generic). Two sub-actions via `payload.action`:

### `generate` — AI content generation
- Accepts: `trigger_event`, `tone` (formal/friendly/luxury), `property_context` (name, location, amenities), `custom_prompt`
- Calls Lovable AI to generate email subject + body HTML matching the property's brand voice
- Returns: `{ subject, body_html, tone_used }`
- System prompt stored in `rolos_experience_configs` for customisation per property

### `resolve` — Template resolution for sending
- Accepts: `trigger_event`, `booking_id`
- Looks up the property's active template from `rolos_message_templates` for that trigger
- If no property-specific template exists, falls back to global default
- Returns the resolved template with placeholders intact (caller does variable replacement)

## 3. Send-Booking-Email Integration

**File**: `supabase/functions/send-booking-email/index.ts`

Add an Experience Engine integration point at ~line 1135 (where custom templates are currently resolved from `amenities.templates`):

```
// NEW: Check Experience Engine for property-specific template
1. Check if property has experience_engine_enabled via rolos_ui_configs
2. If enabled, query rolos_message_templates for trigger = booking_confirmed/cancellation
3. If a matching active template exists, use it (with replaceTemplateVariables)
4. If not, fall through to existing amenities.templates.template_content check
5. If neither, use hardcoded default template
```

This is **backwards compatible** — properties without the experience engine enabled continue using the existing flow unchanged. The template resolution order becomes:
1. Experience Engine template (from `rolos_message_templates`, if engine enabled)
2. Legacy custom template (from `amenities.templates.template_content`)
3. Hardcoded default HTML

## 4. AI Content Generation Edge Function Logic

Inside the `guest_email` handler, when `payload.action === 'generate'`:

- Fetch property details (name, location, amenities, brand colors)
- Build a system prompt combining the property context with the config from `rolos_experience_configs`
- Call Lovable AI (`google/gemini-3-flash-preview`) with tool calling to extract structured output: `{ subject, body_html }`
- The body_html uses `{{placeholder}}` syntax so it works with the existing `replaceTemplateVariables` function
- Return the generated content for the admin to review/edit in the TipTap editor before saving

## 5. Template Preview with Branding

**New component**: `src/components/pms/EmailTemplatePreview.tsx`

A preview component that:
- Takes template HTML + property brand data
- Renders the email wrapped in the same `wrapCustomTemplate` / `generateEmailHeader` / `generateEmailFooter` logic used by `send-booking-email`
- Shows realistic mock data (sample guest name, dates, amounts)
- Applies brand colors, logo, fonts from the property record

Used in both the template editor dialog and as a standalone preview accessible from the template cards.

## 6. Template Duplication + Starter Library

Add a "Use Starter Template" option when creating a new template. Pre-built templates for each trigger event:
- Booking Confirmed (warm welcome with property details)
- Pre-Arrival (check-in info, local tips)
- Check-Out (thank you, review request)
- Cancellation (policy summary, rebooking encouragement)
- Payment Request (invoice details, payment link)

These are stored as seed data in the code (not DB) and inserted into the TipTap editor as a starting point when selected.

## Technical Details

### AI generation prompt structure
```
System: You are an email copywriter for {property_name}, a {property_type} in {location}.
Write a {trigger_event} email in a {tone} tone. Use these placeholders: {{guest_name}}, {{check_in_date}}, etc.
Return HTML suitable for email clients (table-based layout, inline styles).
```

### TipTap integration
Reuse the TipTap setup from the contract editor (`AdminContractEditor` pattern). Add custom placeholder node extension that renders `{{placeholder}}` as styled chips in the editor.

## Files

| Action | File |
|--------|------|
| Modify | `src/pages/pms/PMSMessaging.tsx` — replace textarea with TipTap editor, add AI writer button, preview pane, starter templates |
| Create | `src/components/pms/EmailTemplatePreview.tsx` — branded email preview component |
| Create | `src/components/pms/EmailAIWriter.tsx` — AI content generation dialog |
| Modify | `src/hooks/usePmsMessaging.ts` — add `useGenerateEmailContent` hook calling experience-engine |
| Modify | `supabase/functions/experience-engine/index.ts` — add `guest_email` handler with generate + resolve actions |
| Modify | `supabase/functions/send-booking-email/index.ts` — add Experience Engine template resolution before legacy fallback |
| Modify | `src/hooks/usePmsMessaging.ts` — add `modification` and `invoice` trigger events |

No database migration needed — `rolos_message_templates` and `rolos_experience_configs` tables already exist.

