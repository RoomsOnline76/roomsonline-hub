
# Fix PayFast Signature - Uppercase Encoding & Passphrase Issue

## Root Cause Identified

After reviewing the official PayFast documentation and edge function logs, I found **two critical issues**:

### Issue 1: Uppercase Encoding Requirement

PayFast docs explicitly state (Step 2):
> "The resultant URL encoding must be in **upper case** (eg. http%3A%2F%2F), and spaces encoded as '+'."

JavaScript's `encodeURIComponent()` produces lowercase hex codes:
```text
Current:  https%3a%2f%2fsite.com  (lowercase - WRONG)
Required: https%3A%2F%2Fsite.com  (uppercase - CORRECT)
```

### Issue 2: Passphrase Length Mismatch

The logs show `Passphrase length: 23` but your screenshot shows the passphrase is `DawieCarikeSLPafrica247` which is **22 characters**. This suggests:
- A trailing space or newline was accidentally stored in the secret
- The extra character causes MD5 to produce a completely different hash

---

## Solution

### 1. Fix URL Encoding to Use Uppercase

Update the `pfUrlencode()` function to convert hex codes to uppercase:

```typescript
function pfUrlencode(val: string): string {
  // encodeURIComponent produces lowercase hex, PayFast requires uppercase
  return encodeURIComponent(val.trim())
    .replace(/%([0-9a-f]{2})/gi, (_, hex) => '%' + hex.toUpperCase())
    .replace(/%20/g, "+");
}
```

### 2. Trim Passphrase Before Use

Ensure no trailing whitespace affects the signature:

```typescript
const passphrase = (Deno.env.get("PAYFAST_PASSPHRASE") || "").trim();
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/payfast-api/index.ts` | Fix `pfUrlencode()` to produce uppercase hex codes; trim passphrase |

---

## Verification Steps

After deployment:
1. Check logs show signature input with uppercase encoding (`%3A` not `%3a`)
2. Check passphrase length is exactly 22 (matches your screenshot)
3. PayFast should return a valid UUID instead of "400 Bad Request"

---

## Technical Summary

The signature calculation now matches PayFast's PHP implementation exactly:
- PHP `urlencode()` produces uppercase hex codes
- Passphrase trimmed to remove any accidental whitespace
- Field order maintained per PayFast specification
