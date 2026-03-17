
-- Add total_units column to hostfully_room_types
ALTER TABLE public.hostfully_room_types ADD COLUMN total_units integer DEFAULT 1;

-- Create hostfully_unit_map table
CREATE TABLE public.hostfully_unit_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id uuid REFERENCES public.hostfully_room_types(id) ON DELETE CASCADE NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  hostfully_uid text NOT NULL,
  unit_number text,
  unit_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_unit_map_room_type ON public.hostfully_unit_map(room_type_id);
CREATE INDEX idx_unit_map_property ON public.hostfully_unit_map(property_id);

-- Enable RLS
ALTER TABLE public.hostfully_unit_map ENABLE ROW LEVEL SECURITY;

-- RLS policies matching hostfully_room_types pattern
CREATE POLICY "Admin/dev can manage unit map"
ON public.hostfully_unit_map
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'dev')
);

CREATE POLICY "Property owners can view unit map"
ON public.hostfully_unit_map
FOR SELECT
TO authenticated
USING (
  public.is_property_owner(property_id, auth.uid()) OR
  public.is_linked_owner(property_id, auth.uid())
);

CREATE POLICY "Property staff can view unit map"
ON public.hostfully_unit_map
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.property_staff
    WHERE property_staff.property_id = hostfully_unit_map.property_id
      AND property_staff.user_id = auth.uid()
      AND property_staff.is_active = true
  )
);
