CREATE TABLE public.property_partner_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  partner_name text NOT NULL,
  title text NOT NULL,
  description text,
  redemption_instructions text,
  redemption_code text,
  partner_url text,
  partner_contact text,
  image_url text,
  valid_from date,
  valid_until date,
  max_redemptions integer,
  current_redemptions integer NOT NULL DEFAULT 0,
  min_nights integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.property_partner_offers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_partner_offers TO authenticated;
GRANT ALL ON public.property_partner_offers TO service_role;

ALTER TABLE public.property_partner_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active partner offers"
ON public.property_partner_offers
FOR SELECT
USING (is_active = true);

CREATE POLICY "Property team can manage partner offers"
ON public.property_partner_offers
FOR ALL
TO authenticated
USING (public.can_access_property(property_id, auth.uid()))
WITH CHECK (public.can_access_property(property_id, auth.uid()));

CREATE INDEX idx_partner_offers_property_active
ON public.property_partner_offers (property_id, is_active);

CREATE TRIGGER update_property_partner_offers_updated_at
BEFORE UPDATE ON public.property_partner_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();