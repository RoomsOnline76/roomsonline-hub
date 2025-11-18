-- Add avatar_url to profiles table for owner profile pictures
ALTER TABLE public.profiles
ADD COLUMN avatar_url TEXT,
ADD COLUMN role TEXT DEFAULT 'user';

-- Create a function to get user profile with avatar
CREATE OR REPLACE FUNCTION get_user_profile(user_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, email, full_name, avatar_url, role
  FROM public.profiles
  WHERE id = user_id;
$$;