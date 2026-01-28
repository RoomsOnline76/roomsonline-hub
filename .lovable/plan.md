

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

## Phase 2: Pre-Flight Wizard (Week 2)

### 2.1 New Component: `PreFlightWizard.tsx`

**Location:** `src/components/onboarding/PreFlightWizard.tsx`

**Purpose:** Admin-only interface for defining listing intent before sending contracts

**Features:**
- Step 1: Listing Intent (accommodation, venue, hybrid, experience)
- Step 2: Commercial Model (commission, flat_fee, special)
- Step 3: PMS Readiness (none, planned, connected, live)
- Step 4: Review and confirm (shows downstream requirements)
- Creates property in `draft_pre_contract` status

**Technical Implementation:**
```typescript
interface PreFlightData {
  listing_intent: 'accommodation' | 'venue' | 'hybrid' | 'experience';
  commercial_model: 'commission' | 'flat_fee' | 'special';
  pms_readiness: 'none' | 'planned' | 'connected' | 'live';
  owner_email: string;
  owner_name?: string;
}
```

### 2.2 New Route: `/admin/properties/new/preflight`

**File to modify:** `src/App.tsx`

Add route for PreFlightWizard component with admin-only access.

### 2.3 Update: PropertyOverview.tsx

Add "Start New Listing" button that navigates to the PreFlight Wizard instead of directly creating a property.

---

## Phase 3: Intent-Aware Contract System (Week 3)

### 3.1 Update: `send-owner-contract` Edge Function

**File:** `supabase/functions/send-owner-contract/index.ts`

**Enhancements:**
- Accept `listing_intent` and `commercial_model` parameters
- Store metadata in owner_contracts record
- Select template based on intent/model combination
- Update property `listing_status` to `contract_sent`

```typescript
// Add to request body handling
const { owner_email, owner_name, listing_intent, commercial_model } = await req.json();

// Store in contract metadata
metadata: {
  listing_intent,
  commercial_model,
  expected_steps: getStepsForIntent(listing_intent),
  min_requirements: getRequirementsForIntent(listing_intent)
}
```

### 3.2 Update: `process-signature` Edge Function

**File:** `supabase/functions/process-signature/index.ts`

**Enhancements:**
- Update property `listing_status` to `contract_signed`
- Generate onboarding roadmap based on intent
- Create initial checklist items

```typescript
// After successful signing
await supabase.from('properties')
  .update({ listing_status: 'contract_signed' })
  .eq('owner_email', contract.owner_email);

// Generate roadmap
await generateOnboardingRoadmap(propertyId, contract.metadata);

// Create checklist
await generatePropertyChecklist(propertyId, contract.metadata.listing_intent);
```

### 3.3 New Edge Function: `generate-checklist`

**File:** `supabase/functions/generate-checklist/index.ts`

**Purpose:** Creates intent-specific checklist items from master template

**Implementation:**
- Load master checklist template from config
- Filter items by listing_intent
- Insert into property_checklist table

---

## Phase 4: Dynamic Onboarding Wizard (Week 4)

### 4.1 Update: `onboardingFieldSchema.ts`

**File:** `src/config/onboardingFieldSchema.ts`

**Enhancements:**
- Add intent-based step filtering
- Define conditional requirements per intent

```typescript
export function getWizardStepsForIntent(intent: string): WizardSection[] {
  const baseSteps = ['property_identity', 'contact_details', 'location'];
  
  switch (intent) {
    case 'accommodation':
      return [...baseSteps, 'rooms_overview', 'policies_pricing', 'facilities', 'media_documents', 'guest_experience', 'review'];
    case 'venue':
      return [...baseSteps, 'capacity', 'event_types', 'facilities', 'media_documents', 'guest_experience', 'review'];
    case 'experience':
      return [...baseSteps, 'experience_details', 'logistics', 'media_documents', 'review'];
    default:
      return WIZARD_SECTIONS;
  }
}

export const COMPLETION_STATES = {
  INCOMPLETE: { min: 0, max: 49, label: 'Needs Work', blocked: true },
  REVIEWABLE: { min: 50, max: 69, label: 'Ready for Review', blocked: false },
  ELIGIBLE: { min: 70, max: 84, label: 'Activation Eligible', blocked: false },
  SHOWCASE_READY: { min: 85, max: 100, label: 'Showcase Ready', blocked: false }
};
```

