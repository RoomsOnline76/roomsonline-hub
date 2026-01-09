-- Allow public read access to pms_tracker_status for property filtering
-- This is NOT sensitive data - just configuration about which PMS integrations are active

CREATE POLICY "Public can read active PMS systems" 
ON public.pms_tracker_status
FOR SELECT 
USING (true);