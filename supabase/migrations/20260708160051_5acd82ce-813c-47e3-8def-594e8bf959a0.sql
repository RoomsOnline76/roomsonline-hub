
-- ── rolos_reservation_policies ─────────────────────────────────
CREATE TABLE public.rolos_reservation_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('general','non_refundable','custom')),
  rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  source_policy_id UUID REFERENCES public.rolos_reservation_policies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_reservation_policies TO authenticated;
GRANT ALL ON public.rolos_reservation_policies TO service_role;

ALTER TABLE public.rolos_reservation_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/devs full access reservation policies"
  ON public.rolos_reservation_policies FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
  );

CREATE POLICY "Owners read own reservation policies"
  ON public.rolos_reservation_policies FOR SELECT
  TO authenticated
  USING (
    public.is_property_owner(property_id, auth.uid())
    OR public.is_linked_owner(property_id, auth.uid())
  );

-- Only one default per property
CREATE UNIQUE INDEX rolos_reservation_policies_one_default
  ON public.rolos_reservation_policies(property_id)
  WHERE is_default = true;

CREATE INDEX rolos_reservation_policies_property_idx
  ON public.rolos_reservation_policies(property_id);

CREATE TRIGGER set_rolos_reservation_policies_updated_at
  BEFORE UPDATE ON public.rolos_reservation_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── rolos_policy_rate_links ────────────────────────────────────
CREATE TABLE public.rolos_policy_rate_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES public.rolos_reservation_policies(id) ON DELETE CASCADE,
  rate_plan_id UUID REFERENCES public.rolos_rate_plans(id) ON DELETE CASCADE,
  channel TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_policy_rate_links TO authenticated;
GRANT ALL ON public.rolos_policy_rate_links TO service_role;

ALTER TABLE public.rolos_policy_rate_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/devs full access policy rate links"
  ON public.rolos_policy_rate_links FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
  );

CREATE POLICY "Owners read own policy rate links"
  ON public.rolos_policy_rate_links FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rolos_reservation_policies p
      WHERE p.id = policy_id
        AND (
          public.is_property_owner(p.property_id, auth.uid())
          OR public.is_linked_owner(p.property_id, auth.uid())
        )
    )
  );

CREATE UNIQUE INDEX rolos_policy_rate_links_uniq
  ON public.rolos_policy_rate_links(policy_id, COALESCE(rate_plan_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(channel, ''));

CREATE INDEX rolos_policy_rate_links_policy_idx
  ON public.rolos_policy_rate_links(policy_id);
CREATE INDEX rolos_policy_rate_links_rate_plan_idx
  ON public.rolos_policy_rate_links(rate_plan_id);
