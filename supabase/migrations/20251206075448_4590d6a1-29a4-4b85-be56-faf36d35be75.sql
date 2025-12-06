-- access_requests table
DROP POLICY IF EXISTS "Admins can update access requests" ON public.access_requests;
DROP POLICY IF EXISTS "Admins can view access requests" ON public.access_requests;

CREATE POLICY "Admins and devs can update access requests" 
ON public.access_requests FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Admins and devs can view access requests" 
ON public.access_requests FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- booking_sync_status table
DROP POLICY IF EXISTS "Admins can view all booking sync status" ON public.booking_sync_status;

CREATE POLICY "Admins and devs can view all booking sync status" 
ON public.booking_sync_status FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- checkfront_connections table
DROP POLICY IF EXISTS "Admins can manage checkfront connections" ON public.checkfront_connections;

CREATE POLICY "Admins and devs can manage checkfront connections" 
ON public.checkfront_connections FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- pms_availability_cache table
DROP POLICY IF EXISTS "Admins can manage availability cache" ON public.pms_availability_cache;

CREATE POLICY "Admins and devs can manage availability cache" 
ON public.pms_availability_cache FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- pms_mappings table
DROP POLICY IF EXISTS "Admins can manage pms mappings" ON public.pms_mappings;

CREATE POLICY "Admins and devs can manage pms mappings" 
ON public.pms_mappings FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- pms_rate_types_cache table
DROP POLICY IF EXISTS "Admins can manage rate types cache" ON public.pms_rate_types_cache;

CREATE POLICY "Admins and devs can manage rate types cache" 
ON public.pms_rate_types_cache FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- pms_reservations table
DROP POLICY IF EXISTS "Admins can manage pms reservations" ON public.pms_reservations;

CREATE POLICY "Admins and devs can manage pms reservations" 
ON public.pms_reservations FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- pms_room_types_cache table
DROP POLICY IF EXISTS "Admins can manage room types cache" ON public.pms_room_types_cache;

CREATE POLICY "Admins and devs can manage room types cache" 
ON public.pms_room_types_cache FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- profiles table (uses direct user_roles check, need to update)
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins and devs can delete profiles" 
ON public.profiles FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Admins and devs can view all profiles" 
ON public.profiles FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- property_availability table
DROP POLICY IF EXISTS "Admins can manage all availability" ON public.property_availability;

CREATE POLICY "Admins and devs can manage all availability" 
ON public.property_availability FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- property_rates table
DROP POLICY IF EXISTS "Admins can manage all rates" ON public.property_rates;

CREATE POLICY "Admins and devs can manage all rates" 
ON public.property_rates FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- sync_logs table
DROP POLICY IF EXISTS "Admins can view all sync logs" ON public.sync_logs;

CREATE POLICY "Admins and devs can view all sync logs" 
ON public.sync_logs FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- user_roles table
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Admins and devs can manage all roles" 
ON public.user_roles FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));