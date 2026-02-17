
-- ============================================================
-- Modify/Cancel Booking: Schema Updates
-- ============================================================

-- 1. Add modify/cancel columns to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS modification_notes JSONB DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES auth.users(id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_bookings_modified_at ON bookings(last_modified_at);

-- 2. Add columns to booking_sync_status
ALTER TABLE booking_sync_status ADD COLUMN IF NOT EXISTS last_action TEXT;
ALTER TABLE booking_sync_status ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE booking_sync_status ADD COLUMN IF NOT EXISTS modification_attempts INTEGER DEFAULT 0;
ALTER TABLE booking_sync_status ADD COLUMN IF NOT EXISTS last_error_message TEXT;

-- 3. Trigger for booking modification audit logging
CREATE OR REPLACE FUNCTION public.log_booking_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) OR 
     (OLD.check_in_date IS DISTINCT FROM NEW.check_in_date) OR 
     (OLD.check_out_date IS DISTINCT FROM NEW.check_out_date) OR
     (OLD.rooms IS DISTINCT FROM NEW.rooms) THEN
    
    NEW.modification_notes = 
      COALESCE(OLD.modification_notes, '[]'::jsonb) || 
      jsonb_build_object(
        'timestamp', NOW(),
        'user_id', COALESCE(auth.uid()::text, 'system'),
        'action', CASE 
          WHEN NEW.status = 'cancelled' THEN 'cancel'
          ELSE 'modify'
        END,
        'changes', jsonb_strip_nulls(jsonb_build_object(
          'old_status', CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN OLD.status END,
          'new_status', CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN NEW.status END,
          'old_check_in', CASE WHEN OLD.check_in_date IS DISTINCT FROM NEW.check_in_date THEN OLD.check_in_date END,
          'new_check_in', CASE WHEN OLD.check_in_date IS DISTINCT FROM NEW.check_in_date THEN NEW.check_in_date END,
          'old_check_out', CASE WHEN OLD.check_out_date IS DISTINCT FROM NEW.check_out_date THEN OLD.check_out_date END,
          'new_check_out', CASE WHEN OLD.check_out_date IS DISTINCT FROM NEW.check_out_date THEN NEW.check_out_date END
        ))
      );
    
    NEW.last_modified_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_log_booking_modification
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.log_booking_modification();
