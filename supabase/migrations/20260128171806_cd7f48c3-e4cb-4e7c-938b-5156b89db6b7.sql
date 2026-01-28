-- Add dining columns to local_experiences table for restaurant-specific data
ALTER TABLE local_experiences ADD COLUMN IF NOT EXISTS venue_type VARCHAR(50);
ALTER TABLE local_experiences ADD COLUMN IF NOT EXISTS cuisine_type VARCHAR(100);
ALTER TABLE local_experiences ADD COLUMN IF NOT EXISTS reservation_required BOOLEAN DEFAULT false;
ALTER TABLE local_experiences ADD COLUMN IF NOT EXISTS dress_code VARCHAR(50);

-- Add index for category filtering
CREATE INDEX IF NOT EXISTS idx_local_experiences_category ON local_experiences(category);

-- Comment for documentation
COMMENT ON COLUMN local_experiences.venue_type IS 'Type of venue: restaurant, cafe, pub, wine_bar, farm_table, takeaway';
COMMENT ON COLUMN local_experiences.cuisine_type IS 'Cuisine type: French, Farm-to-table, Cape Malay, etc.';
COMMENT ON COLUMN local_experiences.reservation_required IS 'Whether advance booking is required';
COMMENT ON COLUMN local_experiences.dress_code IS 'Dress code requirement if any';