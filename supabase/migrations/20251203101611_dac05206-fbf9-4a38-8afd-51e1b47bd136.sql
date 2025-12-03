-- Add permanently_deleted_at column to properties table
ALTER TABLE public.properties 
ADD COLUMN permanently_deleted_at timestamp with time zone DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.properties.permanently_deleted_at IS 'Timestamp when property was permanently deleted. Historical bookings/revenue data is retained.';