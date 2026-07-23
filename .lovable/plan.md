## Root cause

Two independent failures behind the cookbook links:

### 1. `book.sleepinafrica.roomsonline.co.za/embed/property/...` — `DEPLOYMENT_NOT_FOUND`
`curl -I` returns Vercel `x-vercel-error: DEPLOYMENT_NOT_FOUND`. The `book.` subdomain of `sleepinafrica.roomsonline.co.za` was never attached to the Vercel deployment / Cloudflare-for-SaaS fallback, so the "canonical" host in the cookbook doesn't actually resolve. The real canonical host that serves the app today is `sleepinafrica.roomsonline.co.za` (no `book.` prefix).

### 2. `book.rolos.co.za/embed/property/...` — "Property not found"
The SPA loads (Vercel 200), so routing works. The lookup fails at the DB. Testing the exact query anon runs:

```
GET /rest/v1/properties?slug=eq.fonteinhutte-self-catering-chalets&is_active=eq.true
→ {"code":"42501","message":"permission denied for function has_role"}
```

`public.properties` has permissive policies for admin/dev that call `public.has_role(...)`. `anon` doesn't have `EXECUTE` on `has_role`, so any anon `SELECT` on `properties` errors out — even though the separate "Anyone can view active properties" policy would otherwise allow it. Result: every anonymous embed page (property + portfolio) collapses to "not found". This is the same class of issue as the earlier `SUPA_anon_security_definer_function_executable` finding but on `properties`.

## Fix

**A. Restore anon access to `properties` (and any peer table with the same pattern)**

Migration:
1. Scope the admin/dev/owner policies on `public.properties` to `TO authenticated` (they currently target `public`, which forces anon to also evaluate `has_role`).
2. Keep "Anyone can view active properties" as-is (public, `is_active AND permanently_deleted_at IS NULL`).
3. Sweep sibling tables the embed reads anonymously (`hostfully_room_types`, `property_specials`, `property_packages`, `property_addons`, `property_announcements`, `rolos_rate_prices`, `rolos_seasons`, `property_billing_configs` where used for white-label host lookup) and apply the same `TO authenticated` scoping wherever an admin/owner policy references `has_role` at the top level.
4. Re-verify with an anon `curl` against `/rest/v1/properties?slug=eq...` before closing.

**B. Fix the cookbook canonical host**

`book.sleepinafrica.roomsonline.co.za` isn't provisioned. Two options — pick one:
- **Preferred:** update the cookbook + all snippet generators (`WidgetSetupWizard.tsx`, `EntryPointSelector.tsx`, `ElementorTab.tsx`, `PMSIntegrations.tsx`, `rolos-api-actions.ts`, WP blocks) so the canonical host is `https://sleepinafrica.roomsonline.co.za` (the host that is actually deployed and matches the project memory Core rule).
- **Alternative:** keep `book.sleepinafrica.roomsonline.co.za` in copy and add that hostname as a Vercel domain + Cloudflare-for-SaaS custom hostname pointing at the fallback. Requires DNS/Vercel work outside the code.

Recommend option 1 — it matches the existing "all links must use `sleepinafrica.roomsonline.co.za`" project memory rule and removes an unverified subdomain from public docs.

**C. Regenerate the Integrations Code Cookbook v2** with corrected canonical URLs for Fonteinhutte + Jongensfontein once A and B land, and verify both `/embed/property/fonteinhutte-self-catering-chalets` and `/embed/portfolio/jongensfontein` return real content anonymously.

## Verification

- `curl` the anon REST endpoint for `properties?slug=eq.fonteinhutte-self-catering-chalets&is_active=eq.true` → expect JSON row, not 42501.
- Load `https://sleepinafrica.roomsonline.co.za/embed/property/fonteinhutte-self-catering-chalets` in a private window → property renders.
- Load same path on `book.rolos.co.za` (white-label) → property renders.
- Run `supabase--linter` after the migration.

## Out of scope

No changes to booking logic, pricing, or PMS adapters. RLS wording stays functionally identical for admins/devs/owners — only the target role list is tightened so anon skips those policy quals.