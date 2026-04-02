
-- =============================================
-- 1. rolos_room_types: add fearless_leader
-- =============================================
DROP POLICY IF EXISTS "rolos_room_types_select" ON public.rolos_room_types;
DROP POLICY IF EXISTS "rolos_room_types_insert" ON public.rolos_room_types;
DROP POLICY IF EXISTS "rolos_room_types_update" ON public.rolos_room_types;
DROP POLICY IF EXISTS "rolos_room_types_delete" ON public.rolos_room_types;

CREATE POLICY "rolos_room_types_select" ON public.rolos_room_types FOR SELECT USING (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_room_types_insert" ON public.rolos_room_types FOR INSERT WITH CHECK (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_room_types_update" ON public.rolos_room_types FOR UPDATE USING (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_room_types_delete" ON public.rolos_room_types FOR DELETE USING (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

-- =============================================
-- 2. rolos_rooms: add fearless_leader
-- =============================================
DROP POLICY IF EXISTS "rolos_rooms_select" ON public.rolos_rooms;
DROP POLICY IF EXISTS "rolos_rooms_insert" ON public.rolos_rooms;
DROP POLICY IF EXISTS "rolos_rooms_update" ON public.rolos_rooms;
DROP POLICY IF EXISTS "rolos_rooms_delete" ON public.rolos_rooms;

CREATE POLICY "rolos_rooms_select" ON public.rolos_rooms FOR SELECT USING (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_rooms_insert" ON public.rolos_rooms FOR INSERT WITH CHECK (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_rooms_update" ON public.rolos_rooms FOR UPDATE USING (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_rooms_delete" ON public.rolos_rooms FOR DELETE USING (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

-- =============================================
-- 3. rolos_rate_plans: add fearless_leader
-- =============================================
DROP POLICY IF EXISTS "rolos_rate_plans_select" ON public.rolos_rate_plans;
DROP POLICY IF EXISTS "rolos_rate_plans_insert" ON public.rolos_rate_plans;
DROP POLICY IF EXISTS "rolos_rate_plans_update" ON public.rolos_rate_plans;
DROP POLICY IF EXISTS "rolos_rate_plans_delete" ON public.rolos_rate_plans;

CREATE POLICY "rolos_rate_plans_select" ON public.rolos_rate_plans FOR SELECT USING (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_rate_plans_insert" ON public.rolos_rate_plans FOR INSERT WITH CHECK (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_rate_plans_update" ON public.rolos_rate_plans FOR UPDATE USING (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_rate_plans_delete" ON public.rolos_rate_plans FOR DELETE USING (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

-- =============================================
-- 4. rolos_rate_seasons: add fearless_leader
-- =============================================
DROP POLICY IF EXISTS "rolos_rate_seasons_select" ON public.rolos_rate_seasons;
DROP POLICY IF EXISTS "rolos_rate_seasons_insert" ON public.rolos_rate_seasons;
DROP POLICY IF EXISTS "rolos_rate_seasons_update" ON public.rolos_rate_seasons;
DROP POLICY IF EXISTS "rolos_rate_seasons_delete" ON public.rolos_rate_seasons;

CREATE POLICY "rolos_rate_seasons_select" ON public.rolos_rate_seasons FOR SELECT USING (
  EXISTS (SELECT 1 FROM rolos_rate_plans rp WHERE rp.id = rolos_rate_seasons.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);
CREATE POLICY "rolos_rate_seasons_insert" ON public.rolos_rate_seasons FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM rolos_rate_plans rp WHERE rp.id = rolos_rate_seasons.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);
CREATE POLICY "rolos_rate_seasons_update" ON public.rolos_rate_seasons FOR UPDATE USING (
  EXISTS (SELECT 1 FROM rolos_rate_plans rp WHERE rp.id = rolos_rate_seasons.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);
CREATE POLICY "rolos_rate_seasons_delete" ON public.rolos_rate_seasons FOR DELETE USING (
  EXISTS (SELECT 1 FROM rolos_rate_plans rp WHERE rp.id = rolos_rate_seasons.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);

-- =============================================
-- 5. rolos_rate_prices: add fearless_leader
-- =============================================
DROP POLICY IF EXISTS "rolos_rate_prices_select" ON public.rolos_rate_prices;
DROP POLICY IF EXISTS "rolos_rate_prices_insert" ON public.rolos_rate_prices;
DROP POLICY IF EXISTS "rolos_rate_prices_update" ON public.rolos_rate_prices;
DROP POLICY IF EXISTS "rolos_rate_prices_delete" ON public.rolos_rate_prices;

CREATE POLICY "rolos_rate_prices_select" ON public.rolos_rate_prices FOR SELECT USING (
  EXISTS (SELECT 1 FROM rolos_rate_seasons rs JOIN rolos_rate_plans rp ON rs.rate_plan_id = rp.id
    WHERE rs.id = rolos_rate_prices.season_id
    AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);
CREATE POLICY "rolos_rate_prices_insert" ON public.rolos_rate_prices FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM rolos_rate_seasons rs JOIN rolos_rate_plans rp ON rs.rate_plan_id = rp.id
    WHERE rs.id = rolos_rate_prices.season_id
    AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);
CREATE POLICY "rolos_rate_prices_update" ON public.rolos_rate_prices FOR UPDATE USING (
  EXISTS (SELECT 1 FROM rolos_rate_seasons rs JOIN rolos_rate_plans rp ON rs.rate_plan_id = rp.id
    WHERE rs.id = rolos_rate_prices.season_id
    AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);
CREATE POLICY "rolos_rate_prices_delete" ON public.rolos_rate_prices FOR DELETE USING (
  EXISTS (SELECT 1 FROM rolos_rate_seasons rs JOIN rolos_rate_plans rp ON rs.rate_plan_id = rp.id
    WHERE rs.id = rolos_rate_prices.season_id
    AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);

-- =============================================
-- 6. rolos_experience_configs: add fearless_leader
-- =============================================
DROP POLICY IF EXISTS "Admins/devs full access to experience configs" ON public.rolos_experience_configs;
CREATE POLICY "Admins/devs full access to experience configs" ON public.rolos_experience_configs FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

-- =============================================
-- 7. rolos_policies: add fearless_leader
-- =============================================
DROP POLICY IF EXISTS "Admins/devs full access to policies" ON public.rolos_policies;
CREATE POLICY "Admins/devs full access to policies" ON public.rolos_policies FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

-- =============================================
-- 8. rolos_inventory_calendar: add fearless_leader
-- =============================================
DROP POLICY IF EXISTS "Admin/dev full access on inventory calendar" ON public.rolos_inventory_calendar;
CREATE POLICY "Admin/dev full access on inventory calendar" ON public.rolos_inventory_calendar FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

-- =============================================
-- 9. rolos_folios: add fearless_leader
-- =============================================
DROP POLICY IF EXISTS "rolos_folios_select" ON public.rolos_folios;
DROP POLICY IF EXISTS "rolos_folios_insert" ON public.rolos_folios;
DROP POLICY IF EXISTS "rolos_folios_update" ON public.rolos_folios;

CREATE POLICY "rolos_folios_select" ON public.rolos_folios FOR SELECT USING (
  EXISTS (SELECT 1 FROM bookings b WHERE b.id = rolos_folios.booking_id
    AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);
CREATE POLICY "rolos_folios_insert" ON public.rolos_folios FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM bookings b WHERE b.id = rolos_folios.booking_id
    AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);
CREATE POLICY "rolos_folios_update" ON public.rolos_folios FOR UPDATE USING (
  EXISTS (SELECT 1 FROM bookings b WHERE b.id = rolos_folios.booking_id
    AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);

-- =============================================
-- 10. Fix get_user_audit_role to recognize fearless_leader
-- =============================================
CREATE OR REPLACE FUNCTION public.get_user_audit_role(_user_id uuid)
 RETURNS audit_user_role
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'dev') THEN
    RETURN 'dev'::public.audit_user_role;
  END IF;
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'fearless_leader') THEN
    RETURN 'admin'::public.audit_user_role;
  END IF;
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'admin') THEN
    RETURN 'admin'::public.audit_user_role;
  END IF;
  RETURN 'owner'::public.audit_user_role;
END;
$function$;

-- =============================================
-- 11. Also fix can_view_rol_pulse to include fearless_leader
-- =============================================
CREATE OR REPLACE FUNCTION public.can_view_rol_pulse(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = $1 AND role IN ('admin', 'dev', 'fearless_leader')
  );
END;
$function$;
