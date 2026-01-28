

# Enhanced Property Listing Process: Implementation Plan

## Executive Summary

This plan transforms the current property listing workflow into a **state-driven, self-service system** with automated quality gates and clear progress tracking. The implementation is organized into 8 phases over 8 weeks, building on the existing codebase while introducing new capabilities.

---

## Current State Analysis

The existing system has a solid foundation:
- **Contract flow**: `AdminContracts.tsx` → `send-owner-contract` → `ContractSign.tsx` → `process-signature`
- **Onboarding**: 9-step wizard in `PropertyOnboardingWizard.tsx` with scoring system
- **Activation**: `show_on_website` toggle with `enforce_contract_before_activation()` trigger
- **Progress tracking**: Basic completion percentage via `usePropertyOnboarding.tsx`

**Gaps to address:**
- No pre-flight intent locking
- No explicit property status field (relies on implicit states)
- No quality gate before activation
- No checklist system
- No post-launch validation
- No progress dashboard for owners

---

## Phase 1: Database Schema Foundation (Week 1) ✅ COMPLETED

### 1.1 Migration: Properties Table Enhancements ✅

```sql
-- Add new status and intent fields to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS listing_status TEXT DEFAULT 'draft_pre_contract'
  CHECK (listing_status IN ('draft_pre_contract', 'contract_sent', 'contract_signed', 
                            'onboarding_active', 'review_pending', 'activation_ready', 'live', 'inactive'));

ALTER TABLE properties ADD COLUMN IF NOT EXISTS listing_intent TEXT 
  CHECK (listing_intent IN ('accommodation', 'venue', 'hybrid', 'experience'));

ALTER TABLE properties ADD COLUMN IF NOT EXISTS commercial_model TEXT
  CHECK (commercial_model IN ('commission', 'flat_fee', 'special'));

ALTER TABLE properties ADD COLUMN IF NOT EXISTS pms_readiness TEXT DEFAULT 'none'
  CHECK (pms_readiness IN ('none', 'planned', 'connected', 'live'));

ALTER TABLE properties ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS activated_by UUID REFERENCES auth.users(id);

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_properties_listing_status ON properties(listing_status);
```

### 1.2 Migration: Property Checklist Table

```sql
CREATE TABLE property_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  phase TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_label TEXT NOT NULL,
  required_for TEXT[] DEFAULT '{}',
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  auto_verified BOOLEAN DEFAULT false,
  verification_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(property_id, phase, item_key)
);

ALTER TABLE property_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all checklists" ON property_checklist
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners can view their property checklists" ON property_checklist
  FOR SELECT TO authenticated
  USING (property_id IN (
    SELECT id FROM properties p 
    JOIN profiles pr ON p.owner_email = pr.email 
    WHERE pr.id = auth.uid()
  ));
```

### 1.3 Migration: Property Activation Logs

```sql
CREATE TABLE property_activation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL,
  activated_by UUID REFERENCES auth.users(id),
  pre_activation_score NUMERIC,
  quality_gate_results JSONB,
  post_activation_checks JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE property_activation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage activation logs" ON property_activation_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
```

### 1.4 Migration: Property Onboarding Roadmap

```sql
CREATE TABLE property_onboarding_roadmap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE UNIQUE,
  roadmap JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE property_onboarding_roadmap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage roadmaps" ON property_onboarding_roadmap
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners can view their roadmaps" ON property_onboarding_roadmap
  FOR SELECT TO authenticated
  USING (property_id IN (
    SELECT id FROM properties p 
    JOIN profiles pr ON p.owner_email = pr.email 
    WHERE pr.id = auth.uid()
  ));
```

---

## Phase 2: Pre-Flight Wizard (Week 2) ✅ COMPLETED

### 2.1 New Component: `PreFlightWizard.tsx` ✅

**Location:** `src/components/onboarding/PreFlightWizard.tsx`

**Purpose:** Admin-only interface for defining listing intent before sending contracts

**Features:**
- Step 1: Listing Intent (accommodation, venue, hybrid, experience)
- Step 2: Commercial Model (commission, flat_fee, special)
- Step 3: PMS Readiness (none, planned, connected, live)
- Step 4: Owner Details (email, name)
- Step 5: Review and confirm (shows downstream requirements)
- Creates property in `draft_pre_contract` status
- Redirects to contracts page after creation

**Files Created:**
- `src/components/onboarding/PreFlightWizard.tsx`
- `src/pages/AdminPreFlight.tsx`

**Files Modified:**
- `src/App.tsx` - Added `/admin/properties/new/preflight` route
- `src/pages/PropertyOverview.tsx` - Added "Start New Listing" button for admins

---

## Phase 3: Intent-Aware Contract System (Week 3) ✅ COMPLETED

### 3.1 Update: `send-owner-contract` Edge Function ✅

