
-- Create property_owners junction table for additional linked owners
CREATE TABLE public.property_owners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_email TEXT NOT NULL,
  owner_name TEXT,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, user_id)
);

-- Enable RLS
ALTER TABLE public.property_owners ENABLE ROW LEVEL SECURITY;

-- RLS policies for property_owners
CREATE POLICY "Admins and devs can manage property_owners"
  ON public.property_owners FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev') OR has_role(auth.uid(), 'fearless_leader'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev') OR has_role(auth.uid(), 'fearless_leader'));

CREATE POLICY "Owners can view their own linkages"
  ON public.property_owners FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Security definer function to check if user is a linked owner
CREATE OR REPLACE FUNCTION public.is_linked_owner(_property_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_owners
    WHERE property_id = _property_id
      AND user_id = _user_id
  )
$$;

-- Update properties RLS: Owners can view own properties (primary OR linked)
DROP POLICY IF EXISTS "Owners can view own properties" ON public.properties;
CREATE POLICY "Owners can view own properties"
  ON public.properties FOR SELECT
  TO authenticated
  USING (
    owner_email IN (SELECT email FROM profiles WHERE id = auth.uid())
    OR is_linked_owner(id, auth.uid())
  );

DROP POLICY IF EXISTS "Owners can update own properties" ON public.properties;
CREATE POLICY "Owners can update own properties"
  ON public.properties FOR UPDATE
  TO authenticated
  USING (
    owner_email IN (SELECT email FROM profiles WHERE id = auth.uid())
    OR is_linked_owner(id, auth.uid())
  );

-- Update bookings RLS: Linked owners can view/update bookings
DROP POLICY IF EXISTS "Owners can view bookings for their properties" ON public.bookings;
CREATE POLICY "Owners can view bookings for their properties"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      JOIN profiles pr ON p.owner_email = pr.email
      WHERE p.id = bookings.property_id AND pr.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM property_owners po
      WHERE po.property_id = bookings.property_id AND po.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can update bookings for their properties" ON public.bookings;
CREATE POLICY "Owners can update bookings for their properties"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      JOIN profiles pr ON p.owner_email = pr.email
      WHERE p.id = bookings.property_id AND pr.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM property_owners po
      WHERE po.property_id = bookings.property_id AND po.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      JOIN profiles pr ON p.owner_email = pr.email
      WHERE p.id = bookings.property_id AND pr.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM property_owners po
      WHERE po.property_id = bookings.property_id AND po.user_id = auth.uid()
    )
  );

-- Index for fast lookups
CREATE INDEX idx_property_owners_property_id ON public.property_owners(property_id);
CREATE INDEX idx_property_owners_user_id ON public.property_owners(user_id);
