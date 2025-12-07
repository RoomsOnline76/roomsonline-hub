-- Fix RLS policies for other tables that depend on properties table check

-- pms_room_types_cache
DROP POLICY IF EXISTS "Anyone can view room types for active properties" ON pms_room_types_cache;
CREATE POLICY "Anyone can view room types for active properties" 
ON pms_room_types_cache 
FOR SELECT 
USING (public.is_property_active(property_id));

-- pms_rate_types_cache  
DROP POLICY IF EXISTS "Anyone can view rate types for active properties" ON pms_rate_types_cache;
CREATE POLICY "Anyone can view rate types for active properties" 
ON pms_rate_types_cache 
FOR SELECT 
USING (public.is_property_active(property_id));

-- property_rates
DROP POLICY IF EXISTS "Anyone can view rates for active properties" ON property_rates;
CREATE POLICY "Anyone can view rates for active properties" 
ON property_rates 
FOR SELECT 
USING (public.is_property_active(property_id));

-- property_availability
DROP POLICY IF EXISTS "Anyone can view availability for active properties" ON property_availability;
CREATE POLICY "Anyone can view availability for active properties" 
ON property_availability 
FOR SELECT 
USING (public.is_property_active(property_id));