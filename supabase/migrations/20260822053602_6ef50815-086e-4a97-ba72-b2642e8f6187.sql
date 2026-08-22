DROP POLICY IF EXISTS "Staff can view background jobs" ON public.background_jobs;

CREATE POLICY "Admins and developers can view background jobs"
ON public.background_jobs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);