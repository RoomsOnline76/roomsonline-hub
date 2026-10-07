CREATE OR REPLACE FUNCTION public.rep_property_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT r.property_id FROM public.property_referrals r
  JOIN public.sales_reps s ON s.id = r.rep_id
  WHERE s.user_id = _user_id AND s.is_active = true AND r.status::text <> 'churned'
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_rep(_property_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_user_id, 'sales_rep')
     AND EXISTS (SELECT 1 FROM public.rep_property_ids(_user_id) p WHERE p = _property_id)
$$;

GRANT EXECUTE ON FUNCTION public.rep_property_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_rep(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_property(_property_id uuid, _user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    ((public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'dev'))
      AND public.admin_scope_allows(_user_id, _property_id)) OR
    public.is_property_owner(_property_id, _user_id) OR
    public.is_linked_owner(_property_id, _user_id) OR
    public.is_assigned_rep(_property_id, _user_id) OR
    EXISTS (SELECT 1 FROM public.property_staff
      WHERE property_id = _property_id AND user_id = _user_id AND is_active = true)
$function$;