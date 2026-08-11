CREATE OR REPLACE FUNCTION public.can_access_channel_property(_property_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    ((public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'dev'))
      AND public.admin_scope_allows(_user_id, _property_id)) OR
    public.is_property_owner(_property_id, _user_id) OR
    public.is_linked_owner(_property_id, _user_id) OR
    EXISTS (
      SELECT 1 FROM public.property_staff
      WHERE property_id = _property_id
        AND user_id = _user_id
        AND is_active = true
        AND staff_role IN ('general_manager', 'front_desk')
    )
$$;

CREATE OR REPLACE FUNCTION public.can_access_crm_scope(_portfolio_id uuid, _property_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    (
      (public.has_role(_user_id, 'admin')
        OR public.has_role(_user_id, 'dev')
        OR public.has_role(_user_id, 'fearless_leader'))
      AND NOT public.is_scoped_admin(_user_id)
    )
    OR (_property_id IS NOT NULL AND public.can_access_property(_property_id, _user_id))
    OR (
      _portfolio_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.property_portfolio_members m
        WHERE m.portfolio_id = _portfolio_id
          AND public.can_access_property(m.property_id, _user_id)
      )
    )
    OR (
      _portfolio_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.property_portfolios p
        WHERE p.id = _portfolio_id AND p.owner_id = _user_id
      )
    )
$$;
