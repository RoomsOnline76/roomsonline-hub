
-- Phase 3: Messaging Engine tables

-- Message templates for automated guest communication
CREATE TABLE public.rolos_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_event text NOT NULL CHECK (trigger_event IN ('booking_confirmed', 'pre_arrival', 'check_in', 'check_out', 'payment_request', 'cancellation', 'manual')),
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
  is_active boolean NOT NULL DEFAULT true,
  send_offset_hours integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Message queue for scheduled/pending messages
CREATE TABLE public.rolos_message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  reservation_id uuid,
  template_id uuid REFERENCES public.rolos_message_templates(id) ON DELETE SET NULL,
  recipient_email text,
  recipient_phone text,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Message log for sent messages (audit trail)
CREATE TABLE public.rolos_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  reservation_id uuid,
  template_id uuid REFERENCES public.rolos_message_templates(id) ON DELETE SET NULL,
  recipient_email text,
  recipient_phone text,
  channel text NOT NULL DEFAULT 'email',
  subject text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'bounced', 'failed')),
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rolos_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_message_log ENABLE ROW LEVEL SECURITY;

-- RLS policies using can_access_property
CREATE POLICY "Property access for message templates"
  ON public.rolos_message_templates FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()));

CREATE POLICY "Property access for message queue"
  ON public.rolos_message_queue FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()));

CREATE POLICY "Property access for message log"
  ON public.rolos_message_log FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()));

-- Indexes
CREATE INDEX idx_message_templates_property ON public.rolos_message_templates(property_id);
CREATE INDEX idx_message_queue_status ON public.rolos_message_queue(status, scheduled_at);
CREATE INDEX idx_message_queue_property ON public.rolos_message_queue(property_id);
CREATE INDEX idx_message_log_property ON public.rolos_message_log(property_id);
CREATE INDEX idx_message_log_reservation ON public.rolos_message_log(reservation_id);