### 4.2 Update: `PropertyOnboardingWizard.tsx`

**File:** `src/components/onboarding/PropertyOnboardingWizard.tsx`

**Enhancements:**
- Load roadmap on mount to determine steps
- Show "Why this matters" hints per step
- Display real-time completion state (not just percentage)
- Add "Missing fields by impact level" section

### 4.3 Update: `usePropertyOnboarding.tsx`

**File:** `src/hooks/usePropertyOnboarding.tsx`

**Enhancements:**
- Add roadmap loading
- Implement getCompletionState() function
- Auto-update checklist items on field completion
- Update property status to `onboarding_active` when wizard starts

---

## Phase 5: Quality Gate System (Week 5)

### 5.1 New Edge Function: `check-activation-readiness`

**File:** `supabase/functions/check-activation-readiness/index.ts`

**Purpose:** Run comprehensive readiness checks before activation

**Implementation:**
```typescript
const QUALITY_CHECKS = [
  { id: 'contract', name: 'Valid Contract', check: checkContractValid },
  { id: 'content', name: 'Content Complete', check: checkContentCompleteness },
  { id: 'media', name: 'Media Requirements', check: checkMediaRequirements },
  { id: 'commercial', name: 'Commercial Fields', check: checkCommercialFields },
  { id: 'pms', name: 'PMS Conflicts', check: checkPMSConflicts }
];

// Each check returns:
interface QualityCheckResult {
  id: string;
  passed: boolean;
  message?: string;
  fix?: string;
  field?: string;
}
```

### 5.2 New Component: `QualityGateIndicator.tsx`

**Location:** `src/components/property/QualityGateIndicator.tsx`

**Purpose:** Visual indicator showing activation readiness

**Features:**
- Color-coded status (green/yellow/red)
- Expandable blocker list
- Direct links to problem fields
- "Re-run checks" button

### 5.3 Update: `PropertyOverview.tsx`

**File:** `src/pages/PropertyOverview.tsx`

**Enhancements:**
- Disable `show_on_website` toggle if quality gate fails
- Show QualityGateIndicator inline with toggle
- Add tooltip explaining blockers

---

## Phase 6: Admin Review System (Week 6)

### 6.1 New Page: `AdminReviewQueue.tsx`

**Location:** `src/pages/AdminReviewQueue.tsx`
**Route:** `/admin/review-queue`

**Features:**
- List properties by status (review_pending, activation_ready)
- Show completion score, intent type, blocker count
- Filter by status, intent, owner
- Quick actions: Approve, Request Fixes, Override

### 6.2 Update: `PropertyForm.tsx`

**File:** `src/pages/PropertyForm.tsx`

**Enhancements:**
- Tab headers show completion status (checkmark/warning icons)
- Add "Review Mode" banner when status is review_pending
- Add review action buttons in header
- Integrate AI-powered inconsistency detection

### 6.3 New Component: `ReviewActionPanel.tsx`

**Location:** `src/components/property/ReviewActionPanel.tsx`

**Purpose:** Admin actions for property review

**Actions:**
- **Approve**: Sets status to `activation_ready`, triggers quality gate
- **Request Fixes**: Sets status to `onboarding_active`, sends revision email
- **Override**: Sets status to `activation_ready` with override reason logged

---

## Phase 7: Enhanced Activation Flow (Week 7)

### 7.1 Update: `PropertyOverview.tsx` Activation Handler

**Enhanced Flow:**
1. Run quality gate via edge function
2. If passed: Update database, refresh caches, notify owner
3. Log activation with pre-activation score
4. Trigger post-launch validation scheduling

```typescript
const handleActivation = async (propertyId: string) => {
  // Run quality gate
  const { data: qualityResult } = await supabase.functions.invoke('check-activation-readiness', {
    body: { property_id: propertyId }
  });
  
  if (!qualityResult.passed) {
    showBlockers(qualityResult.blockers);
    return;
  }
  
  // Update property
  await supabase.from('properties').update({
    show_on_website: true,
    listing_status: 'live',
    activated_at: new Date().toISOString(),
    activated_by: user.id
  }).eq('id', propertyId);
  
  // Log activation
  await supabase.from('property_activation_logs').insert({
    property_id: propertyId,
    activated_at: new Date().toISOString(),
    activated_by: user.id,
    pre_activation_score: qualityResult.score,
    quality_gate_results: qualityResult
  });
  
  // Notify owner
  await supabase.functions.invoke('send-activation-notification', {
    body: { property_id: propertyId }
  });
};
```

