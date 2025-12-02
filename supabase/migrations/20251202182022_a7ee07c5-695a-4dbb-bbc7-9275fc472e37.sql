-- Remove overly permissive INSERT policy on sync_logs
-- Edge functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS anyway
DROP POLICY IF EXISTS "System can insert sync logs" ON sync_logs;