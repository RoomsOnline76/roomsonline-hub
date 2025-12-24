-- Add ROL Spec fields to properties table
ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS hero_listing boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS editorial_rating text,
ADD COLUMN IF NOT EXISTS why_we_chose_this_place text,
ADD COLUMN IF NOT EXISTS who_this_suits text,
ADD COLUMN IF NOT EXISTS what_its_really_like text,
ADD COLUMN IF NOT EXISTS why_this_place_matters text,
ADD COLUMN IF NOT EXISTS who_its_not_for text,
ADD COLUMN IF NOT EXISTS owner_notes text,
ADD COLUMN IF NOT EXISTS navigation_tags text[] DEFAULT '{}';

-- Add comment for editorial rating values
COMMENT ON COLUMN public.properties.editorial_rating IS 'Values: a_good_find, quietly_excellent, exceptionally_considered, standout_character, truly_special, once_in_a_while';

-- Add comment for navigation tags
COMMENT ON COLUMN public.properties.navigation_tags IS 'Experience and editorial navigation tags for property categorization';