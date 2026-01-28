

# AI-Assisted Testing System Implementation Plan

## Overview

This plan implements a comprehensive AI-assisted testing framework for the RoomsOnline platform. The system combines AI-powered test scenario generation with Playwright-based execution, following the architectural principle: **"AI generates what to test; Playwright executes how to test it."**

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI-ASSISTED TESTING SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌────────────────────┐    ┌─────────────────────┐    ┌────────────────┐  │
│   │  AI SCENARIO       │───▶│  TEST EXECUTION     │───▶│  RESULTS       │  │
│   │  GENERATOR         │    │  ENGINE             │    │  DASHBOARD     │  │
│   │                    │    │                     │    │                │  │
│   │  - Lovable AI      │    │  - Edge Function    │    │  - test_runs   │  │
│   │  - gemini-3-flash  │    │  - Supabase Client  │    │  - test_logs   │  │
│   │  - Prompt Template │    │  - API Verification │    │  - JSON Output │  │
│   └────────────────────┘    └─────────────────────┘    └────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    INVARIANT ENFORCEMENT LAYER                       │  │
│   │                                                                       │  │
│   │   ✓ RULE #1: Live PMS availability verification before booking       │  │
│   │   ✓ RLS Policy Enforcement (no unauthorized data access)             │  │
│   │   ✓ PMS Adapter Contract Compliance (adapter-contract.ts)            │  │
│   │   ✓ Encryption Verification (guest PII trigger check)                │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Tables

```sql
-- Test runs table (stores test execution sessions)
CREATE TABLE test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  feature_target TEXT NOT NULL,
  scenarios JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  summary JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Test logs table (stores individual test results)
CREATE TABLE test_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'skip', 'error')),
  duration_ms INTEGER,
  assertions JSONB NOT NULL DEFAULT '[]',
  error_message TEXT,
  error_stack TEXT,
  request_data JSONB,
  response_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_test_runs_status ON test_runs(status);
CREATE INDEX idx_test_runs_created_at ON test_runs(created_at DESC);
CREATE INDEX idx_test_logs_run_id ON test_logs(run_id);
CREATE INDEX idx_test_logs_status ON test_logs(status);

-- RLS Policies (dev-only access)
ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dev users can manage test runs"
  ON test_runs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'dev'))
  WITH CHECK (has_role(auth.uid(), 'dev'));

CREATE POLICY "Dev users can manage test logs"
  ON test_logs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'dev'))
  WITH CHECK (has_role(auth.uid(), 'dev'));
```

---

## Navigation Update

### File: `src/config/navigation.ts`

Add new navigation items to the System Control section:

| ID | Title | Icon | Route | Min Role |
|----|-------|------|-------|----------|
| `ai-testing` | AI Testing | `FlaskConical` | `/dev/testing` | `dev` |

---

## New Files

### 1. Frontend Page: `src/pages/DevTesting.tsx`

**Purpose:** Main dashboard for AI-Assisted Testing

**Features:**
- Test scenario generator with feature selector
- Test execution controls (run, stop, clear)
- Real-time test progress display
- Results dashboard with pass/fail/skip counts
- Expandable test log viewer
- JSON export capability

**UI Components:**
- Feature selector dropdown (booking flow, PMS sync, RLS validation, etc.)
- AI scenario generation panel with editable prompt preview
- Test run history table
- Live test execution status cards
- Detailed log viewer with assertions

---

### 2. Edge Function: `supabase/functions/generate-test-scenarios/index.ts`

**Purpose:** AI-powered test scenario generation using Lovable AI

**Implementation:**
```typescript
// Uses Lovable AI Gateway with google/gemini-3-flash-preview
// Generates structured test scenarios based on:
// - Feature target (e.g., "benson_booking_flow")
// - System invariants (RULE #1, RLS, etc.)
// - Edge cases and failure modes

// Output format:
interface TestScenario {
  id: string;
  name: string;
  category: 'happy_path' | 'edge_case' | 'security' | 'invariant';
  description: string;
  steps: TestStep[];
  expected_outcome: string;
  assertions: Assertion[];
}
```

