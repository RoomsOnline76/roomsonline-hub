-- Add intervention tracking column to bookings table
ALTER TABLE bookings 
ADD COLUMN requires_intervention boolean DEFAULT false;

-- Create partial index for quick filtering of bookings needing attention
CREATE INDEX idx_bookings_requires_intervention 
ON bookings(requires_intervention) 
WHERE requires_intervention = true;