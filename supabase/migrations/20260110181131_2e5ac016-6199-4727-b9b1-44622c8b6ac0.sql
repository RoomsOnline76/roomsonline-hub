-- Create table for tracking NightsBridge booking sessions
CREATE TABLE public.nightsbridge_booking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_ref TEXT UNIQUE NOT NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  property_name TEXT,
  session_started_at TIMESTAMPTZ DEFAULT now(),
  check_in_date DATE,
  check_out_date DATE,
  currency TEXT DEFAULT 'ZAR',
  user_agent TEXT,
  
  -- Matching fields (populated by API sync)
  matched_reservation_id TEXT,
  matched_at TIMESTAMPTZ,
  match_confidence TEXT CHECK (match_confidence IN ('high', 'medium', 'low')),
  
  -- Financials (populated when matched)
  estimated_revenue DECIMAL(10,2),
  revenue_currency TEXT,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'expired', 'abandoned')),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '48 hours'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.nightsbridge_booking_sessions ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for booking sessions from public users)
CREATE POLICY "Anyone can create booking sessions"
ON public.nightsbridge_booking_sessions
FOR INSERT
WITH CHECK (true);

-- Only admins/devs can view sessions
CREATE POLICY "Admins can view all booking sessions"
ON public.nightsbridge_booking_sessions
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'dev')
);

-- Only admins/devs can update sessions
CREATE POLICY "Admins can update booking sessions"
ON public.nightsbridge_booking_sessions
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'dev')
);

-- Create indexes for efficient querying
CREATE INDEX idx_nb_sessions_property_status ON public.nightsbridge_booking_sessions(property_id, status);
CREATE INDEX idx_nb_sessions_tracking_ref ON public.nightsbridge_booking_sessions(tracking_ref);
CREATE INDEX idx_nb_sessions_session_started ON public.nightsbridge_booking_sessions(session_started_at);
CREATE INDEX idx_nb_sessions_expires ON public.nightsbridge_booking_sessions(expires_at) WHERE status = 'pending';

-- Trigger for updated_at
CREATE TRIGGER update_nightsbridge_booking_sessions_updated_at
  BEFORE UPDATE ON public.nightsbridge_booking_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();