-- Itinerary Booking System Tables
-- Phase 1: Foundation

-- Main itineraries table
CREATE TABLE public.itineraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User linkage (nullable for guest/anonymous)
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  
  -- Itinerary metadata
  title text,
  
  -- Status workflow
  status text NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'pending', 'confirmed', 'partial', 'cancelled')),
  
  -- Stays array (JSONB with GIN index)
  stays jsonb NOT NULL DEFAULT '[]',
  
  -- Aggregated totals
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  total_nights integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  
  -- Guest details (single entry point)
  guest_name text,
  guest_email text,
  guest_phone text,
  special_requests text,
  
  -- PDF artifact
  brochure_pdf_url text,
  brochure_generated_at timestamptz,
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

-- Indexes for efficient querying
CREATE INDEX idx_itineraries_user ON public.itineraries(user_id);
CREATE INDEX idx_itineraries_session ON public.itineraries(session_id);
CREATE INDEX idx_itineraries_status ON public.itineraries(status);
CREATE INDEX idx_itineraries_stays ON public.itineraries USING GIN (stays);

-- Linking table for itinerary to bookings relationship
CREATE TABLE public.itinerary_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  stay_index integer NOT NULL,
  property_id uuid REFERENCES public.properties(id),
  status text NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled', 'rolled_back')),
  external_reservation_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_itinerary_bookings_itinerary ON public.itinerary_bookings(itinerary_id);
CREATE INDEX idx_itinerary_bookings_booking ON public.itinerary_bookings(booking_id);

-- Enable RLS
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_bookings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for itineraries
-- Users can view their own itineraries (by user_id or session_id)
CREATE POLICY "Users can view own itineraries" 
ON public.itineraries 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR session_id IS NOT NULL
);

-- Users can create itineraries
CREATE POLICY "Users can create itineraries" 
ON public.itineraries 
FOR INSERT 
WITH CHECK (true);

-- Users can update their own itineraries
CREATE POLICY "Users can update own itineraries" 
ON public.itineraries 
FOR UPDATE 
USING (
  auth.uid() = user_id 
  OR (user_id IS NULL AND session_id IS NOT NULL)
);

-- Users can delete draft itineraries
CREATE POLICY "Users can delete draft itineraries" 
ON public.itineraries 
FOR DELETE 
USING (
  status = 'draft' 
  AND (auth.uid() = user_id OR (user_id IS NULL AND session_id IS NOT NULL))
);

-- RLS Policies for itinerary_bookings
CREATE POLICY "Users can view own itinerary bookings" 
ON public.itinerary_bookings 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.itineraries i 
    WHERE i.id = itinerary_id 
    AND (i.user_id = auth.uid() OR i.session_id IS NOT NULL)
  )
);

CREATE POLICY "System can manage itinerary bookings" 
ON public.itinerary_bookings 
FOR ALL 
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_itineraries_updated_at
BEFORE UPDATE ON public.itineraries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_itinerary_bookings_updated_at
BEFORE UPDATE ON public.itinerary_bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();