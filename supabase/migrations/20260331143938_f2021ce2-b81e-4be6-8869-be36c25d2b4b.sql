
CREATE TABLE public.guest_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  guest_email text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  used_for text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.guest_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Index for token lookups
CREATE INDEX idx_guest_portal_tokens_token ON public.guest_portal_tokens(token);
CREATE INDEX idx_guest_portal_tokens_booking ON public.guest_portal_tokens(booking_id);
CREATE INDEX idx_guest_portal_tokens_email ON public.guest_portal_tokens(guest_email);
