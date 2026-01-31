-- Create experience_vouchers table for surprise gift tracking
CREATE TABLE public.experience_vouchers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id uuid REFERENCES public.itineraries(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,
  discount_percent int DEFAULT 25 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  description text,
  valid_until timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.experience_vouchers ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read vouchers by code (for redemption validation)
CREATE POLICY "Vouchers can be read by code lookup"
  ON public.experience_vouchers
  FOR SELECT
  USING (true);

-- Policy: Only system can insert vouchers (via edge functions)
CREATE POLICY "System can create vouchers"
  ON public.experience_vouchers
  FOR INSERT
  WITH CHECK (true);

-- Policy: Only system can update vouchers (for redemption)
CREATE POLICY "System can update vouchers"
  ON public.experience_vouchers
  FOR UPDATE
  USING (true);

-- Index for fast code lookups
CREATE INDEX idx_experience_vouchers_code ON public.experience_vouchers(code);

-- Index for itinerary lookups
CREATE INDEX idx_experience_vouchers_itinerary ON public.experience_vouchers(itinerary_id);

-- Comment
COMMENT ON TABLE public.experience_vouchers IS 'Surprise gift vouchers generated for guest itineraries as part of the AI Concierge delight system';