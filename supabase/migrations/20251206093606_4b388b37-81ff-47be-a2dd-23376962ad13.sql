-- Drop existing check constraint
ALTER TABLE public.pms_mappings DROP CONSTRAINT IF EXISTS pms_mappings_mapping_type_check;

-- Add updated check constraint that includes 'field_mappings'
ALTER TABLE public.pms_mappings ADD CONSTRAINT pms_mappings_mapping_type_check 
  CHECK (mapping_type = ANY (ARRAY['room_type'::text, 'rate_type'::text, 'charge_type'::text, 'payment_type'::text, 'client'::text, 'invoice'::text, 'field_mappings'::text]));