**File:** `supabase/functions/send-owner-contract/index.ts`

**Enhancements:**
- Accept `listing_intent` and `commercial_model` parameters
- Store metadata in owner_contracts record including expected steps
- Update property `listing_status` to `contract_sent`
- Added `INTENT_STEPS` and `INTENT_REQUIREMENTS` mappings

### 3.2 Update: `process-signature` Edge Function ✅

**File:** `supabase/functions/process-signature/index.ts`

**Enhancements:**
- Update property `listing_status` to `contract_signed`
- Generate onboarding roadmap based on intent metadata
- Trigger `generate-checklist` edge function
- Create property records for new owners with business info

### 3.3 New Edge Function: `generate-checklist` ✅

**File:** `supabase/functions/generate-checklist/index.ts`

**Purpose:** Creates intent-specific checklist items from master template

**Implementation:**
- Master `CHECKLIST_ITEMS` template with 15+ items
- Filters items by `listing_intent`
- Supports auto-verification logic per item
- Inserts into `property_checklist` table

---

## Phase 4: Dynamic Onboarding Wizard (Week 4) ✅ COMPLETED

### 4.1 Update: `onboardingFieldSchema.ts` ✅

**File:** `src/config/onboardingFieldSchema.ts`

**Enhancements:**
- Added `ListingIntent` type
- Added `getWizardStepsForIntent()` for intent-aware step filtering
- Added `COMPLETION_STATES` with blocked/unblocked indicators
- Added `getCompletionState()` and `getCompletionStateDetails()` functions
- Added venue-specific sections (`VENUE_SECTIONS`) 
- Added experience-specific sections (`EXPERIENCE_SECTIONS`)
- Added field impact levels (`FieldImpactLevel`)
- Added `getMissingFieldsByImpact()` function
- Defined `CRITICAL_FIELDS`, `HIGH_IMPACT_FIELDS`, `MEDIUM_IMPACT_FIELDS`

### 4.2 Update: `PropertyOnboardingWizard.tsx` ✅

**File:** `src/components/onboarding/PropertyOnboardingWizard.tsx`

**Enhancements:**
- Now uses dynamic `wizardSteps` from hook (intent-aware)
- Added "Why it matters" hints for each step
- Added completion state badge with tooltip
- Added missing fields panel on review step (by impact level)
- Added "Next Action" hint in footer
- Step component mapping via `STEP_COMPONENT_MAP`

### 4.3 Update: `usePropertyOnboarding.tsx` ✅

**File:** `src/hooks/usePropertyOnboarding.tsx`

**Enhancements:**
- Added roadmap loading from `property_onboarding_roadmap` table
- Added checklist loading/updating from `property_checklist` table
- Implemented `getCompletionState()` integration
- Added `autoVerifyChecklist()` for automatic checklist completion
- Added `calculateNextAction()` for "next action" suggestions
- Added `goToStepById()` for navigation by step ID
- Score calculation respects intent-specific step filtering
- Auto-updates `listing_status` to `onboarding_active` when wizard loads

---

## Phase 5: Quality Gate System (Week 5) ✅ COMPLETED

### 5.1 New Edge Function: `check-activation-readiness` ✅

**File:** `supabase/functions/check-activation-readiness/index.ts`

**Purpose:** Run comprehensive readiness checks before activation

**Implementation:**
- 9 quality checks covering all critical aspects:
  1. `contract` - Valid signed/overridden contract exists
  2. `content` - Property name, type, description complete
  3. `media` - Minimum 3 images, hero image designated
  4. `commercial` - Bank details configured
  5. `pms` - PMS conflicts resolved, production mode if connected
  6. `location` - Address, city, country complete
  7. `contact` - Phone or email configured
  8. `rooms` - Room types configured (for accommodation/hybrid)
  9. `policies` - Check-in/check-out times set

- Each check returns: `id`, `name`, `passed`, `message`, `fix`, `field`, `severity`
- Overall response: `passed`, `score`, `blockers`, `warnings`, `checks`

### 5.2 New Component: `QualityGateIndicator.tsx` ✅

**Location:** `src/components/property/QualityGateIndicator.tsx`

**Features:**
- Compact mode for inline table display
- Full expanded mode with collapsible details
- Color-coded status (green/yellow/red)
- Expandable blocker/warning lists
- Direct "Fix" buttons linking to problem fields
- "Re-run checks" button
- Tooltip summary on hover

### 5.3 Update: `PropertyOverview.tsx` ✅

**File:** `src/pages/PropertyOverview.tsx`

**Enhancements:**
- Imported `QualityGateIndicator` component
- Updated `handleToggleShowOnWebsite()` to run quality gate before enabling
- Quality gate blocks activation if blockers exist
- Shows toast error with blocker details
- Logs activation to `property_activation_logs` table
- Updates `listing_status` to 'live' on activation
- Added compact QualityGateIndicator next to switch for inactive properties
- Added tooltip explaining quality gate behavior

