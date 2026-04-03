
CREATE TABLE public.property_specials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'accommodation',
  name text NOT NULL,
  description text,
  special_type text NOT NULL DEFAULT 'discount',
  discount_percent numeric,
  fixed_amount numeric,
  fixed_price numeric,
  currency text DEFAULT 'ZAR',
  valid_from date,
  valid_to date,
  min_stay integer,
  max_stay integer,
  applicable_room_ids uuid[],
  included_items jsonb,
  terms text,
  images jsonb,
  is_active boolean DEFAULT true,
  is_public boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.property_specials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Property specials full access for privileged users" ON public.property_specials
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.has_role(auth.uid(), 'fearless_leader') OR
    public.is_property_owner(property_id, auth.uid()) OR
    public.is_linked_owner(property_id, auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.has_role(auth.uid(), 'fearless_leader') OR
    public.is_property_owner(property_id, auth.uid()) OR
    public.is_linked_owner(property_id, auth.uid())
  );

CREATE POLICY "Public read active specials" ON public.property_specials
  FOR SELECT TO anon
  USING (is_active = true AND is_public = true);

CREATE INDEX idx_property_specials_property_id ON public.property_specials(property_id);
CREATE INDEX idx_property_specials_category ON public.property_specials(category);
CREATE INDEX idx_property_specials_active ON public.property_specials(property_id) WHERE is_active = true;

CREATE TRIGGER update_property_specials_updated_at
  BEFORE UPDATE ON public.property_specials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
