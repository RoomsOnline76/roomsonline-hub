-- Drop existing SELECT policy that restricts admins/devs from seeing owner articles
DROP POLICY IF EXISTS "Users can read matching help articles" ON help_articles;

-- Create new policy allowing admins/devs to see ALL published articles for management
CREATE POLICY "Users can read matching help articles" ON help_articles
FOR SELECT TO authenticated
USING (
  is_published = true AND (
    -- Admins and devs can read ALL articles (for management purposes)
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR
    -- Regular users see 'all' or their role
    'all'::text = ANY (role_target) OR 
    get_user_help_role(auth.uid()) = ANY (role_target)
  )
);