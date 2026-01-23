

# Fix Password Reset "Verification Failed" Error

## Root Cause Analysis

The password reset flow is failing because of a **Supabase Auth redirect URL configuration mismatch**:

| Component | Current Setting |
|-----------|----------------|
| Edge Functions redirect URL | `https://sleepinafrica.roomsonline.co.za/auth` ✓ |
| Supabase Auth Site URL | Likely set to `roomsonline-hub.lovable.app` |
| Supabase Auth Redirect URLs | Missing `sleepinafrica.roomsonline.co.za` |

When the password reset link is clicked:
1. Supabase validates the redirect URL in the link
2. If `sleepinafrica.roomsonline.co.za` is not in the allowed redirect URLs, Supabase either:
   - Rejects the redirect and falls back to the Site URL
   - Invalidates the token during the redirect process

---

## The Fix

This is a **configuration change** in Lovable Cloud (Supabase Auth settings), not a code change.

### Step 1: Add Allowed Redirect URLs

In Lovable Cloud Dashboard → Auth Settings, add these redirect URLs:

```text
https://sleepinafrica.roomsonline.co.za/auth
https://sleepinafrica.roomsonline.co.za/**
```

### Step 2: Verify Site URL

Ensure the Site URL is set to:
```text
https://sleepinafrica.roomsonline.co.za
```

---

## How to Access Auth Settings

You'll need to open the Lovable Cloud Dashboard to configure the authentication redirect URLs.

---

## Why This Happens

Lovable Cloud automatically sets redirect URLs to the preview URL (`roomsonline-hub.lovable.app`). When you have a custom domain (`sleepinafrica.roomsonline.co.za`), you need to manually add it to the allowed redirect URLs list.

The password reset emails contain links like:
```
https://[supabase-project].supabase.co/auth/v1/verify?token=xxx&redirect_to=https://sleepinafrica.roomsonline.co.za/auth
```

If `sleepinafrica.roomsonline.co.za` is not in the allowed list, the token verification fails.

---

## After Configuration

Once the redirect URLs are configured:
1. Generate new password reset emails for affected users
2. The new links will work correctly
3. Old links (already sent) will still fail - users need fresh reset emails

---

## No Code Changes Required

The edge functions are correctly configured. This is purely an auth settings configuration issue.

