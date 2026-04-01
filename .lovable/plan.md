

# Fix Billing Slug Bug + Expose Voice & Template Editing

## Three Issues Found

### 1. Billing Config Error (Bug)
**Root cause**: `PropertyForm.tsx` line 9388 passes `id!` (the URL slug "latter-days") to `BillingConfigTab` instead of `propertyId` (the resolved UUID state). Same issue on line 9390 for `ReferralSection`.

**Fix**: Change `propertyId={id!}` → `propertyId={propertyId}` on both lines.

### 2. Email Templates — Where to Edit
Templates are edited in **PMS → Messaging** (`/pms/messaging`). The TipTap rich-text editor with AI writer is already built there. This is NOT in the property edit form — it's in the PMS shell because templates are per-property PMS features.

### 3. Brand Voice — No UI Exists Yet
The `brand_voice` and `ai_email_tone` fields were seeded into `rolos_experience_configs` via SQL, but **no admin UI was ever built** to view or edit them. The Phase 2 and Phase 4 implementations created the edge function handlers and data structures but skipped the settings UI.

**Fix**: Add a "Voice & Tone" card to the Property Branding tab where admins can set:
- **Brand Voice** (textarea) — describes the property's personality for AI content
- **AI Email Tone** (select) — friendly, professional, casual, luxury, etc.

This reads/writes `rolos_experience_configs` where `config_type = 'brand_kit'`.

## Changes

| Action | File | What |
|--------|------|------|
| Modify | `src/pages/PropertyForm.tsx` line 9388 | `propertyId={id!}` → `propertyId={propertyId}` |
| Modify | `src/pages/PropertyForm.tsx` line 9390 | Same fix for ReferralSection |
| Create | `src/components/property/BrandVoiceCard.tsx` | Voice & Tone editor card (textarea + select) |
| Modify | `src/pages/PropertyForm.tsx` Branding tab | Add BrandVoiceCard below existing branding fields |