---

## Phase 6: Admin Review System (Week 6) ✅ COMPLETED

### 6.1 New Page: `AdminReviewQueue.tsx` ✅

**Location:** `src/pages/AdminReviewQueue.tsx`
**Route:** `/admin/review-queue`

**Features:**
- List properties by status (review_pending, activation_ready, review_failed, rejected, onboarding_active)
- Show completion score, intent type, quality gate status
- Filter by status, intent, search by name/owner
- Status summary cards for quick overview
- Quick actions: View, Edit, Review

### 6.2 New Component: `ReviewActionPanel.tsx` ✅

**Location:** `src/components/property/ReviewActionPanel.tsx`

**Purpose:** Slide-over panel for admin review actions

**Features:**
- Property details display with owner info
- Quality Gate integration showing current status
- Checklist progress visualization
- Request Fixes textarea with "Send to Owner" action
- Footer action buttons: Reject, Override, Approve

**Actions:**
- **Approve**: Runs quality gate; if passed, sets status to `live` and activates; otherwise `activation_ready`
- **Reject**: Sets status to `rejected`, logs reason, sends notification email
- **Request Fixes**: Sets status to `onboarding_active`, sends revision email
- **Override**: Sets status to `activation_ready` with override reason logged (for bypassing quality gate)

### 6.3 New Edge Function: `review-property` ✅

**Location:** `supabase/functions/review-property/index.ts`

**Purpose:** Handle review actions (approve, reject, request_fixes, override)

**Implementation:**
- Validates property exists
- Handles each action type with appropriate status updates
- Logs all actions to `property_activation_logs` table
- Sends notification emails to property owners via Resend
- Returns success/failure with new status

### 6.4 Navigation Integration ✅

- Added "Review Queue" to admin navigation in `src/config/navigation.ts`
- Added route `/admin/review-queue` in `src/App.tsx`
- Exported `ReviewActionPanel` from `src/components/property/index.ts`

---

## Phase 7: Enhanced Activation Flow (Week 7) ✅ COMPLETED

### 7.1 Update: `PropertyOverview.tsx` Activation Handler ✅

**File:** `src/pages/PropertyOverview.tsx`

**Enhanced Flow:**
1. Run quality gate via edge function ✅
2. If passed: Update database, refresh caches, notify owner ✅
3. Log activation with pre-activation score ✅
4. Trigger post-launch validation scheduling ✅

**Implementation Details:**
- Quality gate runs before enabling `show_on_website`
- On successful activation:
  - Updates `listing_status` to `'live'`
  - Sets `activated_at` and `activated_by`
  - Logs to `property_activation_logs` table
  - Sends activation notification email to owner (fire-and-forget)
  - Schedules post-launch validation (runs 5 seconds after activation)

### 7.2 New Edge Function: `post-launch-validator` ✅

**File:** `supabase/functions/post-launch-validator/index.ts`

**Purpose:** Scheduled validation after properties go live

**Checks (7 total):**
1. `search_visibility` - Property appears in public_properties view
2. `image_accessibility` - Images configured with hero image
3. `booking_flow` - Room types or base pricing available
4. `pms_sync` - PMS connection healthy (if connected)
5. `error_monitoring` - No excessive booking failures
6. `contact_info` - Phone or email present
7. `location_data` - Address and coordinates complete

**Features:**
- Supports single property validation or batch (`run_all_live: true`)
- Returns detailed check results with severity levels
- Logs validation results to `property_activation_logs.post_activation_checks`
- Score calculation (pass threshold: 70%)

### 7.3 New Edge Function: `send-activation-notification` ✅

**File:** `supabase/functions/send-activation-notification/index.ts`

**Purpose:** Notify owners when their property goes live

**Features:**
- Branded congratulations email with property details
- "View Your Listing" and "Go to Dashboard" CTAs
- "What's Next" guidance for owners
- Admin notification to internal team
- Uses Resend via `notify.roomsonline.co.za` domain

---

## Phase 8: Progress Dashboard & Polish (Week 8) ✅ COMPLETED

### 8.1 New Component: `ProgressDashboard.tsx`

**Location:** `src/components/property/ProgressDashboard.tsx`

**Features:**
- Visual status indicator (current phase)
- Progress bar with percentage
- "Next Action" card (always visible)
- Blocker list (if any)
- Phase timeline visualization
- Checklist view (expandable)

### 8.2 New Hook: `usePropertyProgress.ts`

**Location:** `src/hooks/usePropertyProgress.ts`

**Purpose:** Calculate and track property progress

```typescript
interface PropertyProgress {
  status: ListingStatus;
  score: number;
  completionState: CompletionState;
  nextAction: NextAction;
  blockers: Blocker[];
  checklistProgress: ChecklistProgress;
}

const usePropertyProgress = (propertyId: string): PropertyProgress => {
  // Calculate progress based on property data, roadmap, checklist
};
```

