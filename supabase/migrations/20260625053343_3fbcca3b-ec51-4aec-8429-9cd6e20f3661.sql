
-- 1) itineraries: drop public exposure of confirmed/completed records
DROP POLICY IF EXISTS "Users can view itineraries" ON public.itineraries;
CREATE POLICY "Users can view itineraries"
ON public.itineraries
FOR SELECT
USING (
  ((auth.uid() IS NOT NULL) AND (auth.uid() = user_id))
  OR ((user_id IS NULL) AND (session_id IS NOT NULL) AND (session_id = COALESCE(((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text), ''::text)))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'dev'::public.app_role)
);

-- 2) properties: hide owner_email / owner_name from anonymous (unauthenticated) callers
REVOKE SELECT (owner_email, owner_name) ON public.properties FROM anon;

-- 3) rolos_rate_plan_room_types: replace permissive ALL policy with ownership-scoped ones
DROP POLICY IF EXISTS "Authenticated users can manage rate plan room type links" ON public.rolos_rate_plan_room_types;

CREATE POLICY "rolos_rate_plan_room_types_select"
ON public.rolos_rate_plan_room_types
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rolos_rate_plans rp
    WHERE rp.id = rolos_rate_plan_room_types.rate_plan_id
      AND (
        public.is_property_owner(rp.property_id, auth.uid())
        OR public.is_linked_owner(rp.property_id, auth.uid())
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'dev'::public.app_role)
        OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
      )
  )
);

CREATE POLICY "rolos_rate_plan_room_types_insert"
ON public.rolos_rate_plan_room_types
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rolos_rate_plans rp
    WHERE rp.id = rolos_rate_plan_room_types.rate_plan_id
      AND (
        public.is_property_owner(rp.property_id, auth.uid())
        OR public.is_linked_owner(rp.property_id, auth.uid())
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'dev'::public.app_role)
        OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
      )
  )
);

CREATE POLICY "rolos_rate_plan_room_types_update"
ON public.rolos_rate_plan_room_types
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rolos_rate_plans rp
    WHERE rp.id = rolos_rate_plan_room_types.rate_plan_id
      AND (
        public.is_property_owner(rp.property_id, auth.uid())
        OR public.is_linked_owner(rp.property_id, auth.uid())
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'dev'::public.app_role)
        OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rolos_rate_plans rp
    WHERE rp.id = rolos_rate_plan_room_types.rate_plan_id
      AND (
        public.is_property_owner(rp.property_id, auth.uid())
        OR public.is_linked_owner(rp.property_id, auth.uid())
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'dev'::public.app_role)
        OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
      )
  )
);

CREATE POLICY "rolos_rate_plan_room_types_delete"
ON public.rolos_rate_plan_room_types
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rolos_rate_plans rp
    WHERE rp.id = rolos_rate_plan_room_types.rate_plan_id
      AND (
        public.is_property_owner(rp.property_id, auth.uid())
        OR public.is_linked_owner(rp.property_id, auth.uid())
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'dev'::public.app_role)
        OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
      )
  )
);
