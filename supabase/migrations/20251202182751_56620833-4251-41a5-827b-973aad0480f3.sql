-- Remove overly permissive INSERT and UPDATE policies on booking_sync_status
-- Edge functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS anyway
DROP POLICY IF EXISTS "System can insert booking sync status" ON booking_sync_status;
DROP POLICY IF EXISTS "System can update booking sync status" ON booking_sync_status;