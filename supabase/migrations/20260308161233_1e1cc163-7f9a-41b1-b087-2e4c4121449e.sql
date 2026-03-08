
-- Add commission_type to property_commercial_terms
ALTER TABLE property_commercial_terms
  ADD COLUMN commission_type text NOT NULL DEFAULT 'listing';

-- Add a validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_commission_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.commission_type NOT IN ('listing', 'pms') THEN
    RAISE EXCEPTION 'commission_type must be listing or pms';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_commission_type_trigger
  BEFORE INSERT OR UPDATE ON property_commercial_terms
  FOR EACH ROW EXECUTE FUNCTION validate_commission_type();

-- Add commission_type to bookings
ALTER TABLE bookings ADD COLUMN commission_type text DEFAULT 'listing';

-- Drop the unique constraint if it exists on property_commercial_terms to allow two active rows per property
-- Create a unique index for (property_id, commission_type, effective_from) to prevent duplicates per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_pct_property_type_effective 
  ON property_commercial_terms (property_id, commission_type, effective_from);
