-- Add pending_property_data column to store property details entered during signing
ALTER TABLE public.owner_contracts 
ADD COLUMN IF NOT EXISTS pending_property_data JSONB,
ADD COLUMN IF NOT EXISTS is_new_owner BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.owner_contracts.pending_property_data IS 'Temporarily stores property details entered by new owner during contract signing';
COMMENT ON COLUMN public.owner_contracts.is_new_owner IS 'Flag indicating this contract is for a new owner without existing properties';