### 8.3 New Route: `/dashboard/property/:id/progress`

**Accessible to:** Both owners and admins

**Integration:**
- Add link from PropertyCard components
- Add tab in PropertyForm for admins
- Add navigation item for owners

### 8.4 Help System Integration

**New Help Articles:**
| Slug | Target |
|------|--------|
| `preparing-your-property-for-listing` | owner |
| `understanding-your-roomsonline-agreement` | owner |
| `completing-your-property-profile` | owner |
| `whats-required-before-going-live` | owner |
| `when-your-property-appears-online` | owner |
| `what-happens-after-you-go-live` | owner |
| `using-the-progress-dashboard` | owner |
| `admin-review-queue-guide` | admin |

---

## Configuration Files

### `config/listing-intents.json`
```json
{
  "accommodation": {
    "label": "Accommodation",
    "required_fields": ["rooms", "pricing", "check_in"],
    "optional_fields": ["venue_capacity"],
    "wizard_steps": ["property_identity", "contact_details", "location", "rooms_overview", ...]
  },
  "venue": {
    "label": "Venue",
    "required_fields": ["capacity", "event_types", "pricing"],
    "optional_fields": ["rooms"],
    "wizard_steps": ["property_identity", "contact_details", "location", "capacity", ...]
  }
}
```

### `config/quality-gates.json`
```json
{
  "contract": { "required": true, "severity": "blocker" },
  "content": { "required": true, "min_score": 50 },
  "media": { "required": true, "min_images": 3 },
  "commercial": { "required": true, "fields": ["bank_details"] }
}
```

### `config/checklist-templates/master.json`
```json
[
  { "phase": "contract", "key": "contract_signed", "label": "Contract signed", "required_for": ["all"] },
  { "phase": "onboarding", "key": "property_name", "label": "Property name set", "required_for": ["all"] },
  { "phase": "onboarding", "key": "rooms_configured", "label": "Room types added", "required_for": ["accommodation", "hybrid"] },
  { "phase": "onboarding", "key": "venue_capacity", "label": "Venue capacity set", "required_for": ["venue", "hybrid"] }
]
```

---

## File Changes Summary

### New Files (23)
| File | Description |
|------|-------------|
| `src/components/onboarding/PreFlightWizard.tsx` | Pre-contract intent wizard |
| `src/pages/AdminPreFlight.tsx` | Pre-flight wizard page |
| `src/pages/AdminReviewQueue.tsx` | Admin review queue page |
| `src/components/property/QualityGateIndicator.tsx` | Visual quality gate status |
| `src/components/property/ReviewActionPanel.tsx` | Admin review actions |
| `src/components/property/ProgressDashboard.tsx` | Owner progress dashboard |
| `src/hooks/usePropertyProgress.ts` | Progress calculation hook |
| `supabase/functions/check-activation-readiness/index.ts` | Quality gate checks |
| `supabase/functions/generate-checklist/index.ts` | Checklist generation |
| `supabase/functions/post-launch-validator/index.ts` | Post-activation validation |
| `supabase/functions/send-activation-notification/index.ts` | Owner notification |

### Modified Files (12)
| File | Changes |
|------|---------|
| `src/config/onboardingFieldSchema.ts` | Intent types, completion states, field impact levels |
| `src/hooks/usePropertyOnboarding.tsx` | Roadmap, checklist, auto-verify integration |
| `src/components/onboarding/PropertyOnboardingWizard.tsx` | Dynamic steps, completion hints |
| `src/pages/PropertyOverview.tsx` | Quality gate integration, activation flow, notifications, post-launch validation |
| `src/pages/PropertyForm.tsx` | Review mode, status indicators |
| `supabase/functions/send-owner-contract/index.ts` | Intent/model storage |
| `supabase/functions/process-signature/index.ts` | Roadmap generation, status updates |

---

## Testing Strategy

### Unit Tests
- Quality gate check functions
- Score calculation
- Intent-based step filtering

### Integration Tests
- Full contract → onboarding → activation flow
- Quality gate blocking scenarios
- Checklist auto-verification

### E2E Tests
- Owner self-service journey
- Admin review and override flow

---

## Rollout Plan

1. **Week 1-2**: Database migrations, Pre-flight wizard (internal testing)
2. **Week 3-4**: Contract enhancements, Dynamic wizard (beta with select properties)
3. **Week 5-6**: Quality gate, Review system (admin preview)
4. **Week 7-8**: Activation flow, Progress dashboard (full rollout)

---

## Success Metrics

- 80% of new listings complete onboarding within 7 days
- 50% reduction in admin review time
- 100% of activated properties pass quality gate
- Owner satisfaction score > 4.5/5
