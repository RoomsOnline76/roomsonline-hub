-- Drop and recreate the category check constraint to include 'dining'
ALTER TABLE local_experiences DROP CONSTRAINT IF EXISTS local_experiences_category_check;

-- Add the updated constraint with dining category
ALTER TABLE local_experiences ADD CONSTRAINT local_experiences_category_check 
CHECK (category IS NULL OR category IN ('nature', 'culture', 'food', 'adventure', 'relaxation', 'wellness', 'dining'));