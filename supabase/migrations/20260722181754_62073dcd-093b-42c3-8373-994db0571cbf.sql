CREATE TABLE public.property_contact_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('reception','landlord','emergency','manager','concierge')),
  name TEXT,
  email TEXT,
  phone TEXT,
  hours TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_contact_details TO authenticated;
GRANT ALL ON public.property_contact_details TO service_role;
GRANT SELECT ON public.property_contact_details TO anon;

ALTER TABLE public.property_contact_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view public contact details"
  ON public.property_contact_details FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "Owners and admins can manage contact details"
  ON public.property_contact_details FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
    OR public.is_property_owner(property_id, auth.uid())
    OR public.is_linked_owner(property_id, auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
    OR public.is_property_owner(property_id, auth.uid())
    OR public.is_linked_owner(property_id, auth.uid())
  );

CREATE INDEX idx_property_contact_details_property_id
  ON public.property_contact_details(property_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_property_contact_details_updated_at
  BEFORE UPDATE ON public.property_contact_details
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();