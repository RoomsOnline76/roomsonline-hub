CREATE UNIQUE INDEX IF NOT EXISTS bookings_ru_external_reservation_uidx
  ON public.bookings (external_reservation_id)
  WHERE integration_type IN ('rentalsunited', 'rentalsunited_lead')
    AND external_reservation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ru_channel_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_username text NOT NULL,
  channel_key text NOT NULL,
  channel_label text NOT NULL,
  ru_channel_id text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ru_channel_creators_username_uidx
  ON public.ru_channel_creators (lower(creator_username));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ru_channel_creators TO authenticated;
GRANT ALL ON public.ru_channel_creators TO service_role;

ALTER TABLE public.ru_channel_creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view RU channel creators"
  ON public.ru_channel_creators FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can manage RU channel creators"
  ON public.ru_channel_creators FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'fearless_leader')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'fearless_leader')
  );

CREATE TRIGGER update_ru_channel_creators_updated_at
  BEFORE UPDATE ON public.ru_channel_creators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ru_channel_creators (creator_username, channel_key, channel_label, ru_channel_id, notes)
VALUES
  ('LekkeSlaap', 'lekkeslaap', 'LekkeSlaap', '723231', 'Seeded default'),
  ('Booking.com', 'booking', 'Booking.com', NULL, 'Seeded default'),
  ('Airbnb', 'airbnb', 'Airbnb', NULL, 'Seeded default'),
  ('Expedia', 'expedia', 'Expedia', NULL, 'Seeded default'),
  ('Vrbo', 'vrbo', 'Vrbo', NULL, 'Seeded default'),
  ('HomeAway', 'vrbo', 'Vrbo', NULL, 'Seeded default'),
  ('Rentals United', 'rentals_united', 'Rentals United (direct)', NULL, 'Seeded default')
ON CONFLICT DO NOTHING;