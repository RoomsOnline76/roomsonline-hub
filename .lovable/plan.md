
# Fix Hostfully API Key Validation - Sandbox Environment Detection

## Problem

When connecting an owner using the Hostfully API key, the system shows **"Hostfully API key is invalid or expired"** even though the key is valid.

### Root Cause

The API key `EJOnIxlU7yrLbmNp` is a **sandbox API key** that only works with the Hostfully sandbox environment (`https://sandbox.hostfully.com/api/v3`).

However, the `OwnerPMSConnectionCard` component **hardcodes** the environment to `production`:

```typescript
// Line 59 in OwnerPMSConnectionCard.tsx
const environment = 'production'; // Always production for owners
```

This causes the validation request to go to the production API, which rejects the sandbox key with a 401 Unauthorized error.

| Test | Environment | Result |
|------|-------------|--------|
| API key validation | `production` | 401 - "invalid or expired" |
| API key validation | `sandbox` | 200 - Success, agency found |

---

## Solution

Auto-detect sandbox owners based on their name or email containing "sandbox", similar to how sandbox properties are detected.

### Part 1: Auto-detect Environment in OwnerPMSConnectionCard

Update the environment detection logic to check the owner name/email:

```typescript
// Detect sandbox from owner name or email
const isSandboxOwner = ownerName?.toLowerCase().includes('sandbox') || 
                       ownerEmail?.toLowerCase().includes('sandbox');
const environment = isSandboxOwner ? 'sandbox' : 'production';
```

### Part 2: Respect Existing Credential Environment

If an existing credential has an environment set, use that:

```typescript
// Use existing credential's environment or detect from owner
const environment = existingCredential?.environment || 
  (ownerName?.toLowerCase().includes('sandbox') || ownerEmail?.toLowerCase().includes('sandbox') 
    ? 'sandbox' 
    : 'production');
```

### Part 3: Show Environment Badge in UI

Add a visual indicator so users know which environment is being used:

```tsx
{environment === 'sandbox' && (
  <Badge variant="outline" className="text-xs">Sandbox</Badge>
)}
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/pms/OwnerPMSConnectionCard.tsx` | 1. Auto-detect environment from owner name/email 2. Respect existing credential environment 3. Add sandbox badge to UI |

---

## Data Flow After Fix

```text
Owner: "Hostfully SandBox"
Email: "marketing@fluent.sandbox.co.za"
                    │
                    ▼
            ┌───────────────────┐
            │  Detect Sandbox   │
            │  (name/email)     │
            └───────────────────┘
                    │
                    ▼
            ┌───────────────────┐
            │  environment =    │
            │  "sandbox"        │
            └───────────────────┘
                    │
                    ▼
            ┌───────────────────────────────────────┐
            │  API Request to sandbox.hostfully.com │
            │  (instead of api.hostfully.com)       │
            └───────────────────────────────────────┘
                    │
                    ▼
            ┌───────────────────┐
            │  SUCCESS!         │
            │  Agency found     │
            └───────────────────┘
```

---

## Expected Result

After this fix:

| Owner Type | Environment Used | Result |
|------------|------------------|--------|
| "Hostfully SandBox" | `sandbox` | API key validates correctly |
| "ABC Hotels" | `production` | Production API used |
| Owner with existing `sandbox` credential | `sandbox` | Respects saved environment |

---

## Technical Notes

### Why This Happened

The original design assumed all owners use production. However, for testing and development:
- Sandbox owners are created with "sandbox" in their name
- Sandbox API keys only work with `sandbox.hostfully.com`

### Detection Logic

The detection mirrors the property sandbox detection in `PropertyForm.tsx`:

```typescript
const isSandboxProperty = formData.name?.includes('[SANDBOX]') || 
                          formData.name?.toLowerCase().includes('sandbox');
```

Now applied consistently at the owner level.
