-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view own itineraries" ON public.itineraries;

-- Create a new policy that allows:
-- 1. Users to view their own itineraries (by user_id)
-- 2. Session-based access for anonymous users
-- 3. Public viewing of confirmed itineraries by ID (for confirmation page links in emails)
CREATE POLICY "Users can view itineraries" 
ON public.itineraries 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR session_id IS NOT NULL
  OR status IN ('confirmed', 'completed')
);

-- Add comment explaining the policy
COMMENT ON POLICY "Users can view itineraries" ON public.itineraries IS 
'Allows: (1) authenticated users to view their own itineraries, (2) session-based access, (3) public viewing of confirmed/completed itineraries for email confirmation links';