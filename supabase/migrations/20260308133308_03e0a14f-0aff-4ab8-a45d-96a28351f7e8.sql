
-- Many-to-many linking table: rate plans ↔ room types
CREATE TABLE public.rolos_rate_plan_room_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rate_plan_id UUID NOT NULL REFERENCES public.rolos_rate_plans(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES public.rolos_room_types(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (rate_plan_id, room_type_id)
);

-- RLS
ALTER TABLE public.rolos_rate_plan_room_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage rate plan room type links"
  ON public.rolos_rate_plan_room_types
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
