
CREATE TABLE public.rolos_brand_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL UNIQUE,
  business_name text,
  business_address jsonb DEFAULT '{}'::jsonb,
  vat_number text,
  email_footer_text text,
  custom_tagline text,
  favicon_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.rolos_brand_config ENABLE ROW LEVEL SECURITY;

-- Property owners can manage their own brand config
CREATE POLICY "Property owners can manage their brand config"
  ON public.rolos_brand_config
  FOR ALL
  TO authenticated
  USING (
    public.is_linked_owner(property_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  )
  WITH CHECK (
    public.is_linked_owner(property_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  );

-- updated_at trigger
CREATE TRIGGER set_rolos_brand_config_updated_at
  BEFORE UPDATE ON public.rolos_brand_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
