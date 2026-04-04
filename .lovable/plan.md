

# Security Scan Remediation

## Findings Summary & Actions

| # | Finding | Action |
|---|---------|--------|
| 1 | **Contracts/Signatures storage buckets — anon write** | **Fix**: Tighten policies to `service_role` + admin/dev authenticated |
| 2 | **html2pdf.js critical/high vulnerabilities** | **Ignore**: No user-supplied content passes through html2pdf — only system-generated invoices/PDFs. Upgrading would require a full library swap with no drop-in replacement. |
| 3 | **Journal XSS via dangerouslySetInnerHTML** | **Ignore (false positive)**: `PublicJournals.tsx` already uses `DOMPurify.sanitize()` with a strict allowlist (lines 191-194). The finding is outdated. |
| 4 | **Experience vouchers — public INSERT/UPDATE** | **Fix**: Restrict INSERT and UPDATE to `service_role` only. Edge functions already use service role key. SELECT stays public (needed for code redemption lookup). |
| 5 | **Extension in public schema** | **Ignore**: `btree_gist` is required in public for GiST indexes. Moving it would break existing indexes and is a Supabase platform limitation. |
| 6 | **RLS Enabled No Policy** | **Ignore (info-level)**: These are system/internal tables where RLS is enabled as a safeguard but no client access is needed. |

## Implementation

### Migration 1 — Tighten `experience_vouchers` policies

```sql
-- Drop permissive INSERT/UPDATE policies
DROP POLICY IF EXISTS "System can create vouchers" ON public.experience_vouchers;
DROP POLICY IF EXISTS "System can update vouchers" ON public.experience_vouchers;

-- Recreate for service_role only (edge functions use service role key)
CREATE POLICY "Service role can create vouchers"
  ON public.experience_vouchers FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "Service role can update vouchers"
  ON public.experience_vouchers FOR UPDATE
  TO service_role USING (true);
```

### Migration 2 — Tighten storage bucket policies

```sql
-- Fix contracts bucket: restrict to service_role + authenticated admins/devs
DROP POLICY IF EXISTS "Service role can manage contracts" ON storage.objects;
CREATE POLICY "Service role can manage contracts"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'contracts')
  WITH CHECK (bucket_id = 'contracts');

CREATE POLICY "Admins can manage contracts"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'contracts'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'dev')
      OR public.has_role(auth.uid(), 'fearless_leader')
    )
  )
  WITH CHECK (
    bucket_id = 'contracts'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'dev')
      OR public.has_role(auth.uid(), 'fearless_leader')
    )
  );

-- Same pattern for signatures bucket
DROP POLICY IF EXISTS "Service role can manage signatures" ON storage.objects;
CREATE POLICY "Service role can manage signatures"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'signatures')
  WITH CHECK (bucket_id = 'signatures');

CREATE POLICY "Admins can manage signatures"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'signatures'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'dev')
      OR public.has_role(auth.uid(), 'fearless_leader')
    )
  )
  WITH CHECK (
    bucket_id = 'signatures'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'dev')
      OR public.has_role(auth.uid(), 'fearless_leader')
    )
  );
```

### Security finding updates

After migrations, mark findings appropriately:
- **Delete** `contracts_storage_anon_write` (fixed)
- **Delete** `vouchers_public_write` (fixed)
- **Ignore** `journal_xss_risk` — already sanitized with DOMPurify
- **Ignore** `vulnerable_dependencies_critical` + `vulnerable_dependencies_high` — html2pdf only processes system-generated content, no user input passes through; no drop-in upgrade available
- **Ignore** `SUPA_extension_in_public` — btree_gist required in public schema for GiST indexes
- **Ignore** `SUPA_rls_enabled_no_policy` — info-level, internal tables with no client access

### No code changes needed
All fixes are database-level policy changes. No application code is affected.