**Prompt Template Variables:**
- `{feature}` - Target feature name
- `{invariants}` - System rules to enforce (RULE #1, etc.)
- `{context}` - Additional context (PMS type, property data)

---

### 3. Edge Function: `supabase/functions/execute-test-run/index.ts`

**Purpose:** Execute generated test scenarios against real APIs

**Implementation:**
```typescript
// Executes scenarios sequentially with:
// - API calls to edge functions (benson-api, push-booking, etc.)
// - Database queries via Supabase client
// - Assertion evaluation
// - Result logging to test_logs table

// Key invariant checks:
// 1. RULE #1 - Verify PMS was called before booking creation
// 2. RLS - Verify queries only return authorized data
// 3. Encryption - Verify guest PII triggers encryption
```

**Safety Measures:**
- Read-only database operations except for test_runs/test_logs
- Sandboxed API calls (no real bookings created)
- Timeout enforcement (30s per scenario)
- Error isolation (one failure doesn't stop run)

---

### 4. Test Results Component: `src/components/testing/TestResultsPanel.tsx`

**Purpose:** Display test execution results with detailed logs

**Features:**
- Summary cards (total, passed, failed, skipped)
- Filterable results table
- Expandable assertion details
- Error message display
- Duration tracking
- Export to JSON

---

### 5. Scenario Generator Component: `src/components/testing/ScenarioGenerator.tsx`

**Purpose:** UI for generating and editing test scenarios

**Features:**
- Feature target selector
- AI generation trigger
- Scenario preview/edit
- Invariant checklist
- Custom scenario input

---

## Feature Targets

The system supports testing the following features:

| Feature ID | Description | Key Invariants |
|------------|-------------|----------------|
| `booking_flow` | End-to-end booking creation | RULE #1, PMS sync, encryption |
| `benson_api` | Benson PMS adapter | Adapter contract, availability |
| `hostfully_api` | Hostfully PMS adapter | OAuth, building import |
| `rls_validation` | Row-level security | Policy enforcement |
| `contract_signing` | Contract workflow | Signature validation |
| `pms_sync` | Rate/availability sync | Cache invalidation |
| `guest_encryption` | PII encryption | Trigger verification |

---

## Invariant Enforcement

### RULE #1 Verification

```typescript
// In execute-test-run edge function:
async function verifyRule1Compliance(bookingId: string): Promise<AssertionResult> {
  // Check sync_logs for availability fetch BEFORE booking creation
  const { data: syncLogs } = await supabase
    .from('sync_logs')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('sync_type', 'availability_check')
    .order('created_at', { ascending: true });
  
  const { data: booking } = await supabase
    .from('bookings')
    .select('created_at')
    .eq('id', bookingId)
    .single();
  
  // Verify availability was checked before booking creation
  const availabilityCheckedFirst = syncLogs?.some(
    log => new Date(log.created_at) < new Date(booking.created_at)
  );
  
  return {
    name: 'RULE #1: PMS availability verified before booking',
    passed: availabilityCheckedFirst,
    expected: 'Availability check timestamp < booking creation timestamp',
    actual: availabilityCheckedFirst ? 'Compliant' : 'Violation detected',
  };
}
```

### RLS Policy Verification

```typescript
// Verify queries respect RLS boundaries
async function verifyRLSEnforcement(
  tableName: string, 
  userId: string
): Promise<AssertionResult> {
  // Attempt cross-user data access (should fail)
  const { data, error } = await supabaseWithRole('anon')
    .from(tableName)
    .select('*')
    .neq('user_id', userId)
    .limit(1);
  
  return {
    name: `RLS: ${tableName} prevents unauthorized access`,
    passed: data?.length === 0 || error?.code === 'PGRST301',
    expected: 'No unauthorized rows returned',
    actual: data?.length === 0 ? 'Compliant' : 'RLS violation',
  };
}
```

---

## Implementation Order

### Phase 1: Foundation (Database + Navigation)
1. Create test_runs and test_logs tables with RLS
2. Add navigation item to System Control section
3. Create basic DevTesting.tsx page skeleton

### Phase 2: AI Scenario Generation
1. Create generate-test-scenarios edge function
2. Implement prompt template system
3. Build ScenarioGenerator component
4. Connect to Lovable AI Gateway

### Phase 3: Test Execution Engine
1. Create execute-test-run edge function
2. Implement invariant checkers (RULE #1, RLS)
3. Build assertion evaluation system
4. Add result logging to test_logs

### Phase 4: Results Dashboard
1. Create TestResultsPanel component
2. Add real-time progress updates
3. Implement log filtering and search
4. Add JSON export capability

### Phase 5: Integration
1. Wire up all components in DevTesting page
2. Add test run history view
3. Implement run comparison
4. Add audit logging for test executions

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/XXX_create_test_tables.sql` | Create | Test runs and logs tables |
| `src/config/navigation.ts` | Modify | Add AI Testing nav item |
| `src/App.tsx` | Modify | Add DevTesting route |
| `src/pages/DevTesting.tsx` | Create | Main testing dashboard |
| `src/components/testing/ScenarioGenerator.tsx` | Create | AI scenario generator UI |
| `src/components/testing/TestResultsPanel.tsx` | Create | Results display component |
| `src/components/testing/TestLogViewer.tsx` | Create | Detailed log viewer |
| `src/components/testing/index.ts` | Create | Component exports |
| `supabase/functions/generate-test-scenarios/index.ts` | Create | AI scenario generation |
| `supabase/functions/execute-test-run/index.ts` | Create | Test execution engine |
| `supabase/config.toml` | Modify | Add new edge functions |

---

## Security Considerations

1. **Dev-Only Access:** All testing functionality restricted to `dev` role via RLS
2. **No Production Data Mutation:** Test execution uses read-only queries or dedicated test data
3. **API Key Isolation:** Tests use existing PMS credentials (sandbox mode when available)
4. **Audit Trail:** All test runs logged with user identity and timestamps
5. **Sandboxed Execution:** No real bookings created during tests

---

## Expected Outcome

After implementation:
- Developers can generate comprehensive test scenarios with AI assistance
- Test execution validates system invariants (RULE #1, RLS, encryption)
- Results are stored and viewable in a structured dashboard
- All tests are logged for audit and debugging purposes
- The system prevents regression in critical security and business rules

