-- Public read of cancellation policy summary for checkout display
GRANT SELECT ON public.rolos_policies TO anon;

DROP POLICY IF EXISTS "Public read cancellation policies" ON public.rolos_policies;
CREATE POLICY "Public read cancellation policies"
  ON public.rolos_policies FOR SELECT
  TO anon, authenticated
  USING (policy_type = 'cancellation');
