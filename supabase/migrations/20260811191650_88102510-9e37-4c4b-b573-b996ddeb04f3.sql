-- 1. Scope table
CREATE TABLE IF NOT EXISTS public.scoped_admin_properties (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, property_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scoped_admin_properties TO authenticated;
GRANT ALL ON public.scoped_admin_properties TO service_role;

ALTER TABLE public.scoped_admin_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own admin scope"
  ON public.scoped_admin_properties FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_scoped_admin_properties_updated_at
  BEFORE UPDATE ON public.scoped_admin_properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_scoped_admin_properties_user ON public.scoped_admin_properties(user_id);

-- 2. Helpers
CREATE OR REPLACE FUNCTION public.is_scoped_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.scoped_admin_properties WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.admin_scope_allows(_user_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.scoped_admin_properties WHERE user_id = _user_id)
     OR EXISTS (
       SELECT 1 FROM public.scoped_admin_properties
       WHERE user_id = _user_id AND property_id = _property_id
     )
$$;

-- Admins/devs can manage scope rows (defined after helpers so full admins keep control)
CREATE POLICY "Full admins manage admin scope"
  ON public.scoped_admin_properties FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'))
    AND NOT public.is_scoped_admin(auth.uid())
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'))
    AND NOT public.is_scoped_admin(auth.uid())
  );

-- 3. Teach the chokepoint functions about the scope
CREATE OR REPLACE FUNCTION public.can_access_property(_property_id uuid, _user_id uuid)
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
    )
$$;

-- 4. Property-scoped admin policies on tables that call has_role directly
DROP POLICY IF EXISTS "Admins and devs can view all bookings" ON public.bookings;
CREATE POLICY "Admins and devs can view all bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'))
    AND public.admin_scope_allows(auth.uid(), property_id)
  );

DROP POLICY IF EXISTS "Admins and devs can update all bookings" ON public.bookings;
CREATE POLICY "Admins and devs can update all bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'))
    AND public.admin_scope_allows(auth.uid(), property_id)
  );

DROP POLICY IF EXISTS "Admins and devs can update properties" ON public.properties;
CREATE POLICY "Admins and devs can update properties"
  ON public.properties FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'))
    AND public.admin_scope_allows(auth.uid(), id)
  );

DROP POLICY IF EXISTS "Admins and devs can delete properties" ON public.properties;
CREATE POLICY "Admins and devs can delete properties"
  ON public.properties FOR DELETE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'))
    AND public.admin_scope_allows(auth.uid(), id)
  );

DROP POLICY IF EXISTS "Admins and devs can manage all portfolios" ON public.property_portfolios;
CREATE POLICY "Admins and devs can manage all portfolios"
  ON public.property_portfolios FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'))
    AND (
      NOT public.is_scoped_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.property_portfolio_members m
        JOIN public.scoped_admin_properties s ON s.property_id = m.property_id
        WHERE m.portfolio_id = property_portfolios.id AND s.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'))
    AND NOT public.is_scoped_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins and devs have full access to ru_owner_accounts" ON public.ru_owner_accounts;
CREATE POLICY "Admins and devs have full access to ru_owner_accounts"
  ON public.ru_owner_accounts FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'))
    AND (
      NOT public.is_scoped_admin(auth.uid())
      OR (property_id IS NOT NULL AND public.admin_scope_allows(auth.uid(), property_id))
      OR (property_id IS NULL AND EXISTS (
            SELECT 1 FROM public.property_portfolio_members m
            JOIN public.scoped_admin_properties s ON s.property_id = m.property_id
            WHERE m.portfolio_id = ru_owner_accounts.portfolio_id AND s.user_id = auth.uid()
          ))
    )
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'))
    AND NOT public.is_scoped_admin(auth.uid())
  );

-- 5. Seed the RU certification auditor scope
INSERT INTO public.scoped_admin_properties (user_id, property_id)
VALUES
  ('c696495c-00f3-46c4-b4ab-ce9147e558b9', '76f524f3-8229-4097-b45d-18489f897195'),
  ('c696495c-00f3-46c4-b4ab-ce9147e558b9', 'af57b357-9c95-47f5-b7d5-43d3b2f05bb7')
ON CONFLICT (user_id, property_id) DO NOTHING;
