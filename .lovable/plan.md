
# Fix PayFast Signature Mismatch Error

## Problem Identified

The edge function logs show:
```
signature: Generated signature does not match submitted signature.
```

The root cause is a **mismatch between signature generation and API submission**:

1. **Current (broken)**: Signature is generated from non-URL-encoded values, but the POST body uses URL-encoded values
2. **PayFast requirement**: Signature MUST be calculated from the exact same parameter string that gets submitted

## Technical Details

Current code flow:
```text
1. generateSignature() builds: "amount=3150.00&cancel_url=https://site.com/..."
   → Uses raw values with spaces replaced by +

2. paramString for POST builds: "amount=3150.00&cancel_url=https%3A%2F%2Fsite.com%2F..."
   → Uses encodeURIComponent()

3. PayFast receives URL-encoded values but signature was calculated from non-encoded values
   → MISMATCH!
```

PayFast's official PHP example shows the correct approach:
```php
// dataToString uses urlencode for the param string
$pfOutput .= $key . '=' . urlencode( trim( $val ) ) . '&';
// Signature is generated from this SAME urlencode'd string
$data["signature"] = generateSignature($data, $passPhrase);
```

## Solution

Modify the signature generation to use URL-encoded values (matching what gets sent):

### Changes to `supabase/functions/payfast-api/index.ts`

1. **Update `generateSignature()` function** (lines 222-241):
   - Use `encodeURIComponent()` for values
   - Replace `%20` with `+` (PayFast's space encoding requirement)

```typescript
function generateSignature(data: Record<string, string>, passphrase?: string): string {
  const sortedKeys = Object.keys(data).sort();
  
  // Build param string WITH URL encoding (must match what we POST)
  // PayFast requires %20 to be replaced with + for spaces
  const paramString = sortedKeys
    .filter(key => data[key] !== "" && data[key] !== undefined && data[key] !== null)
    .map(key => `${key}=${encodeURIComponent(String(data[key]).trim()).replace(/%20/g, "+")}`)
    .join("&");
  
  // Add passphrase if provided (also URL-encoded)
  const stringToHash = passphrase && passphrase.length > 0
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`
    : paramString;
  
  console.log("[PayFast] Signature string for hashing:", paramString.substring(0, 200) + "...");
  
  return md5Hash(stringToHash);
}
```

2. **Update POST body construction** (lines 634-637) to match:
   - Ensure the encoding matches exactly what was used for signature generation

```typescript
// Build param string for onsite API - MUST match signature generation encoding
const paramString = Object.entries(formFields)
  .filter(([_, value]) => value !== "" && value !== undefined && value !== null)
  .sort(([a], [b]) => a.localeCompare(b)) // Sort alphabetically to match signature
  .map(([key, value]) => `${key}=${encodeURIComponent(String(value).trim()).replace(/%20/g, "+")}`)
  .join("&");
```

## Verification

After deployment, the logs should show:
- Signature string matches what gets POSTed
- PayFast returns a valid UUID instead of "400 Bad Request"
- Payment modal opens successfully

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/payfast-api/index.ts` | Fix signature generation to use URL-encoded values matching POST body |
