-- Drop the existing foreign key constraint on user_id since anonymous bookings need to work
-- The user_id field will be nullable for anonymous/guest bookings

-- First, make user_id nullable
ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL;

-- Drop the existing foreign key constraint if it exists
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_user_id_fkey;