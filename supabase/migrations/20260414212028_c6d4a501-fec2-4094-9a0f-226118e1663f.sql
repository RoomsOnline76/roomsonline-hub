
CREATE TABLE public.ru_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  ru_reservation_id text,
  ru_property_id text,
  property_id uuid REFERENCES public.properties(id),
  raw_xml text,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ru_notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ru_notifications_event_type ON public.ru_notifications(event_type);
CREATE INDEX idx_ru_notifications_ru_property_id ON public.ru_notifications(ru_property_id);
CREATE INDEX idx_ru_notifications_processed ON public.ru_notifications(processed);