### 7.2 New Edge Function: `post-launch-validator`

**File:** `supabase/functions/post-launch-validator/index.ts`

**Purpose:** Scheduled validation after properties go live

**Checks:**
- Search visibility (property appears in /book queries)
- Booking flow test (can initiate booking)
- PMS sync status (if connected)
- Error monitoring (recent errors)

**Scheduling:** Run 1 hour after activation, then daily for 7 days

---

## Phase 8: Progress Dashboard & Polish (Week 8)

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
| File | Purpose |
|------|---------|
| `src/components/onboarding/PreFlightWizard.tsx` | Phase 0 intent locking |
| `src/components/property/ProgressDashboard.tsx` | Progress visualization |
| `src/components/property/QualityGateIndicator.tsx` | Activation readiness |
| `src/components/property/PropertyChecklist.tsx` | Interactive checklist |
| `src/components/property/ReviewActionPanel.tsx` | Admin review actions |
| `src/components/property/PostLaunchMonitor.tsx` | Health monitoring |
| `src/pages/AdminReviewQueue.tsx` | Review queue page |
| `src/hooks/usePropertyProgress.ts` | Progress calculation |
| `src/hooks/usePropertyChecklist.ts` | Checklist management |
| `src/hooks/useQualityGate.ts` | Quality gate checks |
| `src/config/listing-intents.json` | Intent definitions |
| `src/config/quality-gates.json` | Gate requirements |
| `src/config/checklist-templates/master.json` | Checklist items |
| `supabase/functions/generate-checklist/index.ts` | Checklist generation |
| `supabase/functions/check-activation-readiness/index.ts` | Quality gate |
| `supabase/functions/post-launch-validator/index.ts` | Post-activation checks |
| `supabase/functions/send-activation-notification/index.ts` | Activation emails |
| `supabase/functions/calculate-progress/index.ts` | Progress calculation |
| 5 database migrations | Schema updates |

### Modified Files (15)
| File | Changes |
|------|---------|
| `src/App.tsx` | New routes |
| `src/config/onboardingFieldSchema.ts` | Intent-aware steps |
| `src/hooks/usePropertyOnboarding.tsx` | Enhanced progress |
| `src/components/onboarding/PropertyOnboardingWizard.tsx` | Dynamic steps |
| `src/pages/PropertyOverview.tsx` | Quality gate integration |
| `src/pages/PropertyForm.tsx` | Review mode |
| `src/pages/AdminContracts.tsx` | Pre-flight integration |
| `supabase/functions/send-owner-contract/index.ts` | Intent metadata |
| `supabase/functions/process-signature/index.ts` | Status updates |
| `supabase/config.toml` | New functions |
| `docs/property-listing-process.md` | Updated documentation |

---

## Success Metrics

1. **Reduction in support tickets** - Track tickets related to listing process
2. **Increase in completion rate** - Properties reaching 'live' status
3. **Decrease in time-to-live** - Days from contract to activation
4. **Improvement in data quality** - Scores at activation
5. **Owner satisfaction** - Post-onboarding survey scores

---

## Testing Requirements

### Test Scenarios
1. New accommodation listing (full commission model, no PMS)
2. Existing owner adding venue (hybrid model)
3. PMS-connected property import
4. Admin override scenario
5. Post-launch issue detection

### Acceptance Criteria
- No property can reach 'live' without passing quality gate
- Every property has clear "next action" at all times
- Admin can identify blockers in < 30 seconds
- Owner can complete onboarding without email support
- System prevents contradictory data

---

## Rollout Plan

1. **Week 1-8**: Development phases as described
2. **Week 9**: Internal testing with 5 test properties
3. **Week 10**: Admin team training
4. **Week 11**: Soft launch (new properties only)
5. **Week 12**: Migrate existing in-progress properties
6. **Ongoing**: Monitor metrics, iterate on feedback

