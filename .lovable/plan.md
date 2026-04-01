

# Experience Engine — Phase Audit: What's Built vs What's Missing

## Summary of All 6 Phases

### Phase 1: Dynamic Cancellation Policies ✅ BUILT
- **Edge function**: `experience-engine` handles `cancellation_policy` type with date-range overrides, occupancy-aware dynamic factors, and forfeit evaluation
- **Database**: `rolos_policies` table stores per-property rules
- **Guest Portal**: `guest-cancel-booking` calls EE for policy evaluation when `experience_engine_enabled`
- **Guest Portal UI**: `SmartCancelModal` renders policy banners (free cancel / forfeit / non-refundable)
- **Bulk activation**: Seed script was built to activate all properties with tier-based defaults
- **Status**: Fully functional

### Phase 2: Google Font BrandKit ✅ BUILT
- **Edge function**: `brand_kit` type returns fonts + colors + logo
- **Property Form**: BrandingTab has font selectors (`brand_heading_font`, `brand_body_font`) stored on properties table
- **White-label**: Fonts applied via `WhiteLabelLayout` on guest-facing pages
- **Status**: Functional

### Phase 3: Agent Command Centre ✅ BUILT
- **Edge function**: `agent_command` type fetches availability + calls Lovable AI for suggestions
- **UI**: `PMSCommandCentre` page at `/pms/command-centre` consumes it
- **Status**: Functional (ROL PMS properties only)

### Phase 4: AI Email Design System ⚠️ PARTIALLY BUILT — 3 GAPS
- **Edge function**: `guest_email` type has `generate` and `resolve` actions ✅
- **AI Writer UI**: `EmailAIWriter` component works ✅
- **Template Preview**: `EmailTemplatePreview` just added to `ExperienceEmailDesigner` ✅
- **Template storage**: `rolos_message_templates` table, CRUD via `pms-message-dispatcher` ✅
- **Email sending**: `send-booking-email` looks up EE templates ✅

**GAP 4a — BrandVoiceCard overwrites brand_kit config**: `BrandVoiceCard.handleSave()` replaces the entire `config` JSON with `{ brand_voice, ai_email_tone, heading_font: null, body_font: null }` — this **destroys** any existing fields like `primary_color`, `secondary_color`, `logo_url` that may have been seeded. It should merge, not replace.

**GAP 4b — AI generation ignores brand_voice**: The `experience-engine` edge function's `guest_email` → `generate` handler builds a system prompt from property name/type/city but never reads `brand_voice` or `ai_email_tone` from `rolos_experience_configs`. The voice/tone the user saves in BrandVoiceCard is unused.

**GAP 4c — EmailAIWriter tone mismatch**: `EmailAIWriter` has its own hardcoded `TONE_OPTIONS` (friendly/formal/luxury/casual) separate from `BrandVoiceCard`'s `TONE_OPTIONS` (friendly and informative/professional/casual/luxury/warm and welcoming/adventurous). The saved tone preference is never pre-selected in the AI Writer.

### Phase 5: AI Portfolio Discovery ✅ BUILT
- **Edge function**: `portfolio` type has `recommend` and `search` actions with AI
- **UI**: `EmbedPortfolio` and `PortfolioWidgetTab` consume it
- **Caching**: `booking-portfolio-api` has 5-min TTL cache
- **Status**: Functional

### Phase 6: Smart Guest Retention ✅ BUILT
- **Edge function**: `guest_portal` → `alternatives` action generates AI retention offers
- **UI**: `SmartCancelModal` fetches and renders alternatives before cancellation
- **Integration**: `guest-cancel-booking` calls EE when enabled
- **Status**: Functional

---

## Fixes Required (3 items, 2 files)

### Fix 1: BrandVoiceCard — merge config instead of replace
**File**: `src/components/property/BrandVoiceCard.tsx`

Currently `handleSave` creates a new object with only 4 keys and replaces the whole `config` column. Fix: read the existing config first (already available from the `useEffect` fetch), spread existing fields, then overlay voice/tone fields. This preserves `primary_color`, `secondary_color`, `logo_url`, etc.

### Fix 2: Edge function — use brand_voice in AI email generation
**File**: `supabase/functions/experience-engine/index.ts`

In the `guest_email` → `generate` branch (~line 285), after fetching the `config`, read `brand_voice` and `ai_email_tone` from the config and inject them into the system prompt. Change from:
> "You are an email copywriter for {name}..."

To:
> "You are an email copywriter for {name}... Brand voice: {brand_voice}. Write in a {ai_email_tone} tone."

### Fix 3: EmailAIWriter — pre-select saved tone
**File**: `src/components/pms/EmailAIWriter.tsx`

Accept an optional `defaultTone` prop. When the component opens, initialize the tone selector with the saved `ai_email_tone` from the brand_kit config (passed down from `ExperienceEmailDesigner` which already fetches brand config). Unify tone option values between the two components.

## Files

| Action | File | What |
|--------|------|------|
| Modify | `src/components/property/BrandVoiceCard.tsx` | Merge config on save instead of replacing |
| Modify | `supabase/functions/experience-engine/index.ts` | Read brand_voice/ai_email_tone and inject into AI prompt |
| Modify | `src/components/pms/EmailAIWriter.tsx` | Accept `defaultTone` prop, pre-select saved tone |
| Modify | `src/components/property/ExperienceEmailDesigner.tsx` | Pass saved tone from brandConfig to EmailAIWriter |

