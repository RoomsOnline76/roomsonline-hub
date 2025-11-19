-- Create property_rates table to cache rates from external systems
CREATE TABLE IF NOT EXISTS public.property_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL,
  rate_type TEXT NOT NULL, -- 'SingleRate', 'PerPersonRate', 'UnitRate'
  meal_type TEXT, -- 'Breakfast', 'SelfCatering', 'FullBoard', 'RoomOnly'
  date DATE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  external_system TEXT NOT NULL, -- 'nightsbridge', 'checkfront', etc.
  external_rate_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(property_id, room_type, rate_type, meal_type, date, external_system)
);

-- Create property_availability table to cache availability from external systems
CREATE TABLE IF NOT EXISTS public.property_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL,
  date DATE NOT NULL,
  available_units INTEGER NOT NULL DEFAULT 0,
  is_stop_sell BOOLEAN DEFAULT FALSE,
  minimum_stay INTEGER,
  maximum_stay INTEGER,
  lead_days_advance INTEGER,
  lead_days_post INTEGER,
  external_system TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(property_id, room_type, date, external_system)
);

-- Create booking_sync_status table to track booking synchronization
CREATE TABLE IF NOT EXISTS public.booking_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  external_system TEXT NOT NULL,
  external_booking_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'synced', 'failed', 'cancelled'
  sync_attempts INTEGER DEFAULT 0,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(booking_id, external_system)
);

-- Create sync_logs table for debugging and monitoring
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  external_system TEXT NOT NULL,
  sync_type TEXT NOT NULL, -- 'rates', 'availability', 'booking_push', 'booking_pull', 'webhook'
  status TEXT NOT NULL, -- 'success', 'error', 'warning'
  message TEXT,
  request_data JSONB,
  response_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_property_rates_property_date ON public.property_rates(property_id, date);
CREATE INDEX IF NOT EXISTS idx_property_availability_property_date ON public.property_availability(property_id, date);
CREATE INDEX IF NOT EXISTS idx_booking_sync_status_booking ON public.booking_sync_status(booking_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_property ON public.sync_logs(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_booking ON public.sync_logs(booking_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.property_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for property_rates
CREATE POLICY "Anyone can view rates for active properties"
  ON public.property_rates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties 
      WHERE properties.id = property_rates.property_id 
      AND properties.is_active = true
    )
  );

CREATE POLICY "Admins can manage all rates"
  ON public.property_rates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for property_availability
CREATE POLICY "Anyone can view availability for active properties"
  ON public.property_availability FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties 
      WHERE properties.id = property_availability.property_id 
      AND properties.is_active = true
    )
  );

CREATE POLICY "Admins can manage all availability"
  ON public.property_availability FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for booking_sync_status
CREATE POLICY "Users can view their own booking sync status"
  ON public.booking_sync_status FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings 
      WHERE bookings.id = booking_sync_status.booking_id 
      AND bookings.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all booking sync status"
  ON public.booking_sync_status FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert booking sync status"
  ON public.booking_sync_status FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update booking sync status"
  ON public.booking_sync_status FOR UPDATE
  USING (true);

-- RLS Policies for sync_logs
CREATE POLICY "Admins can view all sync logs"
  ON public.sync_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert sync logs"
  ON public.sync_logs FOR INSERT
  WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_property_rates_updated_at
  BEFORE UPDATE ON public.property_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_property_availability_updated_at
  BEFORE UPDATE ON public.property_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_booking_sync_status_updated_at
  BEFORE UPDATE ON public.booking_sync_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();